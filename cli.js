const solanaWeb3 = require("@solana/web3.js");
const bs58 = require("bs58");
const fs = require("fs");
const readline = require("readline");

// Wallet Setup
const walletPath = "/home/nico/new-kpr.json";
const secretKey = Uint8Array.from(
  JSON.parse(fs.readFileSync(walletPath, "utf8"))
);

const payer = solanaWeb3.Keypair.fromSecretKey(secretKey);
const connection = new solanaWeb3.Connection(
  solanaWeb3.clusterApiUrl("devnet"),
  "confirmed"
);

// Program ID

const programId = new solanaWeb3.PublicKey(
  "Y9nyifuZpRfKLfKt96U7Qqtxpd7TPjDmvSNPxWVeJQN"
);

//Shitty rpc version needed that is not in the web3.js library
// const pythSolanaReceiver = new PythSolanaReceiver({ connection, payer });
// const SOL_PRICE_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
// const solUsdPriceFeedAccount = pythSolanaReceiver
//   .getPriceFeedAccountAddress(0, SOL_PRICE_FEED_ID)
//   .toBase58();

const solUsdPriceFeedAccount = new solanaWeb3.PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
);

const FEED_ID =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// Derive Price Update PDA
async function getPriceUpdatePda() {
  const [pda, bump] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("price_update"), Buffer.from(FEED_ID, "hex")],
    programId
  );
  return pda;
}

// Instruction discriminator for `initialize_market`
const discriminators = {
  initializeMarket: [35, 35, 189, 193, 155, 48, 170, 203], // Precomputed sha256("global:initialize_market").slice(0, 8)
  placeBet: [222, 62, 67, 220, 63, 166, 126, 33],
  resolveMarket: [155, 23, 80, 173, 46, 74, 23, 239],
  getPriceFeed: [110, 252, 205, 111, 43, 23, 155, 134],
  fetchBtcPrice: [218, 72, 78, 5, 219, 85, 91, 157],
  fetchCoinPrice: [173,85,70,71,109,106,163,31],
};

// Utility: Read user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const prompt = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

// Utility: Check if an account exists
async function checkIfAccountExists(connection, pubkey) {
  const accountInfo = await connection.getAccountInfo(pubkey);
  return accountInfo !== null;
}

// Utility: Send and confirm a transaction with logs
async function sendTransactionWithLogs(connection, transaction, signers) {
  try {
    const signature = await solanaWeb3.sendAndConfirmTransaction(
      connection,
      transaction,
      signers
    );
    console.log("Transaction confirmed with signature:", signature);

    // Fetch and display logs
    const txDetails = await connection.getTransaction(signature, {
      commitment: "confirmed",
    });
    if (txDetails && txDetails.meta && txDetails.meta.logMessages) {
      console.log("Transaction Logs:");
      txDetails.meta.logMessages.forEach((log) => console.log(log));
    }
    return signature;
  } catch (err) {
    console.error("Error during transaction:", err);
    throw err;
  }
}

const getExpiryTimestamp = async () => {
  const minutes = parseInt(
    await prompt("Enter expiry time in minutes (e.g., 60 for 1 hour): ")
  );
  if (isNaN(minutes) || minutes <= 0) {
    throw new Error(
      "Invalid input. Please enter a positive number of minutes."
    );
  }

  const currentTime = Math.floor(Date.now() / 1000); // Current Unix time in seconds
  const expiryTimestamp = currentTime + minutes * 60; // Add the minutes converted to seconds

  console.log(
    `Expiry timestamp set to: ${expiryTimestamp} (current time + ${minutes} minutes)`
  );
  return expiryTimestamp;
};

/*

Instruction Functions


*/

