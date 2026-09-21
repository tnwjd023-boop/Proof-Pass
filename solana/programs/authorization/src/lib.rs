use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;
pub mod request;
use request::{PaymentRequest, valid_source_lease};

declare_id!("3983maEGpsg2M5tTqBqMtLm5rRmZsYKTDDUZAnrPuBAJ");
const BOOTSTRAP_ADMIN: Pubkey = pubkey!("2ERjBJoGRjmbYVmN9Uduwy3X7tcw984NmizZhswRFfZu");

#[program]
pub mod proofpass_authorization {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, relay: Pubkey, observer: Pubkey,
        policy_id: [u8; 32], cluster: [u8; 32]) -> Result<()> {
        require!(relay != Pubkey::default() && observer != Pubkey::default(), AuthError::Authority);
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key(); c.relay = relay; c.observer = observer;
        c.policy_id = policy_id; c.policy_version = 1; c.cluster = cluster;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn initialize_mandate(ctx: Context<InitializeMandate>, agent: Pubkey, commitment: [u8; 32],
        source_handle: [u8; 32], not_before: u64, expires_at: u64) -> Result<()> {
        require!(agent != Pubkey::default() && commitment != [0; 32] && source_handle != [0; 32], AuthError::Mandate);
        let now = clock()?;
        require!(not_before < expires_at && now < expires_at, AuthError::Expired);
        let m = &mut ctx.accounts.mandate;
        m.owner = ctx.accounts.owner.key(); m.agent = agent; m.commitment = commitment;
        m.source_handle = source_handle; m.epoch = 1; m.active = true;
        m.not_before = not_before; m.expires_at = expires_at; m.bump = ctx.bumps.mandate;
        let v = &mut ctx.accounts.vault;
        v.owner = m.owner; v.mandate = m.key(); v.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn renew_mandate(ctx: Context<ManageMandate>, agent: Pubkey, commitment: [u8; 32],
        source_handle: [u8; 32], not_before: u64, expires_at: u64) -> Result<()> {
        require!(agent != Pubkey::default() && commitment != [0; 32] && source_handle != [0; 32], AuthError::Mandate);
        require!(not_before < expires_at && clock()? < expires_at, AuthError::Expired);
        let m = &mut ctx.accounts.mandate;
        m.epoch = m.epoch.checked_add(1).ok_or(AuthError::Overflow)?;
        m.agent = agent; m.commitment = commitment; m.source_handle = source_handle;
        m.not_before = not_before; m.expires_at = expires_at; m.active = true;
        Ok(())
    }

    pub fn revoke_mandate(ctx: Context<ManageMandate>) -> Result<()> {
        let m = &mut ctx.accounts.mandate;
        m.epoch = m.epoch.checked_add(1).ok_or(AuthError::Overflow)?;
        m.active = false;
        Ok(())
    }

    pub fn fund_vault(ctx: Context<FundVault>, amount: u64) -> Result<()> {
        require!(amount > 0, AuthError::Amount);
        anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer { from: ctx.accounts.owner.to_account_info(), to: ctx.accounts.vault.to_account_info() }), amount)
    }

    pub fn withdraw_vault(ctx: Context<WithdrawVault>, amount: u64) -> Result<()> {
        move_lamports(&ctx.accounts.vault.to_account_info(), &ctx.accounts.owner.to_account_info(), amount)
    }

    pub fn update_source_status(ctx: Context<UpdateSource>, handle: [u8; 32], epoch: u64, active: bool,
        ledger_index: u64, ledger_hash: [u8; 32], observed_at: u64, valid_until: u64) -> Result<()> {
        require!(handle != [0; 32] && epoch > 0 && ledger_index > 0, AuthError::Source);
        require!(valid_source_lease(Clock::get()?.unix_timestamp, observed_at, valid_until, active), AuthError::Expired);
        let s = &mut ctx.accounts.source;
        if s.epoch > 0 {
            require!(epoch >= s.epoch && ledger_index >= s.ledger_index && observed_at >= s.observed_at, AuthError::Rollback);
            if epoch == s.epoch { require!(active == s.active, AuthError::Rollback); }
            if ledger_index == s.ledger_index {
                require!(ledger_hash == s.ledger_hash && epoch == s.epoch, AuthError::Rollback);
            }
        }
        s.handle = handle; s.epoch = epoch; s.active = active; s.ledger_index = ledger_index;
        s.ledger_hash = ledger_hash; s.observed_at = observed_at; s.valid_until = valid_until; s.bump = ctx.bumps.source;
        Ok(())
    }

    pub fn record_authorization(ctx: Context<RecordAuthorization>, request: PaymentRequest,
        mandate_commitment: [u8; 32], source_epoch: u64, midnight_ref: [u8; 32]) -> Result<()> {
        validate_request(&request, &ctx.accounts.config, &ctx.accounts.mandate, &ctx.accounts.vault,
            &ctx.accounts.source, mandate_commitment, source_epoch)?;
        require!(midnight_ref != [0; 32], AuthError::Authorization);
        let a = &mut ctx.accounts.authorization;
        a.owner = ctx.accounts.mandate.owner; a.request_id = request.request_id;
        a.request_hash = hash(&request.encode()).to_bytes(); a.mandate_commitment = mandate_commitment;
        a.mandate_epoch = request.mandate_epoch; a.source_handle = ctx.accounts.source.handle;
        a.source_epoch = source_epoch; a.expires_at = request.expires_at;
        a.midnight_ref = midnight_ref; a.consumed = false; a.bump = ctx.bumps.authorization;
        Ok(())
    }

    pub fn execute_payment(ctx: Context<ExecutePayment>, request: PaymentRequest) -> Result<()> {
        let a = &ctx.accounts.authorization;
        require!(!a.consumed, AuthError::Consumed);
        require!(a.request_hash == hash(&request.encode()).to_bytes()
            && a.owner.to_bytes() == request.owner && a.request_id == request.request_id
            && a.mandate_epoch == request.mandate_epoch && a.expires_at == request.expires_at,
            AuthError::Authorization);
        require!(a.source_handle == ctx.accounts.source.handle, AuthError::Source);
        require!(ctx.accounts.agent.key().to_bytes() == request.agent_key, AuthError::Authority);
        require!(ctx.accounts.recipient.key().to_bytes() == request.recipient, AuthError::Recipient);
        validate_request(&request, &ctx.accounts.config, &ctx.accounts.mandate, &ctx.accounts.vault,
            &ctx.accounts.source, a.mandate_commitment, a.source_epoch)?;
        move_lamports(&ctx.accounts.vault.to_account_info(), &ctx.accounts.recipient.to_account_info(), request.amount_base_units)?;
        ctx.accounts.authorization.consumed = true;
        Ok(())
    }
}

