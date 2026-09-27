const anchor = require("@coral-xyz/anchor");
const web3 = require("@solana/web3.js");
const {
  createRpc,
  bn,
  PackedAccounts,
  SystemAccountMetaConfig,
  selectStateTreeInfo,
  deriveAddressSeedV2,
  deriveAddressV2,
  DerivationMode,
} = require("@lightprotocol/stateless.js");
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = new web3.PublicKey(
  "D8E4AStuNybRhwSe2RDhQkVxoooKJDvphFmqnPBjSYkW"
);
const RPC = loadRpcUrl();
const IDL = camelizeIdl(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/zkc_voter.json"), "utf8")
  )
);

const { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } = web3;

function camelCase(s) {
  return s
    .replace(/_+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase());
}

function camelizeIdl(idl) {
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const out = {};
      for (const [k, v] of Object.entries(x)) {
        out[k] =
          (k === "name" || k === "path") && typeof v === "string"
            ? camelCase(v)
            : walk(v);
      }
      return out;
    }
    return x;
  };
  return walk(idl);
}

async function transferSol(connection, from, to, lamports) {
  const tx = new web3.Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports })
  );
  return await web3.sendAndConfirmTransaction(connection, tx, [from]);
}

async function mintOne(program, rpc, signer, proposal, voter) {
  const addressTree = await rpc.getAddressTreeInfoV2();
  const seed = deriveAddressSeedV2([
    Buffer.from("voter_ticket"),
    proposal.toBuffer(),
    voter.toBuffer(),
  ]);
  const address = deriveAddressV2(seed, addressTree.tree, PROGRAM_ID);

  const proof = await rpc.getValidityProofV0([], [
    { address: bn(address.toBytes()), tree: addressTree.tree, queue: addressTree.queue },
  ]);

  const packed = new PackedAccounts();
  packed.addSystemAccounts(SystemAccountMetaConfig.new(PROGRAM_ID));
  const addressTreeIndex = packed.insertOrGet(addressTree.tree);
  const addressQueueIndex = packed.insertOrGet(addressTree.queue);
  const stateTrees = await rpc.getStateTreeInfos();
  const outputStateTree = selectStateTreeInfo(stateTrees);
  const outputStateTreeIndex = packed.insertOrGet(outputStateTree.queue);
  const { remainingAccounts } = packed.toAccountMetas();

  const addressTreeInfo = {
    rootIndex: proof.rootIndices[0],
    addressMerkleTreePubkeyIndex: addressTreeIndex,
    addressQueuePubkeyIndex: addressQueueIndex,
  };
  const validityProof = {
    0: { a: proof.compressedProof.a, b: proof.compressedProof.b, c: proof.compressedProof.c },
  };

  return await program.methods
    .mintVoterTickets(validityProof, addressTreeInfo, outputStateTreeIndex, [voter])
    .accounts({ signer: signer.publicKey, proposal })
    .remainingAccounts(remainingAccounts)
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })])
    .rpc();
}

