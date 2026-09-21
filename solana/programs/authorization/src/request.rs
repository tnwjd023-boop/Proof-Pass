#[cfg(feature = "anchor")]
use anchor_lang::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "anchor", derive(AnchorSerialize, AnchorDeserialize))]
pub struct PaymentRequest {
    pub version: u16,
    pub policy_id: [u8; 32],
    pub policy_version: u32,
    pub destination_cluster: [u8; 32],
    pub program_id: [u8; 32],
    pub owner: [u8; 32],
    pub agent_key: [u8; 32],
    pub vault: [u8; 32],
    pub recipient: [u8; 32],
    pub asset_id: [u8; 32],
    pub amount_base_units: u64,
    pub request_id: [u8; 32],
    pub mandate_epoch: u64,
    pub expires_at: u64,
}

impl PaymentRequest {
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = b"PROOFPASS:AGENT_PAYMENT_AUTH:V1".to_vec();
        bytes.extend(self.version.to_le_bytes());
        bytes.extend(self.policy_id);
        bytes.extend(self.policy_version.to_le_bytes());
        for field in [self.destination_cluster, self.program_id, self.owner, self.agent_key,
            self.vault, self.recipient, self.asset_id] { bytes.extend(field); }
        bytes.extend(self.amount_base_units.to_le_bytes());
        bytes.extend(self.request_id);
        bytes.extend(self.mandate_epoch.to_le_bytes());
        bytes.extend(self.expires_at.to_le_bytes());
        bytes
    }
}

pub fn valid_source_lease(now: i64, observed_at: u64, valid_until: u64, active: bool) -> bool {
    if now < 0 { return false; }
    let now = now as u64;
    if observed_at > now.saturating_add(5) { return false; }
    if active {
        valid_until > now && valid_until > observed_at
            && observed_at.checked_add(60).map(|end| valid_until <= end).unwrap_or(false)
    } else {
        valid_until <= observed_at
    }
}
