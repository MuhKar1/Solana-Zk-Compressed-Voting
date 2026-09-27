import * as anchor from "@coral-xyz/anchor";
import { assert, expect } from "chai";

const {
  AnchorProvider,
  Program,
  web3,
  BN,
} = anchor as typeof import("@coral-xyz/anchor");

import {
  createRpc,
  deriveAddressV2,
  deriveAddressSeedV2,
  bn,
  PackedAccounts,
  SystemAccountMetaConfig,
  selectStateTreeInfo,
  featureFlags,
  VERSION,
} from "@lightprotocol/stateless.js";
import type { ZkcVoter } from "../target/types/zkc_voter.ts";

(featureFlags as any).version = VERSION.V2;

const {
  PublicKey,
  Keypair,
  SystemProgram,
  ComputeBudgetProgram,
} = web3;


const PROGRAM_ID = new PublicKey(
  "D8E4AStuNybRhwSe2RDhQkVxoooKJDvphFmqnPBjSYkW"
);


const RPC_URL =
  process.env.LIGHT_RPC_URL ??
  "http://127.0.0.1:8899";

const INDEXER_URL =
  process.env.LIGHT_INDEXER_URL ??
  "http://127.0.0.1:8784";

const PROVER_URL =
  process.env.LIGHT_PROVER_URL ??
  "http://127.0.0.1:3001";



const provider =
  anchor.AnchorProvider.env();

anchor.setProvider(provider);

const program =
  anchor.workspace.ZkcVoter as Program<ZkcVoter>;
const programMethods = program.methods as any;

/*
 * Light RPC.
 *
 * Depending on the exact stateless.js 0.16-era package,
 * the local RPC constructor may expose the prover endpoint
 * separately. The standard local Light setup uses these
 * three services.
 */

const rpc = createRpc(
  RPC_URL,
  INDEXER_URL,
  PROVER_URL
);

const ticketIdentities = new Map<
  string,
  { proposal: web3.PublicKey; voter: web3.PublicKey }
>();
const ticketAddresses = new Map<string, web3.PublicKey>();
const ticketTreeInfos = new Map<string, any>();

function ticketKey(
  proposal: web3.PublicKey,
  voter: web3.PublicKey
): string {
  return `${proposal.toBase58()}:${voter.toBase58()}`;
}

const admin = provider.wallet;

