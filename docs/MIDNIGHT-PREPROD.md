# Midnight Preprod 운영

로컬 데모 기준점은 GitHub `main`의 `083a20a`이다. `evidence/gate1`과 기존 영상은 Midnight 로컬 네트워크 실행 기록이다. 공개망 결과는 `evidence/preprod`에 별도로 저장하며, 전체 실행 성공은 해당 디렉터리의 `live-flow.json`으로 확인한다. 배포만 성공한 상태는 전체 데모 성공이 아니다.

## 고정 구성

- Preprod RPC: `https://rpc.preprod.midnight.network`
- Indexer: `https://indexer.preprod.midnight.network/api/v4/graphql`
- Genesis: `0xdf831b09a8baa92badf47762ce5ac439b7e47e3ed3d39600cfdd44fad552361b`
- Midnight.js 4.1.1, wallet SDK 1.2.0, Compact compiler 0.31.1, proof server 8.1.0
- Prover: 로컬 `http://127.0.0.1:6300`. 비공개 입력을 처리한다.

[공식 지원표](https://docs.midnight.network/relnotes/support-matrix)와 [네트워크 릴리스](https://docs.midnight.network/relnotes/network)를 2026-09-21 확인했다. RPC 실측은 `evidence/preprod/network-probe.json`에 있다.

## 지갑 준비와 배포

프로젝트의 기존 Ubuntu 도구 설치와 로컬 proof server가 필요하다. 아래 명령은 Windows PowerShell에서 실행한다.

```powershell
wsl -d Ubuntu -- bash /mnt/c/Users/tnwjd/OneDrive/Desktop/project/ProofPass/scripts/gate1/run-preprod-midnight.sh wallet
wsl -d Ubuntu -- bash /mnt/c/Users/tnwjd/OneDrive/Desktop/project/ProofPass/scripts/gate1/run-preprod-midnight.sh wallet-status
wsl -d Ubuntu -- bash /mnt/c/Users/tnwjd/OneDrive/Desktop/project/ProofPass/scripts/gate1/run-preprod-midnight.sh setup
```

`wallet`은 별도 무작위 시드로 공개망 지갑을 준비한다. 주소가 나오면 [Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/)에서 사람 확인을 거쳐 테스트 토큰을 요청한다. 처음 실행할 때 DUST 지갑은 공개망 이벤트 전체를 읽으므로 오래 걸릴 수 있다. SDK 스냅샷을 30초마다 저장하며 같은 계정·네트워크·genesis인지 확인한 뒤 복원한다. `wallet-status`는 스냅샷의 마지막 저장 시각, 진행 위치와 잔액을 읽으며 실시간 최신 상태를 보증하지 않는다.

`setup`은 동기화 후 NIGHT를 DUST 생성에 등록하고 정책 계약을 배포한다. 배포 의도를 먼저 기록하므로 제출 결과가 불확실하면 의도 파일을 삭제하지 말고 영수증과 온체인 상태를 대조한다. 지갑 사용 명령은 파일 잠금으로 중복 실행을 막는다. 강제 종료 후에도 지갑 스냅샷은 남지만 미확정 거래는 별도 대조가 필요하다.

설치된 SDK의 RPC 클라이언트는 메타데이터를 읽고 연결을 끊은 뒤 재연결한다. Preprod에서 이 경로의 연결 종료 오류를 읽기 전용 genesis 조회로 재현했다. 프로젝트 제출 어댑터는 거래마다 새 연결을 열어 genesis를 대조하고, 첫 연결로 SDK 제출·확정 처리를 수행한 뒤 닫는다. RPC 초기화는 30초, 제출·확정 대기는 120초 제한이다. 시간 초과는 거래 미제출을 뜻하지 않으므로 기존 의도를 보존한다. DUST 등록은 증명 후 거래 원문과 식별자를 비공개로 저장한 다음 제출한다.

비공개 상태는 WSL의 `~/proofpass-gate1/midnight-policy/private/preprod-live`에 저장한다. 로컬 `private/live`와 분리되며 GitHub에 올리지 않는다. 잔액 조회 때문에 시드나 스냅샷 전체를 출력할 필요는 없다.

## 운영 화면

```powershell
$env:PROOFPASS_MIDNIGHT_NETWORK = 'preprod'
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/demo.mjs
```

`http://127.0.0.1:4174`에서 공개망 실행을 연다. 먼저 지갑 준비와 계약 배포를 마친다. 화면의 새 실행은 지갑 복원·동기화를 마친 뒤 신원 바인딩을 생성해 5분 유효기간을 복원 대기에 소모하지 않는다. 중단 후 재개는 기존 바인딩과 거래 의도를 사용한다. 로컬 모드는 환경 변수를 `undeployed`로 지정하고 포트 4173을 사용한다.

공개망에서도 원본 상태 근거의 유효기간은 최대 60초다. 승인·확정 지연이 이 범위를 넘으면 지급하지 않는다. 테스트넷에 배포해도 어댑터와 relay 신뢰 가정, 시각·공개 거래 간 연관 가능성, 교차 체인 취소의 지연은 남는다.
