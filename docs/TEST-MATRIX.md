# 기획서 P0 검증 매핑

실제 테스트넷 실행과 로컬 회로/검증자 검사를 구분합니다. 모든 부정 입력을 실제 테스트넷에 제출했다는 뜻은 아닙니다.

| 요구 사항 | 검증 위치 | 실행 범위 |
|---|---|---|
| 실제 OpenDID proof, nonce, issuer/schema 정책 | `test/opendid-binding.integration.mjs`, `opendid-binding.json` | 실제 Java SDK, 합성 발급자 |
| 두 지갑 통제권과 치환·재사용 거절 | `test/binding.test.mjs`, `binding.json` | 실제 Ed25519 서명; 통합은 live XRPL master 상태 |
| 요청 필드/정수/도메인 일치 | `test/protocol.test.mjs`, Rust request tests | Node/Rust 고정 바이트 벡터 |
| 실제 XRPL 발급자·유형·계정 대조 | `test/source-adapter.test.mjs`, `src/midnight/source-adapter.mjs` | 로컬 변조 회귀 + 실제 전체 실행 |
| 미수락·만료·삭제, stale/충돌/역행 관측 | `test/credential-policy.test.mjs`, XRPL validation tests | 로컬 경계 + 실제 Testnet lifecycle |
| attestation 위조·한도/수신자 변조·잘못된 역할·scope | `midnight/contract/test/policy.test.mjs` | 실제 생성 Compact 회로, fixture |
| 사용자 서명 없는 위임·등록값 불일치 | `test/mandate-adapter.test.mjs`, Solana integration | 등록 account/PDA 대조 + 로컬 검증자 |
| 0.10 SOL 위임의 0.15 SOL 요청 | `live-flow.json → overLimit` | 실제 live witness로 승인 생성 거절, 체인 미제출 |
| 승인 없이 직접 호출·잘못된 agent | Solana authorization/concurrency integration | 실제 로컬 검증자, 지급 없음 |
| program/cluster/asset/recipient/amount 치환 | protocol/Compact/request mapping/Solana integration | 각각 인코딩·회로·relay·온체인 검증 |
| 동일 승인 재시도 | `live-flow.json → consumed-replay` | 실제 Devnet 실패 영수증, 잔액 변화 0 |
| 동일 승인 동시 제출 | `solana-concurrent-consumption.json` | 실제 로컬 검증자, 서로 다른 거래 2개, 지급 1회 |
| mandate 취소·epoch 변경 | `live-flow.json → mandate-revoked` | 실제 Devnet, 아직 만료 전 승인 거절 |
| source 취소·epoch 변경 | `live-flow.json → source-deleted` | 실제 XRPL 삭제 → Devnet 상태 반영 → 지급 거절 |
| 부분 지급/consumed만 남는 실패 방지 | `solana-authorization-local.json` | 실제 로컬 검증자에서 실패 rollback 확인 |
| 완료 후 재개, 추가 지급 방지 | `test/flow-recovery.test.mjs`, `live-recovery.json` | 로컬 interruption 검사 + 실제 원거래 metadata 대조 |
| UI origin/token·중복 실행·사설 경로 | `test/demo-server.test.mjs` | 실제 loopback HTTP 요청 |
| 잘못된 작업 재개·저장 오류·읽기 검사 변경 방지 | `test/demo-recovery.test.mjs` | 실패 회귀를 먼저 재현, 파일 I/O/실제 HTTP |
| 화면과 실제 버튼 연결 | `browser-check.json`, `ui-live-run.json` | Edge 데스크톱/모바일 및 실제 전체 실행 |

현재 Node 36개, Compact 9개, Rust 2개 테스트와 Solana 로컬 50개 작업/검사가 통과했습니다. 숫자는 서로 다른 단위이며 합산한 보안 점수로 사용하지 않습니다. 독립 검토는 각 범위의 코드 검토이며 정식 보안 감사가 아닙니다.