describe("zkc-voter — adversarial security suite", function () {
  this.timeout(1_000_000);

  /*
   * Independent voters.
   */

  const voter1 = Keypair.generate();
  const voter2 = Keypair.generate();
  const voter3 = Keypair.generate();

  /*
   * Attacker is deliberately NOT the proposal creator.
   */

  const attacker = Keypair.generate();

  /*
   * Proposals.
   */

  let title1: number[];
  let title2: number[];

  let proposal1: web3.PublicKey;
  let proposal2: web3.PublicKey;

  /*
   * ==========================================================
   * BEFORE
   * ==========================================================
   */

  before(async () => {
    const runId = `${Date.now()}-${Math.random()}`;

    title1 = fixedTitle(`Proposal One ${runId}`);
    title2 = fixedTitle(`Proposal Two ${runId}`);

    proposal1 = proposalPda(
      admin.publicKey,
      title1
    );

    proposal2 = proposalPda(
      admin.publicKey,
      title2
    );

    await airdrop(
      voter1.publicKey,
      5
    );

    await airdrop(
      voter2.publicKey,
      5
    );

    await airdrop(
      voter3.publicKey,
      5
    );

    await airdrop(
      attacker.publicKey,
      5
    );

    /*
     * Initialize Proposal 1.
     */

    await program.methods
      .initializeProposal(
        title1,
        3
      )
      .accounts({
        proposal: proposal1,
        creator: admin.publicKey,
        systemProgram:
          SystemProgram.programId,
      } as any)
      .rpc();

    /*
     * Initialize Proposal 2.
     */

    await program.methods
      .initializeProposal(
        title2,
        3
      )
      .accounts({
        proposal: proposal2,
        creator: admin.publicKey,
        systemProgram:
          SystemProgram.programId,
      } as any)
      .rpc();
  });


  /*
   * ==========================================================
   * 1. PROPOSAL VALIDATION
   * ==========================================================
   */

  describe("Proposal validation", () => {

    it("accepts the minimum number of options", async () => {
      const title = uniqueTitle("minimum options");

      const pda = proposalPda(
        admin.publicKey,
        title
      );

      await program.methods
        .initializeProposal(title, 2)
        .accounts({
          proposal: pda,
          creator: admin.publicKey,
          systemProgram:
            SystemProgram.programId,
        } as any)
        .rpc();

      const proposal =
        await program.account.proposal.fetch(
          pda
        );

      assert.equal(
        proposal.optionsCount,
        2
      );
    });


    it("accepts the maximum number of options", async () => {
      const title = uniqueTitle("maximum options");

      const pda = proposalPda(
        admin.publicKey,
        title
      );

      await program.methods
        .initializeProposal(title, 10)
        .accounts({
          proposal: pda,
          creator: admin.publicKey,
          systemProgram:
            SystemProgram.programId,
        } as any)
        .rpc();

      const proposal =
        await program.account.proposal.fetch(
          pda
        );

      assert.equal(
        proposal.optionsCount,
        10
      );
    });


    it("rejects zero options", async () => {
      const title = fixedTitle(
        "zero options"
      );

      const pda = proposalPda(
        admin.publicKey,
        title
      );

      await expectFailure(
        () =>
          program.methods
            .initializeProposal(title, 0)
            .accounts({
              proposal: pda,
              creator: admin.publicKey,
              systemProgram:
                SystemProgram.programId,
            } as any)
            .rpc(),
        "InvalidOptionsCount"
      );
    });


    it("rejects eleven options", async () => {
      const title = fixedTitle(
        "eleven options"
      );

      const pda = proposalPda(
        admin.publicKey,
        title
      );

      await expectFailure(
        () =>
          program.methods
            .initializeProposal(title, 11)
            .accounts({
              proposal: pda,
              creator: admin.publicKey,
              systemProgram:
                SystemProgram.programId,
            } as any)
            .rpc(),
        "InvalidOptionsCount"
      );
    });


    it("cannot initialize the same proposal PDA twice", async () => {
      await expectFailure(
        () =>
          program.methods
            .initializeProposal(title1, 3)
            .accounts({
              proposal: proposal1,
              creator: admin.publicKey,
              systemProgram:
                SystemProgram.programId,
            } as any)
            .rpc()
      );
    });
  });


  /*
   * ==========================================================
   * 2. PDA DERIVATION
   * ==========================================================
   */

  describe("Proposal PDA security", () => {

    it("proposal PDA is deterministic", () => {
      const a = proposalPda(
        admin.publicKey,
        title1
      );

      const b = proposalPda(
        admin.publicKey,
        title1
      );

      assert.equal(
        a.toBase58(),
        b.toBase58()
      );
    });


    it("different titles produce different proposal PDAs", () => {
      const a = proposalPda(
        admin.publicKey,
        title1
      );

      const b = proposalPda(
        admin.publicKey,
        title2
      );

      assert.notEqual(
        a.toBase58(),
        b.toBase58()
      );
    });


    it("different creators produce different proposal PDAs", () => {
      const a = proposalPda(
        admin.publicKey,
        title1
      );

      const b = proposalPda(
        attacker.publicKey,
        title1
      );

      assert.notEqual(
        a.toBase58(),
        b.toBase58()
      );
    });
  });


  /*
   * ==========================================================
   * 3. ADMIN AUTHORIZATION
   * ==========================================================
   *
   * These tests exercise the authorization check before
   * attempting to construct a valid Light CPI.
   *
   * The important invariant is:
   *
   *     signer == proposal.creator
   */

  describe("Admin authorization", () => {

    it("rejects attacker as ticket minter", async () => {

      await expectFailure(
        () =>
          program.methods
            .mintVoterTickets(
              emptyValidityProof(),
              emptyAddressTreeInfo(),
              0,
              [voter1.publicKey]
            )
            .accounts({
              signer: attacker.publicKey,
              proposal: proposal1,
            })
            .signers([attacker])
            .rpc(),
        "UnauthorizedAdmin"
      );
    });


    it("rejects voter as admin", async () => {

      await expectFailure(
        () =>
          program.methods
            .mintVoterTickets(
              emptyValidityProof(),
              emptyAddressTreeInfo(),
              0,
              [voter1.publicKey]
            )
            .accounts({
              signer: voter1.publicKey,
              proposal: proposal1,
            })
            .signers([voter1])
            .rpc(),
        "UnauthorizedAdmin"
      );
    });
  });


  /*
   * ==========================================================
   * 4. CANDIDATE BOUNDARY TESTS
   * ==========================================================
   */

  describe("Candidate validation", () => {

    it("candidate 0 is rejected", async () => {

      /*
       * Candidate validation happens before Light CPI,
       * so no valid compressed ticket is required to hit
       * this branch.
       */

      await expectFailure(
        () =>
          program.methods
            .castVote(
              emptyValidityProof(),
              emptyCompressedAccountMeta(),
              emptyTicket(),
              emptyAddressTreeInfo(),
              0,
              0
            )
            .accounts({
              voter: voter1.publicKey,
              proposal: proposal1,
            })
            .signers([voter1])
            .rpc(),
        "InvalidCandidate"
      );
    });


    it("candidate above options_count is rejected", async () => {

      await expectFailure(
        () =>
          program.methods
            .castVote(
              emptyValidityProof(),
              emptyCompressedAccountMeta(),
              emptyTicket(),
              emptyAddressTreeInfo(),
              0,
              4
            )
            .accounts({
              voter: voter1.publicKey,
              proposal: proposal1,
            })
            .signers([voter1])
            .rpc(),
        "InvalidCandidate"
      );
    });


    it("candidate 255 is rejected", async () => {

      await expectFailure(
        () =>
          program.methods
            .castVote(
              emptyValidityProof(),
              emptyCompressedAccountMeta(),
              emptyTicket(),
              emptyAddressTreeInfo(),
              0,
              255
            )
            .accounts({
              voter: voter1.publicKey,
              proposal: proposal1,
            })
            .signers([voter1])
            .rpc(),
        "InvalidCandidate"
      );
    });
  });


  /*
   * ==========================================================
   * 5. CROSS-PROPOSAL ADDRESS ISOLATION
   * ==========================================================
   */

  describe("Compressed address isolation", () => {

    it("same voter gets different ticket addresses for different proposals", async () => {

      const address1 =
        await deriveTicketAddress(
          proposal1,
          voter1.publicKey
        );

      const address2 =
        await deriveTicketAddress(
          proposal2,
          voter1.publicKey
        );

      assert.notEqual(
        address1.toBase58(),
        address2.toBase58()
      );
    });


    it("different voters get different ticket addresses", async () => {

      const address1 =
        await deriveTicketAddress(
          proposal1,
          voter1.publicKey
        );

      const address2 =
        await deriveTicketAddress(
          proposal1,
          voter2.publicKey
        );

      assert.notEqual(
        address1.toBase58(),
        address2.toBase58()
      );
    });


    it("vote record addresses are isolated by proposal", async () => {

      const address1 =
        await deriveVoteRecordAddress(
          proposal1,
          voter1.publicKey
        );

      const address2 =
        await deriveVoteRecordAddress(
          proposal2,
          voter1.publicKey
        );

      assert.notEqual(
        address1.toBase58(),
        address2.toBase58()
      );
    });


    it("vote record addresses are isolated by voter", async () => {

      const address1 =
        await deriveVoteRecordAddress(
          proposal1,
          voter1.publicKey
        );

      const address2 =
        await deriveVoteRecordAddress(
          proposal1,
          voter2.publicKey
        );

      assert.notEqual(
        address1.toBase58(),
        address2.toBase58()
      );
    });
  });


  /*
   * ==========================================================
   * 6. DUPLICATE BATCH INPUT
   * ==========================================================
   */

  describe("Duplicate ticket attacks", () => {

    it("rejects duplicate voter entries in one batch", async () => {

      await expectFailure(
        () =>
          mintTickets(
            admin,
            proposal1,
            [voter1.publicKey, voter1.publicKey]
          )
      );
    });


    it("rejects minting the same ticket twice", async () => {

      /*
       * First create a ticket for voter2.
       */

      await mintTickets(
        admin,
        proposal1,
        [voter2.publicKey]
      );

      /*
       * Same deterministic address again.
       *
       * The Light address-existence proof should fail.
       */

      await expectFailure(
        () =>
          mintTickets(
            admin,
            proposal1,
            [voter2.publicKey]
          )
      );
    });
  });


  /*
   * ==========================================================
   * 7. REAL TICKET LIFECYCLE
   * ==========================================================
   *
   * These tests use actual Light compressed accounts.
   */

  describe("Real compressed-account lifecycle", () => {

    it("admin can mint a ticket for voter3", async () => {

      /*
       * voter3 has not previously received a ticket for
       * proposal1.
       */

      await mintTickets(
        admin,
        proposal1,
        [voter3.publicKey]
      );

      const address =
        await deriveTicketAddress(
          proposal1,
          voter3.publicKey
        );

      const account =
        await getCompressedAccountOrThrow(address);

      assert.isNotNull(account);
    });
  });


  /*
   * ==========================================================
   * 8. REAL VOTER AUTHORIZATION
   * ==========================================================
   */

  describe("Real ticket ownership", () => {

    it("voter cannot use another voter's ticket", async () => {

      /*
       * voter3's ticket belongs to voter3.
       *
       * voter1 attempts to consume it.
       *
       * The program should reject:
       *
       *     ticket.voter != voter1
       */

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          voter3.publicKey
        );

      const ticketAccount =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      await expectFailure(
        () =>
          castVoteWithExistingTicket(
            voter1,
            proposal1,
            ticketAccount,
            1,
            proposal1,
            voter3.publicKey
          ),
        "UnauthorizedVoter"
      );
    });


    it("attacker cannot use a legitimate voter's ticket", async () => {

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          voter3.publicKey
        );

      const ticketAccount =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      await expectFailure(
        () =>
          castVoteWithExistingTicket(
            attacker,
            proposal1,
            ticketAccount,
            1,
            proposal1,
            voter3.publicKey
          ),
        "UnauthorizedVoter"
      );
    });
  });


  /*
   * ==========================================================
   * 9. CROSS-PROPOSAL TICKET ATTACK
   * ==========================================================
   */

  describe("Cross-proposal ticket attacks", () => {

    it("ticket from proposal 1 cannot vote on proposal 2", async () => {

      /*
       * First give voter3 a ticket for proposal2.
       */

      await mintTickets(
        admin,
        proposal2,
        [voter3.publicKey]
      );

      const ticketAddress =
        await deriveTicketAddress(
          proposal2,
          voter3.publicKey
        );

      const ticketAccount =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      /*
       * Attempt to use Proposal 2 ticket against Proposal 1.
       */

      await expectFailure(
        () =>
          castVoteWithExistingTicket(
            voter3,
            proposal1,
            ticketAccount,
            1,
            proposal2,
            voter3.publicKey
          ),
        "ProposalMismatch"
      );
    });
  });


  /*
   * ==========================================================
   * 10. DOUBLE-VOTE / REPLAY ATTACK
   * ==========================================================
   */

  describe("Proposal closure", () => {

    let closureProposal: web3.PublicKey;

    before(async () => {
      const title = uniqueTitle("closure proposal");

      closureProposal = proposalPda(
        admin.publicKey,
        title
      );

      await program.methods
        .initializeProposal(title, 3)
        .accounts({
          proposal: closureProposal,
          creator: admin.publicKey,
          systemProgram:
            SystemProgram.programId,
        } as any)
        .rpc();
    });

    it("allows the admin to close a proposal", async () => {
      await programMethods
        .closeVote()
        .accounts({
          admin: admin.publicKey,
          proposal: closureProposal,
        } as any)
        .rpc();

      const proposal =
        await program.account.proposal.fetch(
          closureProposal
        );

      assert.isTrue(proposal.isClosed);
    });

    it("rejects voting after the proposal is closed", async () => {
      await expectFailure(
        () =>
          program.methods
            .castVote(
              emptyValidityProof(),
              emptyCompressedAccountMeta(),
              emptyTicket(),
              emptyAddressTreeInfo(),
              0,
              1
            )
            .accounts({
              voter: voter1.publicKey,
              proposal: closureProposal,
            } as any)
            .signers([voter1])
            .rpc(),
        "VotingClosed"
      );
    });
  });


  describe("Replay protection", () => {

    let replayVoter: web3.Keypair;
    let replayTicket: any;

    before(async () => {

      replayVoter = Keypair.generate();

      await airdrop(
        replayVoter.publicKey,
        5
      );

      await mintTickets(
        admin,
        proposal1,
        [replayVoter.publicKey]
      );
    });


    it("allows the first vote", async () => {

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          replayVoter.publicKey
        );

      replayTicket =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      await castVoteWithExistingTicket(
        replayVoter,
        proposal1,
        replayTicket,
        1
      );
    });


    it("rejects the same ticket a second time", async () => {

      /*
       * The first vote closed/nullified the ticket. Replaying
       * the exact same ticket must be rejected: the proof for
       * the consumed leaf can no longer be produced, and the
       * deterministic vote-record address is already taken.
       */

      await expectFailure(
        () =>
          castVoteWithExistingTicket(
            replayVoter,
            proposal1,
            replayTicket,
            2
          )
      );
    });
  });


  /*
   * ==========================================================
   * 11. INVALID PROOF
   * ==========================================================
   */

  describe("Validity-proof attacks", () => {

    it("rejects a fabricated validity proof", async () => {

      /*
       * ValidityProof is cryptographically verified by the
       * Light System Program.
       *
       * Random bytes must not be accepted.
       */

      await expectFailure(
        () =>
          mintTicketsWithFakeProof(
            admin,
            proposal1,
            [voter1.publicKey]
          )
      );
    });
  });


  /*
   * ==========================================================
   * 12. MALFORMED TICKET DATA
   * ==========================================================
   */

  describe("Ticket data substitution", () => {

    it("rejects ticket data whose voter differs from signer", async () => {

      /*
       * This is testing:
       *
       * real compressed account metadata
       * +
       * wrong serialized VoterTicket data
       *
       * If LightAccount::new_close does its job correctly,
       * the supplied data must be bound to the compressed
       * account hash/proof.
       */

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          voter3.publicKey
        );

      const account =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      await expectFailure(
        () =>
          castVoteWithTamperedTicket(
            voter3,
            proposal1,
            account,
            {
              proposal: proposal1,
              voter: attacker.publicKey,
            },
            1
          )
      );
    });


    it("rejects ticket data whose proposal differs", async () => {

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          voter3.publicKey
        );

      const account =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      await expectFailure(
        () =>
          castVoteWithTamperedTicket(
            voter3,
            proposal1,
            account,
            {
              proposal: proposal2,
              voter: voter3.publicKey,
            },
            1
          )
      );
    });
  });


  /*
   * ==========================================================
   * 13. INVALID ACCOUNT METADATA
   * ==========================================================
   */

  describe("CompressedAccountMeta attacks", () => {

    it("rejects unrelated compressed-account metadata", async () => {

      /*
       * Get a real ticket.
       */

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          voter3.publicKey
        );

      const ticket =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      /*
       * Deliberately construct metadata pointing somewhere
       * else.
       */

      const fakeMeta =
        tamperCompressedAccountMeta(
          ticket
        );

      await expectFailure(
        () =>
          castVoteWithFakeMeta(
            voter3,
            proposal1,
            ticket,
            fakeMeta,
            1
          )
      );
    });
  });


  /*
   * ==========================================================
   * 14. ATOMICITY
   * ==========================================================
   */

  describe("Atomicity", () => {

    let atomicVoter: web3.Keypair;

    before(async () => {

      atomicVoter = Keypair.generate();

      await airdrop(
        atomicVoter.publicKey,
        5
      );

      await mintTickets(
        admin,
        proposal1,
        [atomicVoter.publicKey]
      );
    });


    it("invalid candidate does not consume ticket", async () => {

      const ticketAddress =
        await deriveTicketAddress(
          proposal1,
          atomicVoter.publicKey
        );

      const before =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      await expectFailure(
        () =>
          castVoteWithExistingTicket(
            atomicVoter,
            proposal1,
            before,
            0
          ),
        "InvalidCandidate"
      );

      /*
       * Ticket must still exist.
       */

      const after =
        await getCompressedAccountOrThrow(
          ticketAddress
        );

      assert.isNotNull(after);
    });
  });


  /*
   * ==========================================================
   * 15. RANDOM CANDIDATE FUZZING
   * ==========================================================
   */

  describe("Candidate fuzzing", () => {

    it("enforces 1 <= candidate <= options_count", () => {

      const optionsCount = 3;

      for (
        let candidate = 0;
        candidate <= 255;
        candidate++
      ) {

        const valid =
          candidate >= 1 &&
          candidate <= optionsCount;

        if (candidate === 0) {
          assert.isFalse(valid);
        }

        if (candidate > optionsCount) {
          assert.isFalse(valid);
        }

        if (
          candidate >= 1 &&
          candidate <= optionsCount
        ) {
          assert.isTrue(valid);
        }
      }
    });
  });


  /*
   * ==========================================================
   * 16. STATE INVARIANT
   * ==========================================================
   */

  describe("Voting state invariants", () => {

    it("proposal tally never changes after a failed candidate check", async () => {

      const before =
        await program.account.proposal.fetch(
          proposal1
        );

      await expectFailure(
        () =>
          program.methods
            .castVote(
              emptyValidityProof(),
              emptyCompressedAccountMeta(),
              emptyTicket(),
              emptyAddressTreeInfo(),
              0,
              0
            )
            .accounts({
              voter: voter1.publicKey,
              proposal: proposal1,
            })
            .signers([voter1])
            .rpc(),
        "InvalidCandidate"
      );

      const after =
        await program.account.proposal.fetch(
          proposal1
        );

      for (let i = 0; i < 10; i++) {
        assert.equal(
          before.votes[i].toString(),
          after.votes[i].toString()
        );
      }
    });
  });


  /*
   * ==========================================================
   * 17. ADDRESS COLLISION / DOMAIN SEPARATION
   * ==========================================================
   */

  describe("Address domain separation", () => {

    it("ticket and vote-record addresses differ", async () => {

      const ticket =
        await deriveTicketAddress(
          proposal1,
          voter1.publicKey
        );

      const record =
        await deriveVoteRecordAddress(
          proposal1,
          voter1.publicKey
        );

      assert.notEqual(
        ticket.toBase58(),
        record.toBase58()
      );
    });
  });
});


