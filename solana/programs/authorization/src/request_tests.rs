#[path = "request.rs"]
mod request;
use request::{PaymentRequest, valid_source_lease};

fn sample() -> PaymentRequest {
    PaymentRequest { version: 1, policy_id: [0x11; 32], policy_version: 1,
        destination_cluster: [0x22; 32], program_id: [0x33; 32], owner: [0x44; 32],
        agent_key: [0x55; 32], vault: [0x66; 32], recipient: [0x77; 32], asset_id: [0; 32],
        amount_base_units: 50_000_000, request_id: [0x88; 32], mandate_epoch: 7, expires_at: 1_800_000_000 }
}

#[test]
fn request_bytes_match_independent_wire_vector() {
    let value = sample().encode();
    let expected = include_str!("payment-v1.hex").trim();
    let actual: String = value.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(actual, expected);
    assert_eq!(value.len(), 349);
}

#[test]
fn lease_checks_current_clock_and_maximum_age_without_integer_wrap() {
    assert!(valid_source_lease(1000, 1000, 1060, true));
    assert!(valid_source_lease(1000, 1005, 1065, true));
    assert!(!valid_source_lease(1060, 1000, 1060, true));
    assert!(!valid_source_lease(1000, 1006, 1060, true));
    assert!(!valid_source_lease(1000, 1000, 1061, true));
    assert!(!valid_source_lease(-1, 0, 60, true));
    assert!(!valid_source_lease(i64::MAX, u64::MAX, u64::MAX, true));
    assert!(valid_source_lease(1000, 1000, 1000, false));
    assert!(!valid_source_lease(1000, 1000, 1001, false));
}