fn clock() -> Result<u64> {
    u64::try_from(Clock::get()?.unix_timestamp).map_err(|_| error!(AuthError::Expired))
}
fn validate_request(p: &PaymentRequest, c: &Config, m: &Account<Mandate>, v: &Account<Vault>,
    s: &SourceStatus, commitment: [u8; 32], source_epoch: u64) -> Result<()> {
    let now = clock()?;
    require!(p.version == 1 && p.policy_id == c.policy_id && p.policy_version == c.policy_version
        && p.destination_cluster == c.cluster && p.program_id == ID.to_bytes() && p.asset_id == [0; 32], AuthError::Policy);
    require!(p.amount_base_units > 0, AuthError::Amount);
    require!(p.owner == m.owner.to_bytes() && p.agent_key == m.agent.to_bytes() && p.vault == v.key().to_bytes()
        && v.owner == m.owner && v.mandate == m.key(), AuthError::Mandate);
    require!(m.active && m.epoch == p.mandate_epoch && m.commitment == commitment, AuthError::Mandate);
    require!(m.not_before <= now && now < p.expires_at && p.expires_at <= m.expires_at, AuthError::Expired);
    require!(s.active && s.epoch == source_epoch && s.handle == m.source_handle, AuthError::Source);
    require!(now < s.valid_until && p.expires_at <= s.valid_until && p.expires_at <= now.saturating_add(60), AuthError::Expired);
    Ok(())
}
fn move_lamports(vault: &AccountInfo, recipient: &AccountInfo, amount: u64) -> Result<()> {
    require!(amount > 0 && vault.key != recipient.key, AuthError::Amount);
    let after = vault.lamports().checked_sub(amount).ok_or(AuthError::Amount)?;
    require!(after >= Rent::get()?.minimum_balance(vault.data_len()), AuthError::Amount);
    let recipient_after = recipient.lamports().checked_add(amount).ok_or(AuthError::Overflow)?;
    **vault.try_borrow_mut_lamports()? = after;
    **recipient.try_borrow_mut_lamports()? = recipient_after;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut, address = BOOTSTRAP_ADMIN)] pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)] pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct InitializeMandate<'info> {
    #[account(mut)] pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + Mandate::INIT_SPACE, seeds = [b"mandate", owner.key().as_ref()], bump)] pub mandate: Account<'info, Mandate>,
    #[account(init, payer = owner, space = 8 + Vault::INIT_SPACE, seeds = [b"vault", owner.key().as_ref()], bump)] pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ManageMandate<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, seeds = [b"mandate", owner.key().as_ref()], bump = mandate.bump)] pub mandate: Account<'info, Mandate>,
}
#[derive(Accounts)]
pub struct FundVault<'info> {
    #[account(mut)] pub owner: Signer<'info>,
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump = vault.bump)] pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct WithdrawVault<'info> {
    #[account(mut)] pub owner: Signer<'info>,
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump = vault.bump)] pub vault: Account<'info, Vault>,
}
#[derive(Accounts)]
#[instruction(handle: [u8; 32])]
pub struct UpdateSource<'info> {
    #[account(mut)] pub observer: Signer<'info>,
    #[account(has_one = observer, seeds = [b"config"], bump = config.bump)] pub config: Account<'info, Config>,
    // Persistent account with no close instruction; updates always check monotonicity.
    #[account(init_if_needed, payer = observer, space = 8 + SourceStatus::INIT_SPACE, seeds = [b"source", handle.as_ref()], bump)] pub source: Account<'info, SourceStatus>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(request: PaymentRequest)]