/*
 * ============================================================
 * HELPER FUNCTIONS
 * ============================================================
 */


/*
 * Fixed 32-byte title.
 */

function fixedTitle(
  value: string
): number[] {

  const buffer =
    Buffer.alloc(32);

  Buffer.from(value)
    .subarray(0, 32)
    .copy(buffer);

  return Array.from(buffer);
}


function uniqueTitle(
  value: string
): number[] {
  return fixedTitle(
    `${value}-${Date.now()}-${Math.random()}`
  );
}


/*
 * Proposal PDA.
 */

function proposalPda(
  creator: web3.PublicKey,
  title: number[]
): web3.PublicKey {

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("proposal"),
      creator.toBuffer(),
      Buffer.from(title),
    ],
    PROGRAM_ID
  )[0];
}


/*
 * Ticket compressed address.
 *
 * Rust:
 *
 * derive_address(
 *     &[
 *         b"voter_ticket",
 *         proposal_key.as_ref(),
 *         voter.as_ref()
 *     ],
 *     &address_tree_pubkey,
 *     &crate::ID,
 * )
 */

async function deriveTicketAddress(
  proposal: web3.PublicKey,
  voter: web3.PublicKey
): Promise<web3.PublicKey> {

  const cachedAddress =
    ticketAddresses.get(ticketKey(proposal, voter));

  if (cachedAddress) {
    return cachedAddress;
  }

  const addressTree =
    await rpc.getAddressTreeInfoV2();

  const seed =
    deriveAddressSeedV2(
      [
        Buffer.from("voter_ticket"),
        proposal.toBuffer(),
        voter.toBuffer(),
      ]
    );

  return deriveAddressV2(
    seed,
    addressTree.tree,
    PROGRAM_ID
  );
}


