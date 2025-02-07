const solanaWeb3 = require("@solana/web3.js");
const bs58 = require("bs58");
const splToken = require("@solana/spl-token");
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
  // "8wpsKAtskF9J7fo6KEEjPYacHS7JCXgzZnM1E1Un53tN"
  "ENeicYASniyR5oHnrp5pxq7UtUMLqmCJKqu5Er8ChNtP"
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

const treasuryPdaHardCoded = new solanaWeb3.PublicKey("8s7phLES1aDmcNXdbcbBYwHpf1ToZHevVoAh78U63Atd");

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

const associatedTokenProgramId = new solanaWeb3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const tokenProgramId = new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

// Instruction discriminator for `initialize_market`
const discriminators = {
  initializeMarket: [35, 35, 189, 193, 155, 48, 170, 203], // Precomputed sha256("global:initialize_market").slice(0, 8)
  placeBet: [222, 62, 67, 220, 63, 166, 126, 33],
  resolveMarket: [155, 23, 80, 173, 46, 74, 23, 239],
  getPriceFeed: [110, 252, 205, 111, 43, 23, 155, 134],
  fetchBtcPrice: [218, 72, 78, 5, 219, 85, 91, 157],
  fetchCoinPrice: [173, 85, 70, 71, 109, 106, 163, 31],
  createOutcomeTokens: [20, 255, 41, 64, 32, 77, 240, 93],
  redeem: [184, 12, 86, 149, 70, 196, 97, 225],
  initializeTreasury: [124, 186, 211, 195, 85, 165, 129, 166],
  lockFunds: [171, 49, 9, 86, 156, 155, 2, 88],
  initializeOutcomeMints: [
    223,
    167,
    202,
    135,
    111,
    93,
    151,
    249
  ],
  initializeTreasuryTokenAccounts: [
    237,
    12,
    117,
    222,
    94,
    228,
    160,
    55
  ],
  mintOutcomeTokens: [
    27,
    243,
    237,
    46,
    2,
    226,
    144,
    209
  ],

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

async function getExpiryTimestamp() {
  const minutes = parseInt(
    await prompt("Enter expiry time in minutes (e.g., 60 for 1 hour): ")
  );
  if (isNaN(minutes) || minutes <= 0) {
    throw new Error(
      "Invalid input. Please enter a positive number of minutes."
    );
  }

  console.log("Getting onchain time...");
  const slot = await connection.getSlot();
  const timestamp = await connection.getBlockTime(slot);
  console.log("Onchain unix time stamp is: ", timestamp);
  const expiryTimestamp = timestamp + minutes * 60; // Add the minutes converted to millisecs

  console.log(
    `Expiry timestamp set to: ${expiryTimestamp} (current time + ${minutes} minutes)`
  );
  return expiryTimestamp;
}

/*

Instruction Functions


*/
async function initializeMarket(strike, asset) {
  
  // Get expiry timestamp
  const expiry = await getExpiryTimestamp();
  console.log("Expiry in unix timestamp: ", )
  
  console.log("Initializing market...");
  // Derive the PDA for the market
  const [marketPda, bump] = solanaWeb3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"), 
      payer.publicKey.toBuffer(), 
      (() => {
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(BigInt(strike), 0);
        return buffer;
      })(),
      (() => {
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
    console.log("\nMarket PDA: ", marketPda);
    return marketPda;
  }

  // 🔹 **Fix**: Include asset in instruction data
  const instructionData = Buffer.alloc(8 + 8 + 8 + 1); // Discriminator (8), Strike (8), Expiry (8), Asset (1)
  Buffer.from(discriminators.initializeMarket).copy(instructionData, 0); // Write discriminator
  instructionData.writeBigUInt64LE(BigInt(strike), 8); // Write strike price
  instructionData.writeBigInt64LE(BigInt(expiry), 16); // Write expiry timestamp
  instructionData.writeUInt8(asset, 24); // Write asset (BTC=1, SOL=2, ETH=3)

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
    `Market initialized successfully with asset ${asset}. Transaction signature:`,
    signature
  );
  console.log("Market PDA: ", marketPda.toString());
  return marketPda;
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



async function isAccountInitialized(connection, mintPda) {
  try {
    const accountInfo = await connection.getAccountInfo(mintPda);

    if (accountInfo && accountInfo.data) {
      console.log(`✅ Account ${mintPda.toBase58()} is initialized.`);
      return true; // Mint exists
    } else {
      console.log(`❌ Account ${mintPda.toBase58()} does NOT exist.`);
      return false; // Mint does not exist
    }
  } catch (error) {
    console.error("Error checking account:", error);
    return false;
  }
}


async function lockFunds(marketPda, amount) {
  const PRICE_PER_TOKEN = 100000;
  console.log("Price per token is", PRICE_PER_TOKEN);


  const instructionData = Buffer.alloc(16);
  Buffer.from(discriminators.lockFunds).copy(instructionData, 0);
  instructionData.writeBigUInt64LE(BigInt(amount), 8);

  const authorityKeypair = payer;
  const payerPK = payer.publicKey.toBuffer();
  

  // ✅ Derive Mint PDAs
  const [yesMintPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("yes_mint"), marketPda.toBuffer()],
    programId
  );

  const [noMintPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("no_mint"), marketPda.toBuffer()],
    programId
  );

  // ✅ Derive Associated Token Accounts (Using Correct ATA Derivation)
  const [treasuryYesTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [marketPda.toBuffer(), tokenProgramId.toBuffer(), yesMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );
  
  const [treasuryNoTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [marketPda.toBuffer(), tokenProgramId.toBuffer(), noMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );

  const [userYesTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer(), tokenProgramId.toBuffer(), yesMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  ); 

  const [userNoTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer(), tokenProgramId.toBuffer(), noMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );

    // ✅ Step 2: Initialize Treasury Token Accounts
    const lockFundsIx = new solanaWeb3.TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: marketPda, isSigner: false, isWritable: true },
        { pubkey: yesMintPda, isSigner: false, isWritable: true },
        { pubkey: noMintPda, isSigner: false, isWritable: true },
        { pubkey: treasuryYesTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryNoTokenAccount, isSigner: false, isWritable: true },
        { pubkey: userYesTokenAccount, isSigner: false, isWritable: true },
        { pubkey: userNoTokenAccount, isSigner: false, isWritable: true },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: associatedTokenProgramId, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData
    });
  
  const transaction = new solanaWeb3.Transaction().add(lockFundsIx);
  await sendTransactionWithLogs(connection, transaction, [payer]);

  console.log(`Locked ${amount * PRICE_PER_TOKEN} lamports in market vault`);
}