// Instruction: Initialize Market
async function initializeMarket(strike, expiry, asset) {
  console.log("Initializing market...");

  // Derive the PDA for the market
  const [marketPda, bump] = solanaWeb3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"), // Static seed
      payer.publicKey.toBuffer(), // Authority public key
      (() => {
        // Strike price as u64 (LE bytes)
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(BigInt(strike), 0);
        return buffer;
      })(),
      (() => {
        // Expiry timestamp as i64 (LE bytes)
        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64LE(BigInt(expiry), 0);
        return buffer;
      })(),
    ],
    programId
  );

  console.log("Derived Market PDA:", marketPda.toString());
  console.log("Derived Bump:", bump);

  const accountExists = await checkIfAccountExists(connection, marketPda);
  if (accountExists) {
    console.log("Market PDA already exists. Skipping initialization.");
    return marketPda;
  }

  // Combine discriminator and parameters into instruction data
  const instructionData = Buffer.alloc(8 + 8 + 8 + 32); // Discriminator (8), Strike (8), Expiry (8), OracleFeed (32)
  Buffer.from(discriminators.initializeMarket).copy(instructionData, 0); // Write discriminator
  instructionData.writeBigUInt64LE(BigInt(strike), 8); // Write strike price
  instructionData.writeBigInt64LE(BigInt(expiry), 16); // Write expiry timestamp
  oracleFeed.toBuffer().copy(instructionData, 24); // Write oracle feed public key

  console.log("Instruction data:", instructionData.toString("hex"));

  // Define the transaction instruction
  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: marketPda, isSigner: false, isWritable: true }, // Market PDA
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // Authority
      {
        pubkey: solanaWeb3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }, // System Program
    ],
    programId,
    data: instructionData, // Instruction data (discriminator + inputs)
  });

  console.log("Instruction created. Sending transaction...");

  // Create and send the transaction
  const transaction = new solanaWeb3.Transaction().add(instruction);
  const signature = await sendTransactionWithLogs(connection, transaction, [
    payer,
  ]);

  console.log(
    "Market initialized successfully. Transaction signature:",
    signature
  );
  return marketPda;
}

async function placeBet(marketPda, amount, outcome) {
  const [betPda, bump] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), marketPda.toBuffer(), payer.publicKey.toBuffer()],
    programId
  );

  const instructionData = Buffer.alloc(17);
  // Insert instruction discriminator here
  Buffer.from(discriminators.placeBet).copy(instructionData, 0); // Write discriminator
  instructionData.writeBigUInt64LE(BigInt(amount), 8);
  instructionData.writeUInt8(outcome, 16);

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: betPda, isSigner: false, isWritable: true },
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: solanaWeb3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId,
    data: instructionData,
  });

  const transaction = new solanaWeb3.Transaction().add(instruction);
  await sendTransactionWithLogs(connection, transaction, [payer]);
  console.log(`Bet placed successfully: ${betPda}`);
}

const price_feeds = {
  btc: {
    feed_id: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    address: "4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo",
  },
  sol: {
    feed_id: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    address: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
  },
  eth: {
    feed_id: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    address: "42amVS4KgzR9rA28tkVYqVXjq9Qa8dcZQMbH5EYFX6XC",
  },
};



async function getPriceFeed(asset) {
  const feedIdStr = price_feeds[asset].feed_id; // Adjust buffer size
  // Insert your instruction discriminator here
  const instructionDiscrimnator = Buffer.from(discriminators.getPriceFeed); // Add discriminator
  const feedIdBuffer = Buffer.from(feedIdStr, "utf8");
  const instructionData = Buffer.concat([
    instructionDiscrimnator,
    feedIdBuffer,
  ]);

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      {
        pubkey: new solanaWeb3.PublicKey(price_feeds[asset].address),
        isSigner: false,
        isWritable: false,
      },
    ],
    programId,
    data: instructionData,
  });

  const transaction = new solanaWeb3.Transaction().add(instruction);
  const signature = await sendTransactionWithLogs(connection, transaction, [
    payer,
  ]);
  console.log(
    `Price feed retrieved successfully. Transaction signature: ${signature}`
  );
}

async function getCoinPrice(coin) {
  // Validate the coin input (1 for BTC, 2 for SOL, 3 for ETH)
  if (![1, 2, 3].includes(coin)) {
    console.error("Invalid coin. Use 1 for BTC, 2 for SOL, 3 for ETH.");
    return;
  }
  let coinKey;
  if (coin == 1) {
    coinKey = new solanaWeb3.PublicKey(price_feeds["btc"].address);
  } else if (coin == 2) {
    coinKey = new solanaWeb3.PublicKey(price_feeds["sol"].address);
  } else if (coin == 3) {
    coinKey = new solanaWeb3.PublicKey(price_feeds["eth"].address);
  } else {
    console.log("Coin not found");
  }

  // Define the instruction discriminator for `get_coin_price`
  const instructionDiscriminator = Buffer.from(discriminators.fetchCoinPrice); // Replace with actual discriminator
  const coinBuffer = Buffer.from([coin]); // Serialize the coin ID as a single byte

  // Concatenate the discriminator and the coin ID
  const instructionData = Buffer.concat([instructionDiscriminator, coinBuffer]);

  // Create the transaction instruction
  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // Payer's public key
      { pubkey: coinKey, isSigner: false, isWritable: false }, // Replace with the actual price account
    ],
    programId, // Your program's public key
    data: instructionData, // Serialized instruction data
  });

  // Send the transaction
  const transaction = new solanaWeb3.Transaction().add(instruction);
  try {
    const signature = await sendTransactionWithLogs(connection, transaction, [
      payer,
    ]);
    console.log(
      `Coin price retrieved successfully. Transaction signature: ${signature}`
    );
  } catch (error) {
    console.error("Error during transaction:", error);
  }
}