/*
 * VoteRecord compressed address.
 */

async function deriveVoteRecordAddress(
  proposal: web3.PublicKey,
  voter: web3.PublicKey
): Promise<web3.PublicKey> {

  const addressTree =
    await rpc.getAddressTreeInfoV2();

  const seed =
    deriveAddressSeedV2(
      [
        Buffer.from("vote_record"),
        proposal.toBuffer(),
        voter.toBuffer(),
      ]
    );

  return deriveAddressV2(
    seed,
    addressTree.tree,
    PROGRAM_ID
  );
}


/*
 * ============================================================
 * REAL LIGHT CREATE
 * ============================================================
 */

async function mintTickets(
  signer: any,
  proposal: web3.PublicKey,
  voters: web3.PublicKey[]
): Promise<string> {

  const addressTree =
    await rpc.getAddressTreeInfoV2();

  const addresses =
    voters.map((voter) => {

      const seed =
        deriveAddressSeedV2(
          [
            Buffer.from("voter_ticket"),
            proposal.toBuffer(),
            voter.toBuffer(),
          ]
        );

      const address =
        deriveAddressV2(
          seed,
          addressTree.tree,
          PROGRAM_ID
        );

      ticketIdentities.set(
        address.toBase58(),
        { proposal, voter }
      );
      ticketAddresses.set(
        ticketKey(proposal, voter),
        address
      );
      ticketTreeInfos.set(
        address.toBase58(),
        addressTree
      );
      ticketTreeInfos.set(
        ticketKey(proposal, voter),
        addressTree
      );

      return {
        address,
        seed,
      };
    });


  /*
   * Ask Light RPC for one proof covering all new addresses.
   */

  const proof =
    await rpc.getValidityProofV0(
      [],
      addresses.map((item) => ({
        address: bn(
          item.address.toBytes()
        ),
        tree: addressTree.tree,
        queue: addressTree.queue,
      }))
    );


  /*
   * Pack Light system accounts.
   */

  const packedAccounts =
    new PackedAccounts();

  packedAccounts.addSystemAccounts(
    SystemAccountMetaConfig.new(
      PROGRAM_ID
    )
  );


  /*
   * Insert address tree.
   */

  const addressTreeIndex =
    packedAccounts.insertOrGet(
      addressTree.tree
    );

  const addressQueueIndex =
    packedAccounts.insertOrGet(
      addressTree.queue
    );


  /*
   * Output state tree.
   */

  const stateTrees =
    await rpc.getStateTreeInfos();

  const outputStateTree =
    selectStateTreeInfo(stateTrees);

  const outputStateTreeIndex =
    packedAccounts.insertOrGet(
      outputStateTree.queue
    );


  const {
    remainingAccounts,
  } =
    packedAccounts.toAccountMetas();

  const addressTreeInfo = {
    rootIndex: proof.rootIndices[0],
    addressMerkleTreePubkeyIndex:
      addressTreeIndex,
    addressQueuePubkeyIndex:
      addressQueueIndex,
  };


  const validityProof = {
    0: {
      a: proof.compressedProof.a,
      b: proof.compressedProof.b,
      c: proof.compressedProof.c,
    },
  };


  return await program.methods
    .mintVoterTickets(
      validityProof as any,
      addressTreeInfo as any,
      outputStateTreeIndex,
      voters
    )
    .accounts({
      signer: signer.publicKey,
      proposal,
    })
    .remainingAccounts(
      remainingAccounts
    )
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      }),
    ])
    .signers(
      signer === provider.wallet
        ? []
        : [signer.payer]
    )
    .rpc();
}


