# ZK 데모 UI 검토

이 디렉터리는 표현 개선 후의 **화면 검사 결과**입니다. 새 테스트넷 실행 증거가 아닙니다. 기존 `evidence/preprod` 파일은 변경하지 않았습니다.

- `preprod/desktop.png`, `preprod/mobile.png`: 2026-09-21 완료 실행을 읽기 전용으로 표시한 실제 로컬 페이지.
- `preprod/running-mobile.png`, `preprod/unavailable-mobile.png`, `preprod/no-evidence-mobile.png`: 브라우저에서 API 응답을 대체한 **모의 상태**. 실제 증명 진행이나 네트워크 장애 기록이 아닙니다.
- `preprod/browser-check.json`: 뷰포트, 모의 상태·버튼·링크 검사 범위와 수행 시각. 모의 실행·재개 POST는 Playwright가 가로채므로 실제 지급은 발생하지 않습니다.

검토한 근거는 `policy.compact`의 서명·정책·공개 ledger, 위임 어댑터의 등록 상태 대조, Solana `validate_request`·`execute_payment`, `flow-recovery.mjs`의 원거래 잔액 대조, `live-flow.json`·`dashboard-run.json`입니다. 지급 50,000,000 lamports와 승인 소비, 세 거절의 잔액 불변, 완료 시각 및 측정값을 문서와 대조했습니다. 거래당 100,000,000 lamports 설정과 150,000,000 lamports 거절 시도는 실행 코드에서도 확인했습니다.

기존 Node 회귀 테스트 45개 통과. 새 화면은 Edge/Playwright로 1440×1080, 390×844에서 검사했고 320px 너비에서도 가로 넘침을 검사했습니다. 실행·재개 API, 진행·중단·연결 실패, 증거 누락·불완료·네트워크 불일치, 금액·소비 필드 변경, 잘못된 거래 링크를 검사했습니다.

한계: 이번 작업에서는 회로·Solana 프로그램을 재배포하거나 새 proof·테스트넷 지급을 생성하지 않았으며 외부 Explorer의 현재 응답과 현재 자격 상태를 재확인하지 않았습니다. 링크는 저장된 거래 서명과 목적지 URL을 대조했습니다. README의 Mermaid는 소스 구조를 확인했으며 GitHub 렌더러를 별도로 실행하지 않았습니다.

표시상 문제도 함께 수정했습니다. 기존 `web/app.js`는 완료 기록의 금액과 소비 상태와 별개로 지급 문구를 0.05 SOL로 고정했습니다. 이제 금액·잔액 변화·승인 소비를 기록에서 읽고, 확인되지 않는 값은 성공으로 보충하지 않습니다. 권한·암호·TTL·릴레이 로직 변경은 없습니다.
