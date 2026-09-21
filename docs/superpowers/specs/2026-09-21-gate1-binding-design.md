# Gate 1 첫 구현 단위: 요청 인코딩과 신원·지갑 세션 바인딩

근거: `ProofPass_기획서_v2.md` 7·8·18절. 사용자의 자율 진행 요청에 따라 기존 기획서의 구현 순서를 따른다. 새 서비스 연결의 첫 독립 단위이며 전체 Gate 1 완료를 뜻하지 않는다.

## 목적과 완료 조건

실제 OpenDID 조건 증명을 제시한 세션에서 XRPL·Solana 지갑 통제권을 확인하고, 재사용할 수 없는 연결 결과를 만든다. 정상 세션 한 번 성공, 지갑 치환·서명 변조·nonce 변경·만료·동시 재사용은 거절되어야 한다. 공개 증거에는 신원값·proof·두 체인 주소의 연결을 남기지 않는다.

## 선택한 접근

1. 단순 JSON 서명은 필드 순서·수치 표현의 모호성 때문에 사용하지 않는다.
2. 고정 바이트 인코딩, 실제 SDK 검증 프로세스, 영속 세션 저장소를 사용한다. 현재 프로젝트의 Node/Java 도구로 독립 검증 가능하므로 선택한다.
3. 모바일 UI와 전체 OpenDID 서버 배포는 후속 통합으로 둔다. 테스트 발급자와 실제 holder 암호 경로를 CLI에서 실행한다.

## 바이트 계약

PaymentRequest는 ASCII domain `PROOFPASS:AGENT_PAYMENT_AUTH:V1` 뒤에 version u16LE, policyId32, policyVersion u32LE, destinationCluster32(genesis bytes), programId32, owner32, agentKey32, vault32, recipient32, assetId32(SOL은 0), amountBaseUnits u64LE, requestId32, mandateEpoch u64LE, expiresAt u64LE를 순서대로 붙인다. JSON의 u64 값은 canonical decimal string이며 Number/음수/소수/선행0/overflow/알 수 없는 필드는 거절한다. 해시는 SHA-256이다. Node와 Rust가 같은 fixture의 바이트를 비교한다.

이는 목적지 요청 해시이며 Compact의 SHA-256 지원을 주장하지 않는다. 후속 회로에서는 검증된 Compact commitment와 이 요청 바이트를 릴레이가 정확히 대조하는 매핑을 구현한다. 그 매핑 전에는 Midnight 연결 완료라고 표시하지 않는다.

Binding transcript는 별도 domain `PROOFPASS:BINDING:V1`, version u16LE, sessionId32, challenge32, audienceHash32, issuerPolicyId32, xrplNetwork u32LE, xrplAccount20, solanaCluster32, solanaOwner32, issuedAt u64LE, expiresAt u64LE다. nonce는 전체 transcript SHA-256의 앞 16바이트를 unsigned big-endian decimal로 바꾼 값이다. 지갑 두 개는 전체 transcript 바이트에 서명한다. 키를 서로 다른 세션·서비스에 재사용해도 서명은 바꿔야 한다.

## 실제 검증과 신뢰 경계

- 세션은 운영자가 정한 audience, issuer policy, 네트워크와 5분 TTL을 사용한다. 클라이언트가 만료나 검증 여부를 지정하지 않는다.
- XRPL은 fresh validated Testnet 계정의 master key만 지원한다. public key에서 계정 주소를 유도하고 실제 account flags에서 master disable 여부를 확인한다. RPC 실패는 거절이다.
- Solana는 transcript의 owner Ed25519 서명을 검증한다.
- OpenDID verifier는 세션에서 얻은 nonce와 신뢰 registry의 schema/definition·기준일로 요청을 재구성하고 holder proof만 입력으로 받는다. 사용자가 보낸 `verified`나 definition은 신뢰하지 않는다.
- CLI의 발급 fixture와 verifier는 별도 명령이다. 테스트 issuer registry는 비공개 로컬 경로에 두고 caller proof와 분리한다. 운영 issuer onboarding·credential revocation은 후속 범위다.
- 영속 세션은 exclusive lock 아래 검증하고 원자적 rename으로 소비·결과를 함께 기록한다. 동시 요청은 최대 한 번 성공한다. 실패는 소비하지 않는다. 강제 종료 후 lock은 확인 후 수동 복구하며 자동 제거하지 않는다.
- 바인딩 결과는 adapter 전용 Ed25519 키로 서명한다. 이 서명은 지갑 바인딩 결과용이며 Compact Jubjub attestation은 후속 단계의 별도 키다. 두 역할을 혼동하지 않는다.

## 범위와 다음 연결

이번 단위는 공통 요청 바이트와 실제 바인딩 CLI까지 완성한다. 다음 단위는 이 결과를 입력으로 하는 XRPL 발급·현재 상태 observer, 위임 등록·Compact attestation, Midnight 승인·릴레이·Solana 소비 프로그램이다. Gate 0의 배포·거래 증거를 바꾸지 않으며 새 단계의 상태는 `evidence/gate1/`에 구분한다.