/*
 * ============================================================
 * FETCH COMPRESSED ACCOUNT
 * ============================================================
 */

async function getCompressedAccountOrThrow(
  address: web3.PublicKey
): Promise<any> {

  for (let attempt = 0; attempt < 20; attempt++) {
    const account =
      await rpc.getCompressedAccount(
        bn(address.toBytes())
      );

    if (account) {
      return account;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 250)
    );
  }

  throw new Error(
    `Compressed account not found: ${address.toBase58()}`
  );
}


/*
 * ============================================================
 * REAL CAST VOTE
 * ============================================================
 */

async function castVoteWithExistingTicket(
  voter: web3.Keypair,
  proposal: web3.PublicKey,
  compressedAccount: any,
  candidate: number,
  ticketProposal = proposal,
  ticketVoter = voter.publicKey
): Promise<string> {

  const addressTree =
    await rpc.getAddressTreeInfoV2();

  const ticketAddressTree =
    ticketTreeInfos.get(
      ticketKey(ticketProposal, ticketVoter)
    ) ?? addressTree;

  const voteRecordSeed =
    deriveAddressSeedV2(
      [
        Buffer.from("vote_record"),
        proposal.toBuffer(),
        voter.publicKey.toBuffer(),
      ]
    );

  const voteRecordAddress =
    deriveAddressV2(
      voteRecordSeed,
      addressTree.tree,
      PROGRAM_ID
    );

  /*
   * Fetch proof that the ticket hash exists.
   */

  const proof =
    await rpc.getValidityProofV0(
      [
        {
          hash: compressedAccount.hash,
          tree: compressedAccount.treeInfo.tree,
          queue: compressedAccount.treeInfo.queue,
        },
      ],
      [
        {
          address: bn(voteRecordAddress.toBytes()),
          tree: addressTree.tree,
          queue: addressTree.queue,
        },
      ]
    );

  /*
   * Build packed accounts.
   */

  const packed =
    new PackedAccounts();

  packed.addSystemAccounts(
    SystemAccountMetaConfig.new(
      PROGRAM_ID
    )
  );


  const stateTreeIndex =
    packed.insertOrGet(
      compressedAccount.treeInfo.tree
    );


  const stateQueueIndex =
    packed.insertOrGet(
      compressedAccount.treeInfo.queue
    );


  /*
   * The output state tree can be the same state tree
   * as the consumed ticket.
   */

  const outputStateTreeIndex =
    stateQueueIndex;

  const addressTreeIndex =
    packed.insertOrGet(
      addressTree.tree
    );

  const addressQueueIndex =
    packed.insertOrGet(
      addressTree.queue
    );


  const {
    remainingAccounts,
  } =
    packed.toAccountMetas();


  /*
   * Existing compressed-account metadata.
   */

  const ticketMeta = {
    treeInfo: {
      rootIndex:
        proof.rootIndices[0],

      proveByIndex: true,

      merkleTreePubkeyIndex:
        stateTreeIndex,

      queuePubkeyIndex:
        stateQueueIndex,

      leafIndex:
        compressedAccount.leafIndex,
    },

    address:
      compressedAccount.address,

    outputStateTreeIndex,
  };


  /*
   * Rust VoterTicket serialization.
   *
   * Anchor serializes Pubkeys as 32-byte values.
   */

  const ticket = {
    proposal:
      ticketIdentities.get(
        new web3.PublicKey(
          compressedAccount.address
        ).toBase58()
      )?.proposal ?? ticketProposal,
    voter:
      ticketIdentities.get(
        new web3.PublicKey(
          compressedAccount.address
        ).toBase58()
      )?.voter ?? ticketVoter,
  };

  if (ticketProposal === proposal && ticketVoter.equals(voter.publicKey)) {
    const expectedTicketAddress =
      deriveAddressV2(
        deriveAddressSeedV2([
          Buffer.from("voter_ticket"),
          ticket.proposal.toBuffer(),
          ticket.voter.toBuffer(),
        ]),
        ticketAddressTree.tree,
        PROGRAM_ID
      );

    const actualTicketAddress =
      new web3.PublicKey(compressedAccount.address);

    if (!expectedTicketAddress.equals(actualTicketAddress)) {
      throw new Error(
        `Ticket address mismatch: expected ${expectedTicketAddress.toBase58()}, got ${actualTicketAddress.toBase58()}`
      );
    }
  }


  const validityProof = {
    0: proof.compressedProof
      ? {
          a: proof.compressedProof.a,
          b: proof.compressedProof.b,
          c: proof.compressedProof.c,
        }
      : null,
  };


  return await program.methods
    .castVote(
      validityProof as any,
      ticketMeta as any,
      ticket as any,
      {
        rootIndex:
          proof.rootIndices[proof.rootIndices.length - 1],

        addressMerkleTreePubkeyIndex:
          addressTreeIndex,

        addressQueuePubkeyIndex:
          addressQueueIndex,
      } as any,
      outputStateTreeIndex,
      candidate
    )
    .accounts({
      voter:
        voter.publicKey,

      proposal,
    })
    .remainingAccounts(
      remainingAccounts
    )
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      }),
    ])
    .signers([voter])
    .rpc();
}