async function castVote(program, rpc, voter, proposal, candidate, derivationMode) {
  const addressTree = await rpc.getAddressTreeInfoV2();

  const ticketSeed = deriveAddressSeedV2([
    Buffer.from("voter_ticket"),
    proposal.toBuffer(),
    voter.publicKey.toBuffer(),
  ]);
  const ticketAddress = deriveAddressV2(ticketSeed, addressTree.tree, PROGRAM_ID);
  const compressedAccount = await rpc.getCompressedAccount(bn(ticketAddress.toBytes()));
  if (!compressedAccount) throw new Error("no voter ticket found");
  console.log("  ticket proveByIndex:", compressedAccount.proveByIndex, "leafIndex:", compressedAccount.leafIndex);

  const voteRecordSeed = deriveAddressSeedV2([
    Buffer.from("vote_record"),
    proposal.toBuffer(),
    voter.publicKey.toBuffer(),
  ]);
  const voteRecordAddress = deriveAddressV2(voteRecordSeed, addressTree.tree, PROGRAM_ID);

  const proofArgs = [
    compressedAccount.proveByIndex ? [] : [compressedAccount],
    [{ address: new Uint8Array(voteRecordAddress.toBytes()), treeInfo: addressTree }],
  ];
  if (derivationMode) proofArgs.push(derivationMode);
  const proof = await rpc.getValidityProofV2(...proofArgs);

  const packed = new PackedAccounts();
  packed.addSystemAccounts(SystemAccountMetaConfig.new(PROGRAM_ID));
  const stateTreeIndex = packed.insertOrGet(compressedAccount.treeInfo.tree);
  const stateQueueIndex = packed.insertOrGet(compressedAccount.treeInfo.queue);
  const outputStateTreeIndex = stateQueueIndex;
  const addressTreeIndex = packed.insertOrGet(addressTree.tree);
  const addressQueueIndex = packed.insertOrGet(addressTree.queue);
  const { remainingAccounts } = packed.toAccountMetas();

  const ticketMeta = {
    treeInfo: {
      rootIndex: compressedAccount.proveByIndex ? 0 : proof.rootIndices[0],
      proveByIndex: compressedAccount.proveByIndex,
      merkleTreePubkeyIndex: stateTreeIndex,
      queuePubkeyIndex: stateQueueIndex,
      leafIndex: compressedAccount.proveByIndex ? compressedAccount.leafIndex : proof.leafIndices[0],
    },
    address: compressedAccount.address,
    outputStateTreeIndex,
  };
  const ticket = { proposal, voter: voter.publicKey };
  const validityProof = {
    0: proof.compressedProof
      ? { a: proof.compressedProof.a, b: proof.compressedProof.b, c: proof.compressedProof.c }
      : null,
  };
  const addressTreeInfo = {
    rootIndex: proof.rootIndices[proof.rootIndices.length - 1],
    addressMerkleTreePubkeyIndex: addressTreeIndex,
    addressQueuePubkeyIndex: addressQueueIndex,
  };

  return await program.methods
    .castVote(validityProof, ticketMeta, ticket, addressTreeInfo, outputStateTreeIndex, candidate)
    .accounts({ voter: voter.publicKey, proposal })
    .remainingAccounts(remainingAccounts)
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })])
    .signers([voter])
    .rpc();
}

async function main() {
  const admin = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json")))
  );
  const connection = new web3.Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL, provider);
  const rpc = createRpc(RPC, RPC, RPC);

  console.log("1) creating proposal…");
  const title = Buffer.alloc(32);
  Buffer.from("diag" + Date.now()).subarray(0, 32).copy(title);
  const titleBytes = Array.from(title);
  const [proposal] = PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), admin.publicKey.toBuffer(), Buffer.from(titleBytes)],
    PROGRAM_ID
  );
  await program.methods
    .initializeProposal(titleBytes, 3)
    .accounts({ proposal, creator: admin.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("   proposal:", proposal.toBase58());

  console.log("2) minting one ticket…");
  const voter = Keypair.generate();
  await transferSol(connection, admin, voter.publicKey, 0.02 * 1e9);
  await mintOne(program, rpc, admin, proposal, voter.publicKey);
  console.log("   minted.");

  console.log("3) casting vote (DerivationMode.standard)…");
  try {
    const sig = await castVote(program, rpc, voter, proposal, 1, DerivationMode.standard);
    console.log("   VOTE OK:", sig);
  } catch (e) {
    console.log("   VOTE FAILED");
    console.log("   message:", e.message);
    if (Array.isArray(e.logs)) console.log("   logs:\n" + e.logs.join("\n"));
  }

  const acct = await program.account.proposal.fetch(proposal);
  console.log("4) tally:", acct.votes.map((v) => v.toNumber()));
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});

function loadRpcUrl() {
  if (process.env.NEXT_PUBLIC_LIGHT_RPC_URL) return process.env.NEXT_PUBLIC_LIGHT_RPC_URL;
  if (process.env.HELIUS_DEVNET_RPC) return process.env.HELIUS_DEVNET_RPC;
  try {
    const content = fs.readFileSync(path.join(__dirname, "../.env"), "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*(NEXT_PUBLIC_LIGHT_RPC_URL|HELIUS_DEVNET_RPC)\s*=\s*(.+?)\s*$/);
      if (m) return m[2];
    }
  } catch (_) {}
  throw new Error("Missing NEXT_PUBLIC_LIGHT_RPC_URL (or HELIUS_DEVNET_RPC) in .env");
}
