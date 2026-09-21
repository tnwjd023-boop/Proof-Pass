# ProofPass

사용자의 자격과 지갑 통제권, 현재 XRPL 자격, 에이전트 위임을 검증하고 **승인된 0.05 test SOL 지급을 Solana 프로그램에서 실행**하는 해커톤 프로토타입입니다.

**실제 OpenDID SDK → XRPL Testnet → Midnight 로컬 체인 → Solana Devnet 연결을 실행했습니다.** 동일 승인 재사용, 사용자 위임 취소, XRPL 자격 삭제 후 지급은 거절됩니다. 거래당 0.10 SOL 위임에 대한 0.15 SOL 요청은 승인 생성 단계에서 거절되며 온체인 `FAIL proof`를 만들었다고 표현하지 않습니다.

## 데모 열기

프로젝트에 준비된 Windows Node와 기존 Ubuntu 환경을 사용합니다.

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/demo.mjs
```

[http://127.0.0.1:4173](http://127.0.0.1:4173)에서 화면을 엽니다. **실제 데모 실행**은 프로젝트 테스트 지갑으로 새 신원 바인딩과 실제 체인 거래를 수행합니다. **기존 실행 재개**는 보존된 거래 영수증부터 대조합니다. 보통 3–5분이 걸리며 공용 RPC 제한으로 더 늦어질 수 있습니다. 실행이 끝나면 자격을 삭제하므로 화면은 마지막 실행 기록을 표시합니다. 현재 자격을 보증하는 화면이 아닙니다.

Midnight 로컬 네트워크가 중지되어 있다면 별도 PowerShell에서 실행하고 유지합니다.

```powershell
wsl -d Ubuntu -u root -- bash /mnt/c/Users/tnwjd/OneDrive/Desktop/project/ProofPass/scripts/gate1/run-midnight-network.sh
```

실행 환경·복구·기술적 경계는 [운영 안내](docs/DEMO-RUNBOOK.md), 발표 순서는 [3분 데모 대본](docs/DEMO-SCRIPT.md)에 있습니다. 새로운 PC 설치는 자동화된 단일 설치가 아니며 [호환성 기록](COMPATIBILITY.md)과 [Midnight 안내](midnight/README.md)의 고정 도구가 필요합니다.

## 결과 확인

- [실제 전체 실행 영수증](evidence/gate1/live-flow.json): 지급·거절·실측 시간
- [만료 후 복구 검증](evidence/gate1/live-recovery.json): 원거래 재확인, 추가 지급 0
- [Solana Devnet 바이너리 검증](evidence/gate1/solana-authorization-deployment.json)
- [동시 제출 검사](evidence/gate1/solana-concurrent-consumption.json): 승인 하나로 지급 한 번
- [브라우저 검사](evidence/demo/browser-check.json), [데스크톱 화면](evidence/demo/desktop.png), [모바일 화면](evidence/demo/mobile.png)
- [실제 화면 실행 원본 영상](evidence/demo/actual-run-unedited.webm): 편집 없는 테스트넷 실행, 내레이션 없음
- [3분 이내 발표용 영상](evidence/demo/watch.html): 같은 전체 실행을 1.4배속으로 재생하며 배속·기록 영상임을 표시
- [통합 증거 목록](evidence/demo-run.json): 네트워크·계약·소스 해시·검증 범위

```powershell
& './.tools/node-v22.23.2-win-x64/node.exe' --test test/*.test.mjs
& './.tools/node-v22.23.2-win-x64/node.exe' scripts/check-demo-browser.mjs
```

## 구현과 경계

OpenDID 발급자는 합성 신원을 사용하는 테스트 발급자입니다. 실제 SDK의 nonce-bound ZKP 검증을 수행하지만 정부 신분증이나 모바일 지갑 전체 통합은 아닙니다. 테스트 지갑은 로컬 프로젝트가 보관합니다.

Midnight는 실제 노드·indexer·proof server를 쓰는 **로컬 `undeployed` 네트워크**입니다. Public testnet 배포가 아닙니다. 자격·지갑 바인딩·위임·시각을 확인하는 어댑터와 목적지 relay를 신뢰하며, 로컬 prover는 비공개 witness를 처리합니다. 무신뢰 브리지가 아닙니다.

공개 거래 참조와 시각으로 활동을 연관시킬 수 있습니다. 자격 삭제부터 목적지 상태 반영까지 지연이 있으며 원자적 취소를 보장하지 않습니다. Devnet 프로그램의 업그레이드 권한은 프로젝트 운영자에게 남아 있습니다. 실사용 자금과 운영 환경의 보안 감사를 대상으로 한 제품은 아닙니다.

원본 proof·키·위임 내용·거래 의도는 `.local`과 WSL 비공개 디렉터리에만 저장합니다. 웹 서버는 loopback에만 열고 명시된 정적 파일과 증거만 제공합니다. 비공개 디렉터리를 업로드하거나 정적 웹 루트로 노출하지 마세요.
