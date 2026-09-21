#[derive(Debug, PartialEq)]
pub enum PayoutError { Zero, Insufficient, Overflow }

pub fn balances_after_payout(vault: u64, recipient: u64, rent: u64, amount: u64) -> Result<(u64, u64), PayoutError> {
    if amount == 0 { return Err(PayoutError::Zero); }
    let required = rent.checked_add(amount).ok_or(PayoutError::Overflow)?;
    if vault < required { return Err(PayoutError::Insufficient); }
    let credited = recipient.checked_add(amount).ok_or(PayoutError::Overflow)?;
    Ok((vault - amount, credited))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transfers_exact_amount_and_preserves_rent() {
        assert_eq!(balances_after_payout(51_000_000, 2_000_000, 1_000_000, 50_000_000), Ok((1_000_000, 52_000_000)));
    }
    #[test]
    fn rejects_spending_rent_and_zero() {
        assert_eq!(balances_after_payout(50_999_999, 0, 1_000_000, 50_000_000), Err(PayoutError::Insufficient));
        assert_eq!(balances_after_payout(1_000_000, 0, 1_000_000, 0), Err(PayoutError::Zero));
    }
    #[test]
    fn overflow_cannot_credit_or_debit_either_side() {
        assert_eq!(balances_after_payout(u64::MAX, 0, 1, u64::MAX), Err(PayoutError::Overflow));
        assert_eq!(balances_after_payout(51_000_000, u64::MAX, 1_000_000, 50_000_000), Err(PayoutError::Overflow));
    }
}
