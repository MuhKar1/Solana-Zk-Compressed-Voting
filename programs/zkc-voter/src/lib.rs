#![allow(unexpected_cfgs)]

use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use light_sdk::{
    account::LightAccount,
    address::v2::derive_address,
    cpi::{
        v2::{CpiAccounts, LightSystemProgramCpi},
        InvokeLightSystemProgram, LightCpiInstruction,
    },
    derive_light_cpi_signer,
    instruction::{account_meta::CompressedAccountMeta, PackedAddressTreeInfo, ValidityProof},
    CpiSigner, LightDiscriminator, PackedAddressTreeInfoExt,
};

declare_id!("D8E4AStuNybRhwSe2RDhQkVxoooKJDvphFmqnPBjSYkW");

pub const LIGHT_CPI_SIGNER: CpiSigner =
    derive_light_cpi_signer!("D8E4AStuNybRhwSe2RDhQkVxoooKJDvphFmqnPBjSYkW");

#[program]
pub mod zkc_voter {
    use super::*;

    /// Initialize a standard proposal PDA account supporting between 2 and 10 options.
    pub fn initialize_proposal<'info>(
        ctx: Context<'_, '_, '_, 'info, InitializeProposal<'info>>,
        title: [u8; 32],
        options_count: u8,
    ) -> Result<()> {
        require!(
            options_count >= 2 && options_count <= 10,
            VotingError::InvalidOptionsCount
        );

        let proposal = &mut ctx.accounts.proposal;
        proposal.creator = ctx.accounts.creator.key();
        proposal.title = title;
        proposal.options_count = options_count;
        proposal.votes = [0; 10];
        proposal.is_closed = false;
        proposal.bump = ctx.bumps.proposal;
        Ok(())
    }

    /// Admin batch-mints deterministic compressed VoterTickets.
    /// Uses seeds [b"voter_ticket", proposal, voter] to enforce 1 Voter = 1 Ticket per proposal.
    pub fn mint_voter_tickets<'info>(
        ctx: Context<'_, '_, '_, 'info, MintVoterTickets<'info>>,
        proof: ValidityProof,
        address_tree_info: PackedAddressTreeInfo,
        output_state_tree_index: u8,
        voters: Vec<Pubkey>,
    ) -> Result<()> {
        let proposal_key = ctx.accounts.proposal.key();

        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.signer.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );
        let address_tree_pubkey = address_tree_info
            .get_tree_pubkey(&light_cpi_accounts)
            .map_err(|_| ProgramError::NotEnoughAccountKeys)?;

        let mut cpi = LightSystemProgramCpi::new_cpi(crate::LIGHT_CPI_SIGNER, proof);
        let mut new_addresses = Vec::with_capacity(voters.len());

        for (index, voter) in voters.iter().enumerate() {
            let (address, address_seed) = derive_address(
                &[b"voter_ticket", proposal_key.as_ref(), voter.as_ref()],
                &address_tree_pubkey,
                &crate::ID,
            );

            let mut ticket = LightAccount::<VoterTicket>::new_init(
                &crate::ID,
                Some(address),
                output_state_tree_index,
            );
            ticket.proposal = proposal_key;
            ticket.voter = *voter;

            new_addresses.push(
                address_tree_info
                    .into_new_address_params_assigned_packed(address_seed, Some(index as u8)),
            );
            cpi = cpi.with_light_account(ticket)?;
        }

        cpi.with_new_addresses(&new_addresses)
            .invoke(light_cpi_accounts)?;

        Ok(())
    }

    /// Voter consumes their VoterTicket, creates a VoteRecord, and increments the tally.
    pub fn cast_vote<'info>(
        ctx: Context<'_, '_, '_, 'info, CastVote<'info>>,
        proof: ValidityProof,
        ticket_meta: CompressedAccountMeta,
        ticket: VoterTicket,
        address_tree_info: PackedAddressTreeInfo,
        output_state_tree_index: u8,
        candidate_id: u8,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let proposal_key = proposal.key();
        let voter_key = ctx.accounts.voter.key();

        require!(!proposal.is_closed, VotingError::VotingClosed);
        require!(
            candidate_id >= 1 && candidate_id <= proposal.options_count,
            VotingError::InvalidCandidate
        );

        // Re-verify the canonical proposal PDA from its own stored data.
        let (expected_proposal, _) = Pubkey::find_program_address(
            &[b"proposal", proposal.creator.as_ref(), proposal.title.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(proposal_key, expected_proposal, VotingError::InvalidProposal);

        // The ticket must belong to this proposal and this voter.
        require_keys_eq!(ticket.proposal, proposal_key, VotingError::ProposalMismatch);
        require_keys_eq!(ticket.voter, voter_key, VotingError::UnauthorizedVoter);

        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.voter.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );
        let address_tree_pubkey = address_tree_info
            .get_tree_pubkey(&light_cpi_accounts)
            .map_err(|_| ProgramError::NotEnoughAccountKeys)?;

        // 1. CONSUME (close/nullify) the input VoterTicket compressed account.
        let ticket_account =
            LightAccount::<VoterTicket>::new_close(&crate::ID, &ticket_meta, ticket)
                .map_err(ProgramError::from)?;

        // 2. CREATE a new compressed VoteRecord leaf as an on-chain receipt.
        let (address, address_seed) = derive_address(
            &[b"vote_record", proposal_key.as_ref(), voter_key.as_ref()],
            &address_tree_pubkey,
            &crate::ID,
        );
        let mut vote_record = LightAccount::<VoteRecord>::new_init(
            &crate::ID,
            Some(address),
            output_state_tree_index,
        );
        vote_record.proposal = proposal_key;
        vote_record.voter = voter_key;
        vote_record.candidate_id = candidate_id;

        LightSystemProgramCpi::new_cpi(crate::LIGHT_CPI_SIGNER, proof)
            .with_light_account(ticket_account)?
            .with_light_account(vote_record)?
            .with_new_addresses(&[address_tree_info
                .into_new_address_params_assigned_packed(address_seed, Some(1))])
            .invoke(light_cpi_accounts)?;

        // 3. Update the candidate's vote tally using safe arithmetic.
        let index = candidate_id
            .checked_sub(1)
            .ok_or(VotingError::InvalidCandidate)? as usize;
        proposal.votes[index] = proposal.votes[index]
            .checked_add(1)
            .ok_or(VotingError::MathOverflow)?;

        Ok(())
    }

    /// Admin closes a proposal so no further votes can be cast.
    pub fn close_vote<'info>(
        ctx: Context<'_, '_, '_, 'info, CloseVote<'info>>,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require_keys_eq!(
            ctx.accounts.admin.key(),
            proposal.creator,
            VotingError::UnauthorizedAdmin
        );

        proposal.is_closed = true;
        Ok(())
    }
}

