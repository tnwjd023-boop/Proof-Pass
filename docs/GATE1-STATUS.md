# Gate 1 진행 상태

2026-09-21 KST. **실제 OpenDID 검증 → XRPL Testnet 자격 → 실제 로컬 Midnight 승인 → Solana Devnet 0.05 SOL 지급과 취소·재사용 거절까지 전체 Gate 1을 통과했다.** Gate 0 결과는 [COMPATIBILITY.md](../COMPATIBILITY.md), 화면·통합 증거는 [README](../README.md)에 정리한다.

| 검증 | 결과 | 증거 |
|---|---|---|
| Node/Rust 요청 바이트 | 고정 버전·필드 순서·정수 범위·domain 기준으로 동일 | [교차 언어 vector](../evidence/gate1/protocol-vector.json) |
| 실제 OpenDID verifier | 정상 proof 허용; nonce·proof·정책 치환과 증명/조건 누락 등 9개 거절 검사 통과 | [SDK 결과](../evidence/gate1/opendid-binding.json) |
| 실제 지갑 바인딩 | XRPL Testnet master-key 상태와 실제 XRPL·Solana Ed25519 서명 확인, 동일 transcript의 OpenDID nonce 검증, 재사용 거절 | [통합 결과](../evidence/gate1/binding.json) |
| XRPL 자격 관측 | Testnet create/accept/delete 확정; 미수락·삭제 상태 거절, 수락 상태에 최대 60초 lease, 재발급 시 epoch 증가 | [실제 거래 및 상태](../evidence/gate1/credential-observer.json) |
| 회귀 테스트 | Node 36/36, Compact 9/9, Rust 2/2 통과. 위임·발급자 대조·거래 기록·요청 매핑·정책·서명 경계·데모 복구 포함 | `node --test test/*.test.mjs`, `build-midnight-policy.sh` |
| Midnight 정책 | 로컬 실제 체인에 최종 회로 배포·증명·승인 생성 후 확정 상태 및 정확한 요청 매핑 조회 | [로컬 체인 증거](../evidence/gate1/midnight-policy-network.json) |
| Solana 승인 프로그램 | 로컬 검증자 50개 작업·검사 통과; 0.05 SOL 지급과 재사용·취소·만료 거절 | [로컬 검증](../evidence/gate1/solana-authorization-local.json) |
| 새 Solana Devnet 배포 | 최종 확정 영수증과 테스트 바이너리 SHA-256 일치, 업그레이드 권한 확인 | [배포 증거](../evidence/gate1/solana-authorization-deployment.json) |
| 실제 전체 연결 | 0.05 test SOL 지급, 만료 전 승인 재사용·위임 취소·자격 삭제 후 거절, 한도 초과 승인 생성 거절 | [전체 실행](../evidence/gate1/live-flow.json) |
| 재개 | 만료된 바인딩으로 원거래·확정 승인 읽기 검증, 새 지급 0 | [복구 검증](../evidence/gate1/live-recovery.json) |
| 데모 화면 | 네 단계·실제 링크·측정값·과거 기록 표시, 데스크톱/모바일 검사 | [브라우저 검사](../evidence/demo/browser-check.json) |

독립 검토에서 고정 OpenDID SDK의 필수 subproof 존재 검사와 요청 predicate 대조가 충분하지 않음을 발견했다. 실제 로컬 테스트로 재현한 뒤 adapter에서 정확히 한 개의 신뢰된 credential 식별자·age19 mapping·요청한 birthdate/LE/cutoff를 요구하도록 보완했다. 이후 SDK 암호 검증도 그대로 수행한다. 이 검토는 범위가 제한된 코드 검토이며 SDK 전체 보안 감사를 뜻하지 않는다.

## 구현 경계

