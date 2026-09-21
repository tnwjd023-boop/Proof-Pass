# ProofPass Gate 0 호환성·실행 결과

최종 확인: 2026-09-21 KST. 범위: `ProofPass_기획서_v2.md` 16·18절과 [Gate 0 계획](docs/superpowers/plans/2026-09-20-gate0.md).

후속 구현 상태: [Gate 1 프로토콜·세션 바인딩](docs/GATE1-STATUS.md). 고정 OpenDID SDK의 증명 개수·요청 조건 검사 보완 사항은 해당 문서에 기록했다. Gate 0는 실행 가능성 검증이며 SDK 전체 보안 감사가 아니다.

**Gate 0의 필수 실행 검증을 모두 통과했다.** OpenDID 실제 SDK 암호 검증, Midnight 로컬 회로·계약 검증, XRPL Testnet 수명주기, Solana Devnet 프로그램 배포·vault 지급을 확인했다. 사용자가 5 Devnet SOL을 확보한 후 마지막 배포와 0.05 SOL 지급까지 finalized 상태로 검증했다. 전체 제품·교차 체인 연결 데모는 다음 단계다.

| 구성요소 | 실제 결과 | 증거 |
|---|---|---|
| OpenDID | 공식 issuer·holder SDK로 자격 발급→holder 서명 검증→만 19세 predicate proof 생성→서버 검증. 정상 허용, nonce/proof 변조 및 issuer 불일치 거절 | [실행 결과](evidence/gate0/opendid-roundtrip.json), [하네스](test/opendid/src/main/java/OpenDidRoundTrip.java) |
| Midnight | Compact 8개 회로 컴파일, prover/verifier 키 각 8개. 계약 테스트 62/62 통과, 잘못된 서명·사용자 간 재사용·데이터 변조·Schnorr 위조 포함 | [빌드·테스트 로그](evidence/gate0/midnight-build-test-2026-09-20.txt) |
| XRPL | 신규 issuer/subject 계정으로 Create→Accept→Delete 모두 validated tesSUCCESS. 미수락→수락→객체 부재 확인. CLI 재실행 시 기존 hash 재사용 | [Testnet 수명주기](evidence/gate0/xrpl-lifecycle.json) |
| Solana 로컬 | Anchor 프로그램 빌드. Rust 산술 3개, 로컬 체인 10개 테스트 통과. 프로그램 소유 vault에서 실제 50,000,000 lamports 지급 및 원자성 확인 | [로컬 테스트](evidence/gate0/solana-local-tests.json), [재개 가능한 지급](evidence/gate0/solana-local-workflow.json) |
| Solana Devnet | 배포·vault 초기화·0.1 SOL 예치·0.05 SOL 지급 모두 finalized. 배포 바이너리 해시 일치, 재개 시 중복 지급 없음 | [배포 검증](evidence/gate0/solana-devnet-deployment.json), [지급 영수증](evidence/gate0/solana-devnet-payout.json) |

OpenDID는 합성 신원값과 메모리 내 임시 키를 사용했다. 실제 주민 신원·정부 모바일 신분증·Android 앱 UI·전체 verifier 서버는 검증하지 않았다. 정책 기준일은 재현 가능한 고정값 `2026-09-20`이다. Holder는 고정 저장소의 `did-wallet-sdk-aos-V2.0.1.jar` 암호 클래스를 JVM에서 호출했다. source build.gradle의 버전 `2.0.0`과 번들 JAR 이름 `2.0.1`을 구분한다. 전체 credential/proof/private witness/master secret은 공개 증거에 남기지 않았다.

Midnight 결과는 로컬 계약 실행이며 네트워크 proof 생성·제출·확정 증거가 아니다. Docker standalone network는 이번 Gate 0 필수 조건이 아니므로 설치하지 않았다. Solana 로컬 거래는 Devnet 거래가 아니다. 본 vault는 사용자 서명 지급의 실행 가능성만 검증하며, 제품의 교차 체인 승인·일회용 승인서 소비·정책 검증은 아직 구현하지 않았다.