async function redeem(marketPda) {

  // ✅ Derive Mint PDAs
  const [yesMintPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("yes_mint"), marketPda.toBuffer()],
    programId
  );

  const [noMintPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("no_mint"), marketPda.toBuffer()],
    programId
  );

  // ✅ Derive Associated Token Accounts (Using Correct ATA Derivation)
  const [treasuryYesTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [marketPda.toBuffer(), tokenProgramId.toBuffer(), yesMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );
  
  const [treasuryNoTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [marketPda.toBuffer(), tokenProgramId.toBuffer(), noMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );

  const [userYesTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer(), tokenProgramId.toBuffer(), yesMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  ); 

  const [userNoTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer(), tokenProgramId.toBuffer(), noMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );

    // ✅ Step 2: Initialize Treasury Token Accounts
    const redeemIx = new solanaWeb3.TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: marketPda, isSigner: false, isWritable: true },
        { pubkey: yesMintPda, isSigner: false, isWritable: true },
        { pubkey: noMintPda, isSigner: false, isWritable: true },
        { pubkey: treasuryYesTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryNoTokenAccount, isSigner: false, isWritable: true },
        { pubkey: userYesTokenAccount, isSigner: false, isWritable: true },
        { pubkey: userNoTokenAccount, isSigner: false, isWritable: true },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ],
      programId,
      data: Buffer.concat([
        Buffer.from(discriminators.redeem),
        Buffer.alloc(0),
      ])
    });
  
  const transaction = new solanaWeb3.Transaction().add(redeemIx);
  await sendTransactionWithLogs(connection, transaction, [payer]);

  console.log(`Redeemed funds from market!`);
}

async function initializeTreasury() {
  const [treasuryPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), payer.publicKey.toBuffer()],
    programId
  );

  const instructionData = Buffer.alloc(8);
  Buffer.from(discriminators.initializeTreasury).copy(instructionData, 0);

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
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

  console.log(`Treasury initialized at: ${treasuryPda}`);
}