// ==========================================
// STATE DEFINITIONS
// ==========================================

/// Standard On-Chain Storage (low-cardinality global state).
#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub creator: Pubkey,
    pub title: [u8; 32],
    pub options_count: u8,
    pub votes: [u64; 10],
    pub is_closed: bool,
    pub bump: u8,
}

/// Compressed Account: deterministic seed-derived ticket (UTXO).
#[derive(Clone, Debug, Default, LightDiscriminator, AnchorSerialize, AnchorDeserialize)]
pub struct VoterTicket {
    pub proposal: Pubkey,
    pub voter: Pubkey,
}

/// Compressed Account: spent-vote receipt.
#[derive(Clone, Debug, Default, LightDiscriminator, AnchorSerialize, AnchorDeserialize)]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub candidate_id: u8,
}

// Expose the compressed-account schemas in the generated IDL.
#[event]
pub struct AccountTypes {
    pub voter_ticket: VoterTicket,
    pub vote_record: VoteRecord,
}

// ==========================================
// INSTRUCTION CONTEXTS
// ==========================================

#[derive(Accounts)]
#[instruction(title: [u8; 32], options_count: u8)]
pub struct InitializeProposal<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", creator.key().as_ref(), title.as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintVoterTickets<'info> {
    #[account(
        mut,
        constraint = signer.key() == proposal.creator @ VotingError::UnauthorizedAdmin
    )]
    pub signer: Signer<'info>,
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct CloseVote<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

// ==========================================
// ERROR CODES
// ==========================================

#[error_code]
pub enum VotingError {
    #[msg("Invalid candidate selected.")]
    InvalidCandidate,
    #[msg("Options count must be between 2 and 10.")]
    InvalidOptionsCount,
    #[msg("Voter ticket does not match this proposal.")]
    ProposalMismatch,
    #[msg("Signer is not authorized for this voter ticket.")]
    UnauthorizedVoter,
    #[msg("Only the proposal creator can mint voter tickets.")]
    UnauthorizedAdmin,
    #[msg("Calculation resulted in arithmetic overflow.")]
    MathOverflow,
    #[msg("The provided proposal account is not the canonical PDA.")]
    InvalidProposal,
    #[msg("Voting is closed for this proposal.")]
    VotingClosed,
}