## 실행 환경과 버전

| 도구 | 확인값 |
|---|---|
| Windows / Git | Windows 25H2 build 26200.9457 / Git 2.55.0.windows.3 |
| WSL / Ubuntu | WSL 2.7.14.0, 배포판 VERSION 2 / Ubuntu 26.04.1 LTS, kernel 6.18.33.2-microsoft-standard-WSL2, 사용자 tnwjd UID 1000 |
| Java / Gradle | OpenJDK 21.0.12+8-1~26.04 / issuer 공식 wrapper 8.13 |
| Node / npm | Windows·Linux 모두 22.23.2 / 10.9.8 |
| Compact | CLI 0.5.0 / compiler 0.31.1 |
| Rust / Cargo | 호스트 1.90.0 / 1.90.0 |
| Solana / Anchor | CLI 2.3.0 / CLI 및 anchor-lang 0.32.1 |
| SBF | platform-tools v1.53, rustc 1.89.0-dev, `--arch v0` |
| JavaScript SDK | xrpl 5.3.0, @solana/web3.js 1.98.4, bs58 4.0.1; package-lock.json 고정 |

Windows Node는 **이 프로젝트의** `.tools/node-v22.23.2-win-x64/node.exe`를 사용한다. 기존 휴대용 배포본에서 복사했고 실행 파일 SHA-256 일치를 확인했다. 다른 프로젝트 실행 경로에 의존하지 않는다.

Linux 도구는 `$HOME/.local/share/proofpass/tools`, 빌드 복사본은 `$HOME/proofpass-gate0`에 있다. Windows 원본은 `/mnt/c/Users/tnwjd/OneDrive/Desktop/project/ProofPass`에 있다. 공유 폴더에서 CRLF 및 chmod/utime 오류를 관측했으므로 Ubuntu 내부에서 컴파일한다. 공식 upstream은 고정 commit의 `git archive`로 추출하며 원본 소스는 보존한다.