- 공개 데모 입력 경로는 실제 SDK/서명/RPC를 사용했다. 단위 테스트의 verifier·RPC fixtures는 별도이며 네트워크 증거로 표시하지 않는다.
- 발급자는 합성 신원을 쓰는 테스트 발급자다. 실제 OpenDID holder SDK가 nonce-bound proof를 만들고 별도 Java verifier 프로세스가 운영자 registry의 schema/definition으로 검증한다. 정부 신분증·모바일 앱 전체 통합이 아니다.
- 지갑 바인딩은 한 세션에서의 자격 제시와 두 지갑 통제권이다. 자격 대여나 키 공유를 막는다고 주장하지 않는다.
- SHA-256은 목적지 요청 해시용이다. Compact persistent commitment와 다른 해시이며 엄격한 요청 preimage 매핑을 구현했다. 실제 생성 회로로 필드 변경 거절을 검증했다. [벡터](../evidence/gate1/compact-request-vector.json)
- 현재 BindingAttestation은 전용 Ed25519 adapter 서명이다. 후속 Compact용 Jubjub attestation과 키를 분리한다.
- `src/binding`은 내부 라이브러리다. 로컬 HTTP 화면은 고정된 실제 데모/재개 작업만 실행한다. verifier registry와 callback은 운영자 설정이고 클라이언트 입력이 아니다.
- 원본 proof·키·두 체인 지갑 연결은 `.local/gate1`에만 보존한다. 공개 XRPL 증거에는 거래 영수증과 관측 상태를 포함하지만 Solana 지갑 연결은 포함하지 않는다.
- XRPL 관측은 validated ledger hash에 고정한다. RPC 장애를 자격 부재로 바꾸지 않는다. 삭제 시 증가한 sourceEpoch를 Solana에 반영하고 지급 차단까지 검증했다. 로컬 Ed25519 관측 기록과 실제 정책용 Jubjub 역할 서명을 분리한다.
- 초기 Midnight 네트워크 증거는 합성 fixture 검증이다. 별도 `midnight-live-deployment.json` 및 `live-flow.json`은 실제 OpenDID/XRPL adapter와 Solana 등록 위임을 함께 소비한다. 모두 `undeployed` 로컬 체인이며 prover가 비공개 witness를 처리한다. 운영 상세는 [Midnight README](../midnight/README.md)에 있다.
- 독립 회로 검토의 서명 계산 경계값 문제는 회귀 테스트 실패를 먼저 확인한 뒤 보완했고, 최종 소스 해시가 기록된 회로로 실제 체인 검증을 다시 통과했다. 실용적인 서명 위조를 입증한 것은 아니다.

## 재현

Ubuntu에서 고정 Gate0 issuer SDK가 빌드되어 있어야 한다. 프로젝트 루트에서:

```bash
bash scripts/gate1/check-protocol.sh
bash scripts/gate1/opendid-binding.sh build
```

Windows에서:

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' --test test/*.test.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' test/opendid-binding.integration.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate1/binding-demo.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate1/credential-demo.mjs
```

새 integration 실행마다 `.local/gate1` 아래 새 디렉터리를 만들어 기존 세션과 섞지 않는다. 통합 CLI는 이 프로젝트 Gate0의 테스트 XRPL subject 및 Solana payer만 재사용한다. 키를 외부 프로젝트에서 가져오지 않는다. proof·registry JSON을 수동으로 공개 파일에 복사하지 않는다.

세션별 `.json.lock`은 실행 중 동시 소비를 막는다. 강제 종료로 남으면 PID와 작업 종료를 확인한 뒤 lock 하나만 제거한다. consumed 세션 파일은 재사용을 막는 기록이므로 지우지 않는다. 아직 활성 세션은 5분이 지나면 만료된다.

자격 CLI도 `.local/gate1/credential-demo.lock`으로 동시 실행을 막는다. 강제 종료 뒤에는 기록된 PID와 해당 작업이 종료되었는지 확인한 다음 이 lock 하나만 제거한다. journal·서명된 intent·observer epoch는 삭제하지 않는다. CLI를 재실행하면 저장된 거래를 조회하거나 동일 blob만 재제출한다. 완료된 journal은 거래를 다시 확인하고 공개 보고서를 복구한다.

발급/수락 후 중단되어 자격이 만료되었다면 `credential-demo.mjs --cleanup-expired`로 만료된 자격만 정리한다. 이 경로는 정상 수락 검증 PASS를 생성하지 않는다. 정리 뒤에는 새 binding을 만들고 lifecycle을 다시 실행한다. 독립 검토에서 발견한 완료 보고서 복구와 만료 정리 문제는 회귀 테스트를 추가한 뒤 수정했다.

## 완료된 연결과 운영 범위

XRPL observer, 사용자 위임 원본 승인, 역할별 Compact attestation, 실제 Midnight 확정 상태 검증 relay, Solana 일회 소비를 연결했다. 실제 지급과 만료 전 취소·재사용 거절, 한도 초과 승인 생성 거절을 실행했다.

통합 검토의 실제 발급자 대조와 재개 문제 2건, 화면 검토의 작업 선택·저장 실패·읽기 검사 문제 3건은 실패 회귀 테스트를 먼저 확인한 뒤 보완했다. 수정 후 재검토를 별도로 받았다고 주장하지 않는다. 단위 검사·실제 체인·브라우저 증거의 범위는 [검증 매핑](TEST-MATRIX.md)에 구분한다.

완료된 실행의 읽기 복구는 바인딩 만료 후에도 가능하다. 아직 수행하지 않은 라이브 시나리오는 승인·바인딩 만료 시 중지하며 과거 근거로 새 승인을 발행하지 않는다. 외부 공개·제출은 아직 수행하지 않았다.
