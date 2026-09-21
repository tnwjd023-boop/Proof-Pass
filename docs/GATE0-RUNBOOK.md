# Gate 0 실행·재개

현재 상태는 [COMPATIBILITY.md](../COMPATIBILITY.md)에 있다. Gate 0 필수 검증과 공개 Devnet 배포·지급이 완료됐다. 아래 명령은 재현·조회 절차다. 기존 프로그램은 재배포하지 않으며 기존 payout journal로 재실행하면 완료된 거래만 조회한다. UI와 Gate 1 제품 구현은 이 계획 범위 밖이다.

## SDK·도구 재현

Ubuntu 일반 사용자로 `/mnt/c/Users/tnwjd/OneDrive/Desktop/project/ProofPass`에서 실행한다. 새 checkout에서는 `config/upstream-lock.json`의 저장소를 해당 commit으로 먼저 확보한다. Java21 등 기본 apt 패키지가 필요하다. Node 의존성은 `npm ci --ignore-scripts`로 복원한다.

```bash
bash scripts/gate0/setup-linux-tools.sh
bash scripts/gate0/build-opendid-upstream.sh
bash scripts/gate0/test-opendid-roundtrip.sh
bash scripts/gate0/build-midnight-upstream.sh
bash scripts/gate0/setup-solana-tools.sh
bash scripts/gate0/setup-sbf-tools.sh
bash scripts/gate0/build-solana-vault.sh
```

Windows 검증 명령:

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' --test test/*.test.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate0/xrpl-lifecycle.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate0/xrpl-lifecycle.mjs --execute
```

XRPL `--execute`는 기존 journal이 있으면 기존 3개 거래를 조회한다. 키·journal이 없는 새 환경에서는 새 Testnet 계정과 거래를 만든다.

## Solana 로컬 검증

Ubuntu 별도 터미널에서 사용하지 않은 ledger 경로로 validator를 실행한다. 기존 ledger를 삭제하거나 `--reset`하지 않는다. 일회성 integration fixture는 초기화된 PDA가 이미 있으면 실패하므로 재검증에는 새 ledger가 필요하다.

```bash
$HOME/.local/share/proofpass/tools/solana-2.3.0/solana-release/bin/solana-test-validator \
  --ledger "$HOME/proofpass-gate0/validator-gate0" \
  --rpc-port 18899 --faucet-port 19900 --gossip-port 18001 \
  --dynamic-port-range 18002-18030 --bind-address 127.0.0.1 \
  --bpf-program BvFezGdFzEgKwGKntXK1acyv9tzcKowRJXy5EjFt14i8 \
  "$HOME/proofpass-gate0/solana-vault/target/deploy/gate0_vault.so"
```

Windows에서:

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' test/solana-vault.integration.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate0/solana-payout.mjs --local-test --execute
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate0/solana-payout.mjs --local-test --execute
```

두 번째 payout 실행은 같은 서명 3개를 조회한다. 로컬 workflow는 전용 payer와 별도 journal을 사용한다. 새 validator로 교체했다면 기존 local-workflow journal은 다른 genesis에 속하므로 폴더를 별도 이름으로 보존한 뒤 새 fixture를 시작한다. Devnet journal에는 이 절차를 적용하지 않는다. 검증 후 validator 터미널에서 Ctrl+C로 종료한다.

## Devnet 실행 절차 (현재 완료)

최초 배포의 보수적 예산은 약 3 **Devnet** SOL이었다. 사용자가 전용 payer `2ERjBJoGRjmbYVmN9Uduwy3X7tcw984NmizZhswRFfZu`에 5 Devnet SOL을 확보했고 배포·지급이 완료됐다. 추가 입금은 필요하지 않다. Mainnet 자금은 사용하지 않는다. 아래 배포 `--execute` 명령은 기존 프로그램을 감지해 중단하는 것이 정상이다.

Windows 조회:

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate0/solana-payout.mjs
```

Ubuntu 배포:

```bash
bash scripts/gate0/deploy-solana-vault.sh
bash scripts/gate0/deploy-solana-vault.sh --execute
```

배포는 genesis·program ID·기존 프로그램 부재·여유 잔액을 검사하고 명시적인 buffer 키를 사용한다. RPC 오류는 중단이며 기존 프로그램을 자동 업그레이드하지 않는다. 배포 출력은 비공개 `.local/solana-gate0/deployment.json`과 `deployment-errors.txt`에 남는다. 중간에 끊겼다면 `solana program show <program ID> --url devnet`와 buffer 상태부터 확인한다. 공개 증거에는 program ID·배포 signature·확정 slot·바이너리 해시만 추려 기록한다.

배포 후 Windows에서:

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/gate0/solana-payout.mjs --execute
```

vault 초기화, 100,000,000 lamports 예치, 50,000,000 lamports 프로그램 지급을 실행한다. finalized 거래의 실제 pre/post balances에서 수수료와 지급을 분리해 `evidence/gate0/solana-devnet-payout.json`을 만든다. 기존 journal은 같은 거래를 조회하며 만료된 미확정 거래를 새 서명으로 자동 교체하지 않는다.

## 중단·잠금 복구

테스트 개인키와 signed transaction journal은 Git 제외 경로 `.local/`에 있다. Windows OneDrive 아래이므로 운영용 키를 보관하는 용도가 아니다. 이 프로젝트에서 새로 만든 테스트 키만 사용한다. 파일 내용을 공개 증거에 붙이지 않는다.

동시 실행 방지 잠금은 XRPL의 `.local/xrpl-gate0/run.lock`, Devnet의 `.local/solana-gate0/payout.lock`, 로컬 workflow의 `.local/solana-gate0/local-workflow/payout.lock`이다. 정상 종료 시 자동 해제한다. 강제 종료 후 `EEXIST`가 나면 lock의 PID·시각과 실행 중 Node 프로세스의 명령행을 대조한다. 해당 작업이 **확실히 종료된 경우에만 그 lock 파일 하나를 삭제**하고 같은 명령을 재개한다. journal·keys를 삭제해 재시도하지 않는다. PID 재사용이나 다른 컴퓨터에서 동기화된 lock은 자동 판단하지 않는다.
