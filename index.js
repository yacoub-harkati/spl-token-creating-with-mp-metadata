import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import bs58 from "bs58";
import {
  createAndMint,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { clusterApiUrl, Connection, PublicKey, Keypair } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mockStorage } from "@metaplex-foundation/umi-storage-mock";
import dotenv from "dotenv";
import { log } from "console";
import fs from "fs/promises";

dotenv.config();

const umi = createUmi(clusterApiUrl("devnet"));

const keypair = umi.eddsa.createKeypairFromSecretKey(
  bs58.decode(process.env.PRIVATE_KEY)
);

umi.use(keypairIdentity(keypair)).use(mplTokenMetadata());
umi.use(mockStorage());

const conn = new Connection(clusterApiUrl("devnet"));

async function uploadImage(imagePath) {
  try {
    const imageData = await fs.readFile(imagePath);
    const [uri] = await umi.uploader.upload([imageData]);
    console.log("Image uploaded successfully");
    console.log("URI:", uri);
    return uri;
  } catch (error) {
    console.error("Error uploading image:", error);
    throw error;
  }
}

async function createAndMintFungible(
  name,
  symbol,
  imagePath,
  description,
  amount = 1_000_000_000,
  decimals = 9
) {
  await airdropSolIfNeeded(keypair.publicKey);

  const mint = generateSigner(umi);

  // Upload image and get URI
  const imageUri = await uploadImage(imagePath);

  // Create metadata JSON
  const metadata = {
    name,
    symbol,
    description,
    image: imageUri,
  };

  // Upload metadata
  const [metadataUri] = await umi.uploader.upload([JSON.stringify(metadata)]);

  // mint token
  const tx = createAndMint(umi, {
    mint,
    authority: umi.identity,
    name,
    symbol,
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals,
    amount: amount * 10 ** decimals,
    tokenOwner: umi.identity.publicKey,
    isMutable: true,
    tokenStandard: TokenStandard.Fungible,
  });

  const result = await tx.sendAndConfirm(umi);

  log("Transaction signature:", bs58.encode(result.signature));
  log("Mint address:", mint.publicKey);
}

async function airdropSolIfNeeded(publicKey) {
  let balance = await conn.getBalance(new PublicKey(publicKey));
  log("Current balance:", balance / 1e9, "SOL");
  if (balance < 1e9) {
    // less than 1 SOL
    log("Balance low. Requesting airdrop...");
    let airdropSignature = await conn.requestAirdrop(
      new PublicKey(publicKey),
      1e9
    );
    await confirmTransaction(airdropSignature);
    balance = await conn.getBalance(new PublicKey(publicKey));
    log("New balance after airdrop:", balance / 1e9, "SOL");
  }
}

async function confirmTransaction(signature) {
  const latestBlockhash = await conn.getLatestBlockhash();
  await conn.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
}

// Usage
createAndMintFungible("Solana Gold", "GOLDSOL", "logo.png", "A gold Solana SPL token :)");