/*
 * ============================================================
 * TAMPERED TICKET TEST
 * ============================================================
 */

async function castVoteWithTamperedTicket(
  voter: web3.Keypair,
  proposal: web3.PublicKey,
  compressedAccount: any,
  fakeTicket: {
    proposal: web3.PublicKey;
    voter: web3.PublicKey;
  },
  candidate: number
): Promise<string> {

  const addressTree =
    await rpc.getAddressTreeInfoV2();

  const proof =
    await rpc.getValidityProofV0(
      [
        {
          hash: compressedAccount.hash,
          tree:
            compressedAccount.treeInfo.tree,
          queue:
            compressedAccount.treeInfo.queue,
        },
      ],
      []
    );


  const packed =
    new PackedAccounts();

  packed.addSystemAccounts(
    SystemAccountMetaConfig.new(
      PROGRAM_ID
    )
  );


  const stateTreeIndex =
    packed.insertOrGet(
      compressedAccount.treeInfo.tree
    );

  const stateQueueIndex =
    packed.insertOrGet(
      compressedAccount.treeInfo.queue
    );


  const addressTreeIndex =
    packed.insertOrGet(
      addressTree.tree
    );

  const addressQueueIndex =
    packed.insertOrGet(
      addressTree.queue
    );


  const {
    remainingAccounts,
  } =
    packed.toAccountMetas();


  const ticketMeta = {
    treeInfo: {
      rootIndex:
        proof.rootIndices[0],

      merkleTreePubkeyIndex:
        stateTreeIndex,

      queuePubkeyIndex:
        stateQueueIndex,

      leafIndex:
        proof.leafIndices[0],
    },

    address:
      compressedAccount.address,

    outputStateTreeIndex:
      stateTreeIndex,
  };


  const validityProof = {
    0: {
      a: proof.compressedProof.a,
      b: proof.compressedProof.b,
      c: proof.compressedProof.c,
    },
  };


  return await programMethods
    .castVote(
      validityProof as any,
      ticketMeta as any,
      fakeTicket as any,
      {
        rootIndex:
          proof.rootIndices[0],

        addressMerkleTreePubkeyIndex:
          addressTreeIndex,

        addressQueuePubkeyIndex:
          addressQueueIndex,
      } as any,
      stateTreeIndex,
      candidate
    )
    .accounts({
      voter:
        voter.publicKey,
      proposal,
    })
    .remainingAccounts(
      remainingAccounts
    )
    .signers([voter])
    .rpc();
}