// const btcPrice= new solanaWeb3.PublicKey("7YQg8Tz9KHKsg7yHiAFRBsDkLoKvZbMXt7VbW44F7QM");

async function fetchBtcPrice() {
  // const priceUpdatePda = await getPriceUpdatePda();
  const instructionData = Buffer.alloc(8);
  Buffer.from(discriminators.fetchBtcPrice).copy(instructionData, 0); // Add discriminator

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer signs the transaction
      {
        pubkey: new solanaWeb3.PublicKey(price_feeds["btc"].address),
        isSigner: false,
        isWritable: true,
      }, // price_update account
    ],
    programId,
    data: instructionData,
  });

  const transaction = new solanaWeb3.Transaction().add(instruction);
  await sendTransactionWithLogs(connection, transaction, [payer]);
  console.log(`Price feed fetched successfully: ${price_feeds["btc"].address}`);
}

async function resolveMarket(marketPda, priceAccount) {
  const instructionData = Buffer.alloc(8);
  // Insert instruction discriminator here

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: priceAccount, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionData,
  });

  const transaction = new solanaWeb3.Transaction().add(instruction);
  await sendTransactionWithLogs(connection, transaction, [payer]);
  console.log(`Market resolved successfully: ${marketPda}`);
}

async function claimPayout(betPda, marketPda) {
  const instructionData = Buffer.alloc(8);
  Buffer.from(discriminators.getPriceFeed).copy(instructionData, 0);
  // Insert instruction discriminator here

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: betPda, isSigner: false, isWritable: true },
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    ],
    programId,
    data: instructionData,
  });

  const transaction = new solanaWeb3.Transaction().add(instruction);
  await sendTransactionWithLogs(connection, transaction, [payer]);
  console.log(`Payout claimed successfully: ${betPda}`);
}

// Main function
(async () => {
  while (true) {
    const action = await prompt(
      "Choose an action: initialize, bet, resolve, claim, fetch-prices (WIP), fetch-coin, fetch-btc, exit: "
    );

    try {
      switch (action.toLowerCase()) {
        case "initialize":
          const strike = parseInt(await prompt("Enter strike price: "));
          const expiry = await getExpiryTimestamp();
          const oracleFeed = new solanaWeb3.PublicKey(
            await prompt("Enter oracle feed public key: ")
          );
          await initializeMarket(strike, expiry, oracleFeed);
          break;
        case "bet":
          const marketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          const amount = parseInt(
            await prompt("Enter bet amount (in lamports): ")
          );
          const outcome = parseInt(
            await prompt("Enter outcome (1 for Yes, 2 for No): ")
          );
          await placeBet(marketPda, amount, outcome);
          break;
        case "resolve":
          const resolveMarketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          const priceAccount = new solanaWeb3.PublicKey(
            await prompt("Enter Pyth price account: ")
          );
          await resolveMarket(resolveMarketPda, priceAccount);
          break;
        case "claim":
          const betPda = new solanaWeb3.PublicKey(
            await prompt("Enter bet PDA: ")
          );
          const claimMarketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          await claimPayout(betPda, claimMarketPda);
          break;
        case "fetch-prices":
          const asset = await prompt("Enter asset (btc, sol, eth): ");
          await getPriceFeed(asset);
          break;
        case "fetch-coin":
          const coin = parseInt(
            await prompt("Enter coin (1 for BTC, 2 for SOL, 3 for ETH): ")
          );
          await getCoinPrice(coin);
          break;
        case "fetch-btc":
          await fetchBtcPrice();
          break;

        case "exit":
          console.log("Exiting...");
          rl.close();
          process.exit(0);
          break;

        default:
          console.log("Invalid action.");
      }
    } catch (err) {
      console.error("Error during execution:", err);
    }
  }
})();