[Anchor 0.32.1 공식 릴리스](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1)는 Solana 2.3.0을 권장한다. SBF 기본 도구 v1.48의 Cargo 1.84는 새 전이 의존성의 edition2024를 읽지 못했다. [platform-tools v1.53](https://github.com/anza-xyz/platform-tools/releases/tag/v1.53)을 별도 고정해 빌드했고 결과 의존성은 [Cargo.lock](solana/Cargo.lock)에 보존했다.

## 소스·다운로드 고정

저장소 URL·경로·commit은 [upstream-lock.json](config/upstream-lock.json)에 있다.

| 저장소 | commit | 용도 |
|---|---|---|
| OmniOneID/did-zkp-sdk-server | d1ba7410f7bebff7b743f94f6547306301e8dce7 | issuer 빌드 및 실제 verifier 호출 |
| OmniOneID/did-client-sdk-aos | 58c5582014908d47f1ce62340ce672727c6a1172 | 번들 holder SDK 실제 암호 호출 |
| OmniOneID/did-verifier-server | bd2e9ac8e0c52c7d0a19efc009f74044f8f1ed7c | 소스 확인, 전체 서버 미기동 |
| midnightntwrk/example-zkloan | eff9030d509f98938914c1b2b721acb88fc1e42c | 회로 및 62개 계약 테스트 |

공식 배포 체크섬을 확인한 설치 파일:

| 파일 | SHA-256 |
|---|---|
| Node 22.23.2 Linux x64 | d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307 |
| Compact CLI 0.5.0 Linux musl | 3a4b91fa7e286d5c68bda513dca249534d738770ced0177bc8f7a855113b4fec |
| Solana CLI 2.3.0 Linux | 56241fbe862495ff01b2b875195e44f94c22e9f2a504591a3ade1b9d82862730 |
| Anchor CLI 0.32.1 | 5f25b850ce80278507a98947833fcd48423391f6d145046ffb0c5fd130dec436 |
| rustup-init 1.28.2 | 20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c |
| platform-tools v1.53 Linux | 876b5c294a38d41d40bed4592911091e92cc3f399dd17a0f9cac87b1df9ab120 |

실행한 holder JAR SHA-256: `4617d96a13d16693e957dd279d79a425938132edf1718e5b88f5f754d54495cd`.
Solana SBF 산출물(202,968 bytes) SHA-256: `97904c1bda12c39b1dabcb234837c70b8311be714e184534269e192f6493a73a`.
기존 issuer JAR 관측 해시: `4891e1b4d1597f9220634facc6e69c488b7745f79745d7b644d848d175ace8cc`. JAR 타임스탬프 때문에 재빌드 바이트 동일성을 보장하지 않는다.

## 체인 결과

XRPL CredentialType은 `PROOFPASS_ELIGIBLE_V1`이고 URI/Memo에 신원정보나 Solana 주소를 기록하지 않았다. Credentials amendment 활성화와 fresh validated ledger를 확인했다. SDK 5.3.0의 ledger_entry 타입 선언과 실제 wire field가 달라 `credential_type`을 사용하며 회귀 테스트가 있다.

| 단계 | 거래 hash | validated ledger |
|---|---|---|
| Create | 709B36DD68CB322D2FE77FF7E1779F491F783C87F148063E1F6E016889549817 | 20908734 |
| Accept | 85C9944CF8C02C3761697AC9B1370041FAF4EB75FD3F19EC160A9ADE72DAB74D | 20908736 |
| Delete | B86105A95DEBA1046F8CC60F657FFD88077866A7654B13D2AE3D0A9FB3DC87E0 | 20908738 |

Solana Devnet 전용 payer: `2ERjBJoGRjmbYVmN9Uduwy3X7tcw984NmizZhswRFfZu`.
배포 완료 program ID: `BvFezGdFzEgKwGKntXK1acyv9tzcKowRJXy5EjFt14i8`.
버퍼·program data rent·예치·수수료 여유를 포함한 보수적 사전 검사 요구량은 2,213,912,560 lamports다. 테스트용 3 Devnet SOL이면 이 검사 기준을 충족한다. 실제 SOL 구매나 Mainnet 자금은 필요하지 않다.

초기 공개 faucet 요청은 429로 실패했으나 사용자가 공식 web faucet에서 테스트 자금을 확보해 해결했다. [Solana 공식 faucet 안내](https://solana.com/developers/cookbook/development/airdrops-and-faucets). 타 프로젝트 키·지갑은 사용하지 않았다. [재현·재개 절차](docs/GATE0-RUNBOOK.md)에 따라 실행했으며 기존 journal은 완료된 거래를 조회한다.

배포 signature: `5ymoMFa81i1BC4LWYFvoPuype9U1J1mA2L1V4sgfhrZ4VxSoYP412xqJvQAjqRh1K92FhZNXRxxzkRtW3XwyLHPT`, finalized slot `501445846`.
지급 signature: `3rHSwvuMdq6LH719CXoSdsfNi4KFU1GU8srDXnLdYcNWj5MtvURvHtSkZTUNHdvkC9ii6KwrHNM8PwkGkF6UKqxr`.
Vault는 100,858,520 → 50,858,520 lamports, recipient는 0 → 50,000,000 lamports로 변했다. Devnet vault rent 858,520 lamports는 유지했고 지급 거래 수수료 5,000 lamports는 payer가 별도로 부담했다. 로컬 validator의 rent와 Devnet rent는 달랐으며 각각 실행 시 조회한 값을 사용했다. 배포된 바이너리를 다시 내려받아 로컬 테스트 산출물과 SHA-256이 일치함을 확인했다.

최신 상태: [status.json](evidence/gate0/status.json). `local-validation-2026-09-20.json`과 과거 RPC JSON은 해당 시점의 역사적 기록이다. `evidence/demo-run.json`은 전체 연결 데모가 없으므로 생성하지 않았다.
