const $ = id => document.getElementById(id);
let token;
const time = value => value ? new Date(value).toLocaleString('ko-KR', { hour12: false }) : '기록 없음';
const seconds = value => Number.isFinite(value) ? (value / 1000).toFixed(1) + ' s' : '—';
const labels = { ready: '실행 준비', identity: '신원·지갑 바인딩 검증 중', 'xrpl-and-mandate': 'XRPL 자격과 사용자 위임 준비 중',
  'midnight-payment': 'Midnight 승인 증명 중', 'payment-confirmed': '0.05 SOL 지급 확인 · 거절 시나리오 진행 중',
  'mandate-revocation': '사용자 위임 취소 검증 중', 'source-revocation': 'XRPL 삭제 후 지급 차단 검증 중',
  reconciliation: '기존 거래 영수증 대조 중', complete: '실제 실행 완료', 'resume-required': '실행 중단 · 기존 기록 재개 필요' };
function badge(id, text, kind = '') { $(id).textContent = text; $(id).className = 'badge ' + kind; }
function row(label, result) {
  const element = document.createElement('div'); element.className = 'check-row';
  for (const value of [label, result]) { const span = document.createElement('span'); span.textContent = value; element.append(span); }
  return element;
}
function receipt(label, hash, chain) {
  const element = document.createElement('div'); element.className = 'receipt-row';
  const title = document.createElement('span'); title.textContent = label;
  const code = document.createElement('code'); code.textContent = hash || '확정 commitment로 복구 · 거래 ID 없음';
  element.append(title, code);
  const valid = chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(hash) : /^[a-fA-F0-9]{64}$/.test(hash);
  if (valid && chain !== 'midnight') {
    const a = document.createElement('a'); a.textContent = 'Explorer ↗'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.href = chain === 'solana' ? 'https://explorer.solana.com/tx/' + hash + '?cluster=devnet' : 'https://testnet.xrpl.org/transactions/' + hash;
    element.append(a);
  } else { const tag = document.createElement('span'); tag.textContent = chain === 'midnight' ? 'Local chain' : '기록 없음'; element.append(tag); }
  return element;
}
async function refresh() {
  try {
    const response = await fetch('/api/status'); if (!response.ok) throw Error('status');
    const state = await response.json(); token = state.token;
    const { evidence: e, job } = state;
    if (state.operatorPolicy) $('operator-policy').textContent = '사용자 위임 · 거래당 최대 ' + (Number(state.operatorPolicy.maxPerTxLamports) / 1e9).toFixed(2) + ' SOL · 한도는 이 로컬 화면에만 표시됩니다.';
    $('job-label').textContent = labels[job.stage] || '실행 준비';
    $('job-detail').textContent = job.status === 'running' ? '실제 SDK와 체인에 요청 중입니다. 아래에는 마지막 완료 기록을 표시합니다.'
      : ['failed', 'interrupted'].includes(job.status) ? '실패를 자격 부재로 처리하지 않습니다. 기존 실행 재개로 영수증부터 대조합니다.'
      : '새 실행은 테스트 지갑으로 서명하고 0.05 test SOL을 지급합니다. 약 3–5분 소요됩니다.';
    const busy = job.status === 'running' || state.externalBusy || state.readOnly;
    $('run').disabled = busy || ['failed', 'interrupted'].includes(job.status);
    $('resume').disabled = busy || job.status === 'idle';
    if (state.externalBusy) $('job-label').textContent = 'CLI에서 실제 데모 실행 중';
    const passed = e?.status === 'passed';
    for (const id of ['identity-badge', 'midnight-badge', 'solana-badge']) badge(id, passed ? '최근 실행 통과' : '기록 없음', passed ? 'good' : 'muted');
    badge('xrpl-badge', passed ? '실행 후 삭제됨' : '확인 불가', 'muted');
    $('record-time').textContent = passed ? '기록된 실행 · ' + time(e.completedAt) : '확정된 실행 기록 없음';
    $('source-status').textContent = passed ? '자격 없음 · 삭제 관측' : '상태 확인 불가';
    $('observed-at').textContent = time(e?.lastSourceObservation?.observedAt ? e.lastSourceObservation.observedAt * 1000 : e?.metrics?.deleteValidatedAt);
    $('midnight-address').textContent = e?.midnightContract || '—';
    $('solana-address').textContent = e?.solanaProgram || '—';
    $('payment-status').textContent = passed ? '0.05 SOL · 지급 1회 · 재지급 0회' : '—';
    $('binding-time').textContent = seconds(e?.metrics?.identityBindingMs);
    $('proof-time').textContent = seconds(e?.metrics?.authorizations?.payment?.contractProofMs);
    $('authorization-time').textContent = seconds(e?.metrics?.authorizations?.payment?.endToEndAuthorizationMs);
    $('revocation-time').textContent = seconds(e?.metrics?.deletionToDestinationInvalidationMs);
    const checks = [];
    if (passed) checks.push(row('승인된 0.05 SOL 요청', '지급 확정'));
    for (const denial of e?.rejectedPayments || []) checks.push(row({ 'consumed-replay': '동일 승인 재사용', 'mandate-revoked': '사용자 위임 취소 후 지급', 'source-deleted': 'XRPL 자격 삭제·반영 후 지급' }[denial.name] || denial.name, '거절 · 추가 지급 0'));
    if (e?.overLimit?.noSubmission) checks.push(row('위임 한도 초과 요청', '승인 생성 거절'));
    if (e?.newRequestAfterDelete) checks.push(row('삭제 이후 신규 승인', '증명 전 거절'));
    if (checks.length) $('checks').replaceChildren(...checks);
    const receipts = [];
    for (const [key, label] of [['create', 'XRPL 자격 발급'], ['accept', 'XRPL 자격 수락'], ['delete', 'XRPL 자격 삭제']]) {
      const value = e?.xrpl?.[key]; if (value) receipts.push(receipt(label, value.hash || value.txHash || value.transactionHash, 'xrpl'));
    }
    for (const value of e?.midnight || []) receipts.push(receipt('Midnight · ' + value.name, value.txId, 'midnight'));
    if (e?.payment) receipts.push(receipt('Solana · 0.05 SOL 지급', e.payment.signature, 'solana'));
    for (const value of e?.rejectedPayments || []) receipts.push(receipt('Solana · ' + value.name, value.signature, 'solana'));
    if (receipts.length) $('receipts').replaceChildren(...receipts);
  } catch {
    $('job-label').textContent = '서버 상태 확인 불가';
    $('job-detail').textContent = '연결을 확인해 주세요. 표시된 기록은 현재 자격 상태를 보증하지 않습니다.';
    $('run').disabled = true; $('resume').disabled = true;
  }
}
async function action(path) {
  $('action-error').hidden = true; $('run').disabled = true; $('resume').disabled = true;
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-proofpass-token': token }, body: '{}' });
    if (!response.ok) throw Error(response.status === 409 ? '다른 실행이 진행 중이거나 기존 기록의 재개가 필요합니다.' : '실행을 시작하지 못했습니다. 로컬 서버와 실행 기록을 확인해 주세요.');
  } catch (error) { $('action-error').textContent = error.message; $('action-error').hidden = false; }
  await refresh();
}
$('run').addEventListener('click', () => action('/api/run'));
$('resume').addEventListener('click', () => action('/api/resume'));
refresh(); setInterval(refresh, 3000);
