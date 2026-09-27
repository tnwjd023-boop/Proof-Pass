export const narration = [
  { id: 'intro', target: 'hero', text: '에이전트에게 지급 권한을 줬다가 회수했습니다. 이미 발급된 미사용 승인도 막을 수 있을까요? 프루프패스는 비공개 정책 승인과, 실행 시점의 권한 재검사를 연결합니다. 지금 보는 화면은 2026년 9월 21일에 완료한 테스트넷 실행 기록입니다.' },
  { id: 'policy', target: '.policy-scene', text: '먼저 비공개 정책입니다. 원본 신원정보와 전체 위임 한도는 목적지 체인에 전달하지 않습니다. 공개되는 요청은 에이전트, 수신자, 그리고 지급 금액입니다. 오픈 디아이디 에스디케이로 확인한 신원 근거와 자격, 지갑 바인딩, 위임 조건을 미드나이트가 하나의 정책으로 검증합니다.' },
  { id: 'limit', target: '.enforcement', text: '영지식 증명이 필요한 이유는 숨긴 값에 대한 비교입니다. 요청한 영점 영오 솔이 비공개 거래당 한도 이내임을 증명합니다. 설명용 한도는 영점 일 솔입니다. 영점 일오 솔 요청은 승인 생성 단계에서 거절됐고 체인에 제출되지 않았습니다. 한도 원문 대신 위임 커밋먼트가 목적지에 전달됩니다.' },
  { id: 'payment', target: '.scene.request', text: '이제 실제 지급입니다. 신뢰하는 릴레이가 정확한 요청에 묶인 승인을 솔라나에 등록합니다. 프로그램은 요청과 현재 상태, 만료, 소비 여부를 다시 확인합니다. 이 기록에서는 오천만 램포트, 영점 영오 테스트 솔이 볼트에서 수신자에게 이동했고 해당 승인은 소비됐습니다. 실제 거래 링크도 확인할 수 있습니다.' },
  { id: 'revoke', target: '.revoke-scene', text: '가장 중요한 장면입니다. 앞의 지급과 별도로 미사용 승인을 발급했습니다. 그 뒤 엑스알피엘 자격을 삭제하고, 관측자가 솔라나 상태를 갱신했습니다. 기존 승인을 실행하자 소스 오류 육천삼으로 거절됐습니다. 승인 만료까지 약 칠 초가 남아 있었으므로 만료 때문이 아닙니다. 자격 삭제가 반영되어 지급이 차단된 것입니다. 볼트와 수신자의 잔액 변화는 영입니다.' },
  { id: 'enforcement', target: '.enforcement', text: '네 가지 결과를 비교하면 명확합니다. 정상 요청은 지급됩니다. 같은 승인 재사용은 거절됩니다. 위임을 취소한 뒤의 기존 승인도, 자격 삭제가 반영된 뒤의 기존 승인도 거절됩니다. 성공 응답만이 아니라 실패 거래와 잔액으로 실행 제어를 확인합니다.' },
  { id: 'boundary', target: '.disclosure', text: '신뢰 경계도 분명합니다. 솔라나는 미드나이트 증명을 직접 검증하지 않습니다. 어댑터, 관측자, 릴레이와 시각 제공자를 신뢰하며 취소 반영에는 지연이 있습니다. 통제 범위는 해당 볼트의 지급 경로입니다. 기업에서 담당자와 에이전트로 이어지는 권한은 다음 실험입니다. 프루프패스는 허용됐음을 증명하고, 실행할 때도 여전히 허용되는지 확인합니다.' }
];
export const slides = [
  { kicker:'PROOFPASS / PROJECT DECK', title:'Prove permission privately.\nEnforce it at execution.', subtitle:'비공개 정책 승인 + 실행 시점 권한 재검사', kind:'cover', notes:narration[0].text },
  { kicker:'01 / WHY ZERO KNOWLEDGE', title:'한도를 공개하지 않고,\n이 요청이 허용됨을 증명합니다.', subtitle:'payment.amount ≤ mandate.maxPerTx', kind:'policy', notes:narration[1].text + '\n' + narration[2].text },
  { kicker:'02 / BUILT, NOT JUST PROPOSED', title:'신원 근거에서 실제 지급까지', subtitle:'OpenDID SDK → XRPL Testnet → Midnight Preprod → Solana Devnet', kind:'architecture', notes:'실제 OpenDID SDK로 합성 테스트 신원을 검증합니다. XRPL의 공개 자격 상태를 trusted observer가 전달하고, Midnight는 비공개 정책과 서명 근거를 검증합니다. trusted relay는 요청 commitment를 정확한 지급 요청에 매핑합니다. Solana는 로컬 상태를 다시 확인하고 지급합니다. 목적지에서 Midnight proof나 XRPL 합의를 직접 검증하는 구조는 아닙니다.' },
  { kicker:'03 / ACTUAL PAYMENT', title:'승인이 0.05 SOL 지급으로', subtitle:'50,000,000 lamports moved · Solana Devnet', kind:'payment', notes:narration[3].text },
  { kicker:'04 / THE CRITICAL SCENE', title:'승인은 남아도, 권한은 없다.', subtitle:'자격 삭제 반영 후, 만료 전 미사용 승인도 거절', kind:'revocation', notes:narration[4].text },
  { kicker:'05 / ENFORCEMENT EVIDENCE', title:'성공뿐 아니라 실패가 증거입니다.', subtitle:'지급·재사용·위임 취소·자격 삭제를 같은 실행에서 검증', kind:'evidence', notes:narration[5].text + '\n실패 거래의 수수료까지 0이라는 뜻은 아닙니다. 보호된 vault와 수신자 사이 지급이 0입니다.' },
  { kicker:'06 / TRUST BOUNDARIES & NEXT EXPERIMENT', title:'어디까지 보장하는가', subtitle:'현재 구현과 다음 실험을 분리합니다.', kind:'roadmap', notes:narration[6].text }
];
