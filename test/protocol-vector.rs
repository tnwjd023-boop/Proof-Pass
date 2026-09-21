fn main() {
    let mut bytes = b"PROOFPASS:AGENT_PAYMENT_AUTH:V1".to_vec();
    bytes.extend(1u16.to_le_bytes());
    bytes.extend([0x11u8; 32]);
    bytes.extend(1u32.to_le_bytes());
    for byte in [0x22u8, 0x33, 0x44, 0x55, 0x66, 0x77, 0] { bytes.extend([byte; 32]); }
    bytes.extend(50_000_000u64.to_le_bytes());
    bytes.extend([0x88u8; 32]);
    bytes.extend(7u64.to_le_bytes());
    bytes.extend(1_800_000_000u64.to_le_bytes());
    for byte in bytes { print!("{:02x}", byte); }
    println!();
}
