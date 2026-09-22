# 데모 운영 · Preprod와 기존 로컬 기록 구분

## 저장 기록으로 UI만 검토하기

`scripts/preview-demo.mjs`는 Preprod 저장 증거를 읽기 전용으로 표시합니다. 체인 실행기를 연결하지 않으며 실행·재개 버튼은 비활성입니다.

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/preview-demo.mjs
```

[http://127.0.0.1:4175](http://127.0.0.1:4175)를 엽니다. 첫 화면의 설명용 0.10 SOL 설정, 저장된 과거 지급, 새 실행 상태, 현재 상태 확인 불가를 구분합니다. 운영자용 한도 상세는 접기 영역에 있고 최신 로컬 설정이므로 과거 실행 설정과 혼동하지 않습니다.

브라우저 검사는 `scripts/check-demo-browser.mjs`로 실행합니다. 아래 명령은 기존 체인 증거와 캡처를 덮어쓰지 않고 UI 검토 결과를 별도 경로에 저장합니다.

```powershell
$env:PROOFPASS_MIDNIGHT_NETWORK = 'preprod'
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/check-demo-browser.mjs
```

## Preprod에서 새 실행하기

[Preprod 운영 안내](MIDNIGHT-PREPROD.md)의 도구·지갑 준비 후 아래 명령을 실행합니다. **새 테스트넷 지급과 자격 삭제가 발생**하므로 화면 검토만 할 때는 위 읽기 전용 미리보기를 사용합니다.

```powershell
$env:PROOFPASS_MIDNIGHT_NETWORK = 'preprod'
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/demo.mjs
```

포트는 **4174**, 증거는 `evidence/preprod/live-flow.json`, 로그는 `.local/demo-preprod/logs`입니다. Midnight 계약은 `6e16efc04cd792368ac1d858d63f109126fdc48915af76b22353e45b27056b29`입니다. 아래 4173 포트와 gate1 증거는 기존 로컬 네트워크용입니다.

## 기존 로컬 네트워크 환경

- Windows 프로젝트: `C:\Users\tnwjd\OneDrive\Desktop\project\ProofPass`
- Ubuntu 사용자: `tnwjd`; Node 22.23.2와 OpenDID Java SDK 빌드가 준비되어 있습니다.
- Midnight: Docker의 node 1.0.0 / indexer 4.3.3 / proof server 8.1.0, 모두 loopback 포트.
- Solana: Devnet 프로그램 `3983maEGpsg2M5tTqBqMtLm5rRmZsYKTDDUZAnrPuBAJ`.
- Midnight 계약: `d8c19344047782f811cc8bbd4827fb4c575065e2b7728158c2a66d0a206566d2`.
- 기존 XRPL Testnet·Solana Devnet 테스트 지갑을 사용합니다. 메인넷 자금은 사용하지 않습니다.

## 실행

1. [Midnight 안내](../midnight/README.md)의 로컬 네트워크 명령을 별도 터미널에서 유지하고 `PROOFPASS_MIDNIGHT_NETWORK`를 `undeployed`로 설정합니다. 프로젝트에서 관측한 WSL 동작상 마지막 활성 프로세스가 끝나면 네트워크도 중단될 수 있습니다.
2. Windows에서 `scripts/demo.mjs`를 프로젝트 Node로 실행하고 `http://127.0.0.1:4173`을 엽니다.
3. **실제 데모 실행**을 한 번 누릅니다. 새 OpenDID proof와 실제 지갑 서명, XRPL 발급·수락, 사용자 위임 등록, Midnight 승인, 0.05 SOL 지급, 거절 시나리오와 자격 삭제를 실행합니다.
4. 마지막 기록의 완료 시각이 바뀌었는지 확인합니다. 재실행 중에는 이전 완료 기록을 그대로 표시하므로 과거 결과를 새 성공으로 오해하지 마세요.

정상 실행은 공개 증거 `evidence/gate1/live-flow.json`을 갱신합니다. 세부 실행 로그는 `.local/demo/logs`에 보존합니다. 원본 로그는 자동 공개하지 않습니다. 신원 자료와 로컬 경로가 포함될 수 있습니다.

## 중단과 재개

**기존 실행 재개**는 최신 바인딩의 저장된 의도·단계·영수증을 사용합니다. 이미 확정된 지급의 원거래 잔액 변화를 확인하며 새로 지급하지 않습니다. 완료된 실행은 바인딩 만료 후에도 읽기 검증과 보고서 복구가 가능합니다.

아직 생성하지 않은 승인에는 유효한 신원 바인딩과 현재 자격이 필요합니다. 중단 중 바인딩이나 승인 lease가 만료되면 남은 라이브 거절 시나리오를 성공으로 꾸미지 않고 중지합니다. 따라서 모든 시점의 무조건적인 자동 완주를 보장하지 않습니다. 이전에 확정된 지급은 유실되거나 다시 실행되지 않습니다.

미확정 거래의 유효 높이가 지났는데 확정 여부를 확인할 수 없으면 **의도를 새 거래로 교체하지 않습니다**. 관련 RPC와 원거래 ID를 대조해야 합니다. `.local`의 거래 의도 파일을 지워 재실행하지 마세요.

실행 중 다른 데모는 시작하지 않습니다. 프로세스가 비정상 종료되어 lock 파일이 남으면 해당 Windows/WSL PID가 실제 종료되었는지 먼저 확인하고, 기존 거래를 대조한 뒤 lock을 복구해야 합니다. 브라우저 새로고침만으로 거래가 취소되지는 않습니다.

## 환경 오류 구분

| 표시/오류 | 의미와 대응 |
|---|---|
| 자격 없음 | 실제 validated 관측에서 삭제 또는 부재가 확인됨 |
| 상태 확인 불가 | 현재 RPC 관측을 하지 않았거나 실패함. 자격 부재로 해석하지 않음 |
| HTTP 429 | 공용 Solana RPC 속도 제한. 기록을 유지하고 기다린 뒤 재개 |
| Binding/approval expired | 새 승인 또는 아직 수행하지 않은 라이브 시나리오의 시간창 종료 |
| Local chain changed | 로컬 genesis가 바뀜. 기존 Midnight 계약 증거를 새 체인에 재사용할 수 없음 |
| 자금 부족 | 테스트넷 fee 지갑 잔액을 확인. 임의의 다른 프로젝트 키를 사용하지 않음 |

## 증거와 재현 범위

원거래 성공/오류는 Solana 확정 영수증으로, 지급·거절의 잔액 변화는 해당 거래 metadata로 확인합니다. Midnight는 고정 genesis·계약·설정·정확한 commitment를 대조합니다. XRPL은 validated ledger hash에 고정된 Credential 객체를 관측합니다.

과거 로컬 기록 중 `codeCommit`이 null인 자료는 당시 SHA-256 소스 목록을 기준으로 확인합니다. 현재 저장소의 Git 상태와 동일시하지 않습니다. 실제 네트워크 결과와 단위 테스트 fixture 결과를 분리합니다. `live-flow.json`의 `productUiComplete:false`는 체인 실행기 자체의 범위이며, 새 UI 검토 결과는 체인 실행 증거와 별도로 저장합니다.

UI의 한도는 최신 로컬 위임에서 읽습니다. 공개 체인에는 salted mandate commitment를 등록하며 원본 한도는 등록하지 않습니다. 화면 녹화에는 사용자가 보는 한도가 나타날 수 있습니다.
