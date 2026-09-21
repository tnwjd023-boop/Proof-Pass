use anchor_lang::prelude::*;
mod payout_math;
use payout_math::balances_after_payout;

declare_id!("BvFezGdFzEgKwGKntXK1acyv9tzcKowRJXy5EjFt14i8");

/// Gate 0 feasibility program. No cross-chain authorization or mandate logic yet.
#[program]
pub mod gate0_vault {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.vault.authority = ctx.accounts.authority.key();
        ctx.accounts.vault.bump = ctx.bumps.vault;
        Ok(())
    }
    pub fn pay(ctx: Context<Pay>, amount: u64) -> Result<()> {
        let vault = ctx.accounts.vault.to_account_info();
        let recipient = ctx.accounts.recipient.to_account_info();
        let rent = Rent::get()?.minimum_balance(vault.data_len());
        let (vault_after, recipient_after) = balances_after_payout(vault.lamports(), recipient.lamports(), rent, amount)
            .map_err(|_| error!(VaultError::InvalidPayment))?;
        // All validation precedes mutation. Runtime rolls back the entire tx on failure.
        **vault.try_borrow_mut_lamports()? = vault_after;
        **recipient.try_borrow_mut_lamports()? = recipient_after;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + 32 + 1,
        seeds = [b"gate0-vault", authority.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pay<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority,
        seeds = [b"gate0-vault", authority.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, constraint = recipient.key() != vault.key() @ VaultError::InvalidRecipient)]
    pub recipient: SystemAccount<'info>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum VaultError {
    #[msg("Payment must be positive, funded, rent preserving, and non-overflowing")]
    InvalidPayment,
    #[msg("Vault cannot be its own recipient")]
    InvalidRecipient,
}