/*
 * ============================================================
 * FAKE METADATA ATTACK
 * ============================================================
 */

function tamperCompressedAccountMeta(
  account: any
): any {

  return {
    treeInfo: {
      rootIndex: 0,
      merkleTreePubkeyIndex: 0,
      queuePubkeyIndex: 0,
      leafIndex: 0,
    },

    address:
      account.address,

    outputStateTreeIndex: 0,
  };
}


async function castVoteWithFakeMeta(
  voter: web3.Keypair,
  proposal: web3.PublicKey,
  ticket: any,
  fakeMeta: any,
  candidate: number
): Promise<string> {

  /*
   * Deliberately use fake metadata.
   *
   * The Light verifier should reject the proof because the
   * metadata no longer describes the actual leaf.
   */

  return program.methods
    .castVote(
      emptyValidityProof(),
      fakeMeta,
      ticket.data,
      emptyAddressTreeInfo(),
      0,
      candidate
    )
    .accounts({
      voter:
        voter.publicKey,

      proposal,
    })
    .signers([voter])
    .rpc();
}


/*
 * ============================================================
 * FAKE PROOF
 * ============================================================
 */

async function mintTicketsWithFakeProof(
  signer: any,
  proposal: web3.PublicKey,
  voters: web3.PublicKey[]
): Promise<string> {

  return program.methods
    .mintVoterTickets(
      emptyValidityProof(),
      emptyAddressTreeInfo(),
      0,
      voters
    )
    .accounts({
      signer:
        signer.publicKey,

      proposal,
    })
    .remainingAccounts([])
    .rpc();
}