async function createOutcomeTokens(marketPda) {
  
  const authorityKeypair = payer;

  // ✅ Derive Mint PDAs
  const [yesMintPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("yes_mint"), marketPda.toBuffer()],
    programId
  );

  const [noMintPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("no_mint"), marketPda.toBuffer()],
    programId
  );

  // ✅ Derive Treasury PDA but useless w/ current impl
  const [treasuryPda] = solanaWeb3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), authorityKeypair.publicKey.toBuffer()],
    programId
  );

  console.log("Derived Treasury PDA:", treasuryPda.toString());

  // ✅ Derive Associated Token Accounts (Using Correct ATA Derivation)
  const [treasuryYesTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [marketPda.toBuffer(), tokenProgramId.toBuffer(), yesMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );
  
  const [treasuryNoTokenAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
    [marketPda.toBuffer(), tokenProgramId.toBuffer(), noMintPda.toBuffer()], // ✅ Matches Rust
    associatedTokenProgramId
  );

  console.log("Derived Yes Mint:", yesMintPda.toString());
  console.log("Derived No Mint:", noMintPda.toString());

  const yesMintExists = await isAccountInitialized(connection, yesMintPda);

  if (yesMintExists) {
    //Do nothing
    console.log("Yes token already exists");
  }else {
    // ✅ Step 1: Initialize Mints
    const initMintsIx = new solanaWeb3.TransactionInstruction({
      keys: [
        { pubkey: marketPda, isSigner: false, isWritable: true },
        { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: yesMintPda, isSigner: false, isWritable: true },
        { pubkey: noMintPda, isSigner: false, isWritable: true },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ],
      programId,
      data: Buffer.concat([
        Buffer.from(discriminators.initializeOutcomeMints),
        Buffer.alloc(0),
      ]), // Replace with new discriminator
    });
  
    const transaction1 = new solanaWeb3.Transaction().add(initMintsIx);
    await sendTransactionWithLogs(connection, transaction1, [authorityKeypair]);
    console.log("transaction 1 sent");
  }

  const treasuryTokenAccountExists = await isAccountInitialized(connection, treasuryYesTokenAccount);

  if (treasuryTokenAccountExists){
    console.log("yes Treasury token account already initialized");
  }
  else {


      // ✅ Step 2: Initialize Treasury Token Accounts
      const initTreasuryIx = new solanaWeb3.TransactionInstruction({
        keys: [
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: false },
          { pubkey: yesMintPda, isSigner: false, isWritable: true },
          { pubkey: noMintPda, isSigner: false, isWritable: true },
          { pubkey: treasuryYesTokenAccount, isSigner: false, isWritable: true },
          { pubkey: treasuryNoTokenAccount, isSigner: false, isWritable: true },
          { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          { pubkey: associatedTokenProgramId, isSigner: false, isWritable: false },
        ],
        programId,
        data: Buffer.concat([
          Buffer.from(discriminators.initializeTreasuryTokenAccounts),
          Buffer.alloc(0),
        ]),// Replace with new discriminator
      });
    
      const transaction2 = new solanaWeb3.Transaction().add(initTreasuryIx);
      await sendTransactionWithLogs(connection, transaction2, [authorityKeypair]);
      console.log("transaction 2 sent");
  }

  // ✅ Step 3: Mint Outcome Tokens
  const mintTokensIx = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: yesMintPda, isSigner: false, isWritable: true },
      { pubkey: noMintPda, isSigner: false, isWritable: true },
      { pubkey: treasuryYesTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasuryNoTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.concat([
      Buffer.from(discriminators.mintOutcomeTokens),
      Buffer.alloc(0),
    ]), // Replace with new discriminator
  });

  // ✅ Send all transactions sequentially
  const transaction3 = new solanaWeb3.Transaction().add(mintTokensIx);
  await sendTransactionWithLogs(connection, transaction3, [authorityKeypair]);
  console.log("transaction 3 sent");
  console.log("✅ Outcome tokens successfully created!");
  console.log("Derived yes treasury pda: ", treasuryYesTokenAccount.toString());
  console.log("Derived no treasury pda: ", treasuryNoTokenAccount.toString());
  console.log("Derived yes mint pda: ", yesMintPda.toString());
  console.log("Derived no mint pda: ", noMintPda.toString());
  console.log("market pda", marketPda.toString());
  console.log("sol sys prog id", solanaWeb3.SystemProgram.programId.toString());
  console.log("programId", programId.toString());
  console.log("treasury pda", treasuryPda.toString());
}


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
  

  // Insert instruction discriminator here

  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable:false},
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: priceAccount, isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.concat([
      Buffer.from(discriminators.resolveMarket),
      Buffer.alloc(0),
    ])
  });

  const transaction = new solanaWeb3.Transaction().add(instruction);
  await sendTransactionWithLogs(connection, transaction, [payer]);
  console.log(`Market resolved successfully: ${marketPda}`);
}



// Main function
(async () => {
  while (true) {
    const action = await prompt(
      "Choose an action: initialize,initialize-treasury, resolve, lock, redeem, create-tokens, fetch-prices (WIP), fetch-coin, fetch-btc, exit: "
    );

    try {
      switch (action.toLowerCase()) {
        case "initialize":
          const strike = parseInt(await prompt("Enter strike price: "));
          console.log("Select asset: 1 for BTC, 2 for SOL, 3 for ETH");
          const asset = parseInt(await prompt("Enter asset (1/2/3): "));

          if (![1, 2, 3].includes(asset)) {
            console.log(
              "Invalid asset! Choose 1 for BTC, 2 for SOL, or 3 for ETH."
            );
            break;
          }

          await initializeMarket(strike, asset);
          break;
        case "lock":
          const marketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          const amount = parseInt(
            await prompt(
              "Enter amount to lock: "
            )
          );
          await lockFunds(marketPda, amount);
          break;
        case "resolve":
          const resolveMarketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          console.log("Price feeds: ", price_feeds);
          const priceAccount = new solanaWeb3.PublicKey(
            await prompt("Enter Pyth price account: ")
          );
          await resolveMarket(resolveMarketPda, priceAccount);
          break;
        case "redeem":
          const redeemMarketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          await redeem(redeemMarketPda);
          break;
        case "create-tokens":
          const tokenMarketPda = new solanaWeb3.PublicKey(
            await prompt("Enter market PDA: ")
          );
          await createOutcomeTokens(tokenMarketPda);
          break;

        case "initialize-treasury":
          await initializeTreasury();
          break;
        case "fetch-prices":
          const assetType = await prompt("Enter asset (btc, sol, eth): ");
          await getPriceFeed(assetType);
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