pub struct RecordAuthorization<'info> {
    #[account(mut)] pub relay: Signer<'info>,
    #[account(has_one = relay, seeds = [b"config"], bump = config.bump)] pub config: Account<'info, Config>,
    #[account(seeds = [b"mandate", request.owner.as_ref()], bump = mandate.bump)] pub mandate: Account<'info, Mandate>,
    #[account(seeds = [b"vault", request.owner.as_ref()], bump = vault.bump)] pub vault: Account<'info, Vault>,
    #[account(seeds = [b"source", mandate.source_handle.as_ref()], bump = source.bump)] pub source: Account<'info, SourceStatus>,
    #[account(init, payer = relay, space = 8 + Authorization::INIT_SPACE,
        seeds = [b"authorization", request.owner.as_ref(), request.request_id.as_ref()], bump)] pub authorization: Account<'info, Authorization>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(request: PaymentRequest)]
pub struct ExecutePayment<'info> {
    pub agent: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)] pub config: Account<'info, Config>,
    #[account(seeds = [b"mandate", request.owner.as_ref()], bump = mandate.bump)] pub mandate: Account<'info, Mandate>,
    #[account(mut, seeds = [b"vault", request.owner.as_ref()], bump = vault.bump)] pub vault: Account<'info, Vault>,
    #[account(seeds = [b"source", mandate.source_handle.as_ref()], bump = source.bump)] pub source: Account<'info, SourceStatus>,
    #[account(mut, seeds = [b"authorization", request.owner.as_ref(), request.request_id.as_ref()], bump = authorization.bump)] pub authorization: Account<'info, Authorization>,
    #[account(mut)] pub recipient: SystemAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Config { pub admin: Pubkey, pub relay: Pubkey, pub observer: Pubkey, pub policy_id: [u8; 32], pub policy_version: u32, pub cluster: [u8; 32], pub bump: u8 }
#[account]
#[derive(InitSpace)]
pub struct Mandate { pub owner: Pubkey, pub agent: Pubkey, pub commitment: [u8; 32], pub source_handle: [u8; 32], pub epoch: u64, pub active: bool, pub not_before: u64, pub expires_at: u64, pub bump: u8 }
#[account]
#[derive(InitSpace)]
pub struct Vault { pub owner: Pubkey, pub mandate: Pubkey, pub bump: u8 }
#[account]
#[derive(InitSpace)]
pub struct SourceStatus { pub handle: [u8; 32], pub epoch: u64, pub active: bool, pub ledger_index: u64, pub ledger_hash: [u8; 32], pub observed_at: u64, pub valid_until: u64, pub bump: u8 }
#[account]
#[derive(InitSpace)]
pub struct Authorization { pub owner: Pubkey, pub request_id: [u8; 32], pub request_hash: [u8; 32], pub mandate_commitment: [u8; 32], pub mandate_epoch: u64, pub source_handle: [u8; 32], pub source_epoch: u64, pub expires_at: u64, pub midnight_ref: [u8; 32], pub consumed: bool, pub bump: u8 }
#[error_code]
pub enum AuthError {
    #[msg("Wrong authority")] Authority,
    #[msg("Wrong mandate or epoch")] Mandate,
    #[msg("Expired or invalid lease")] Expired,
    #[msg("Invalid source status")] Source,
    #[msg("Source observation rollback or conflict")] Rollback,
    #[msg("Wrong policy or destination")] Policy,
    #[msg("Invalid authorization")] Authorization,
    #[msg("Authorization already consumed")] Consumed,
    #[msg("Wrong recipient")] Recipient,
    #[msg("Invalid payment amount or insufficient funds")] Amount,
    #[msg("Arithmetic overflow")] Overflow,
}
