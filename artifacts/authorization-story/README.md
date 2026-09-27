# Authorization story UI · 2026-09-27

새 메시지·UI 검토 자료입니다. 화면은 **2026-09-21 저장된 Midnight Preprod 실행**을 표시합니다. 새로운 테스트넷 지급·proof·취소 실행을 의미하지 않습니다.

- [PC](preprod/desktop.png), [모바일](preprod/mobile.png)
- [실행 중](preprod/running-mobile.png), [서버 연결 실패](preprod/unavailable-mobile.png), [증거 없음](preprod/no-evidence-mobile.png): mock API로 확인한 UI 상태
- [브라우저 검사](preprod/browser-check.json): 읽기 전용 렌더링과 mock 버튼 전환. 실제 체인 호출 없음
- [Solana 로컬 통합](validation/solana-authorization-local.json): 50개 작업/검사, trusted relay fixture
- [Solana 로컬 동시 소비](validation/solana-concurrent-consumption.json): 지급 1회, 중복 지급 0
- [외부 링크 HTTP 검사](validation/links.json): 거래 ID와 README 링크 일치. XRPL 3개 HTTP 200, Solana 4개 HTTP 429로 원격 열람 확인 제한. HTTP 응답은 거래 내용 재검증이 아님

Node 45/45, 생성 Compact 회로 9/9, Rust 2/2 통과. Solana SBF 빌드 SHA-256: `c6ee3a512d978667a300b0f459a5427ed6c89dd78fff04d2a2f0613589716bf9`.

브라우저 재현: `PROOFPASS_MIDNIGHT_NETWORK=preprod` 설정 후 `node scripts/check-demo-browser.mjs`. 실행 명령은 [운영 안내](../../docs/DEMO-RUNBOOK.md)에 있습니다. 로컬 Solana 검사는 기존 `test/solana-authorization.integration.mjs`와 `test/solana-concurrency.integration.mjs`의 import·출력 경로만 바꾼 복사본으로 실행했습니다. 해당 원본 테스트는 `evidence/gate1`에 출력하므로 과거 자료 보존 시 별도 경로가 필요합니다.

기존 `evidence/`, 프로토콜·회로·Solana 소스는 이번 메시지 개선의 변경 대상이 아닙니다.