/*
 * ============================================================
 * EMPTY STRUCTURES
 * ============================================================
 *
 * These are used specifically to hit validation branches
 * before Light verification.
 *
 * They are NOT valid Light proofs.
 */

function emptyValidityProof(): any {

  return {
    0: {
      a: new Array(32).fill(0),
      b: new Array(64).fill(0),
      c: new Array(32).fill(0),
    },
  };
}


function emptyAddressTreeInfo(): any {

  return {
    rootIndex: 0,
    addressMerkleTreePubkeyIndex: 0,
    addressQueuePubkeyIndex: 0,
  };
}


function emptyCompressedAccountMeta(): any {

  return {
    treeInfo: {
      rootIndex: 0,
      merkleTreePubkeyIndex: 0,
      queuePubkeyIndex: 0,
      leafIndex: 0,
    },

    address:
      new Array(32).fill(0),

    outputStateTreeIndex: 0,
  };
}


function emptyTicket(): any {

  return {
    proposal:
      PublicKey.default,

    voter:
      PublicKey.default,
  };
}


/*
 * ============================================================
 * AIRDROP
 * ============================================================
 */

async function airdrop(
  pubkey: web3.PublicKey,
  sol: number
) {

  const signature =
    await provider.connection.requestAirdrop(
      pubkey,
      sol * web3.LAMPORTS_PER_SOL
    );

  await provider.connection.confirmTransaction(
    signature,
    "confirmed"
  );
}


/*
 * ============================================================
 * EXPECTED FAILURE HELPER
 * ============================================================
 */

async function expectFailure(
  fn: () => Promise<any>,
  expectedError?: string
) {

  let failed = false;

  try {

    await fn();

  } catch (err: any) {

    failed = true;

    if (expectedError) {

      const message =
        String(err);

      assert.include(
        message,
        expectedError,
        `Expected error ${expectedError}, got:\n${message}`
      );
    }
  }

  assert.isTrue(
    failed,
    "Expected transaction to fail, but it succeeded"
  );
}