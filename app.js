const $ = id => document.getElementById(id);
let token;
let midnightNetwork;
const time = value => value ? new Date(value).toLocaleString('ko-KR', { hour12: false }) : '기록 없음';
const seconds = value => Number.isFinite(value) ? (value / 1000).toFixed(1) + ' s' : '—';
const sol = value => Number.isSafeInteger(value) && value > 0 ? (value / 1e9).toLocaleString('en-US', { maximumFractionDigits: 9 }) + ' SOL' : '금액 확인 불가';
const labels = { ready: '실행 준비', 'wallet-warmup': '공개망 지갑 복원·동기화 중', identity: '신원·지갑 바인딩 검증 중', 'xrpl-and-mandate': 'XRPL 자격과 사용자 위임 준비 중',
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
  } else { const tag = document.createElement('span'); tag.textContent = chain === 'midnight' ? (midnightNetwork === 'preprod' ? 'Midnight Preprod' : 'Local chain') : '기록 없음'; element.append(tag); }
  return element;
}
async function refresh() {
  try {
    const response = await fetch('./api/status.json'); if (!response.ok) throw Error('status');
    const state = await response.json(); token = state.token;
    midnightNetwork = state.network;
    if (!['preprod', 'undeployed'].includes(midnightNetwork)) throw Error('Unknown network');
    const preprod = midnightNetwork === 'preprod';
    $('midnight-network').textContent = preprod ? 'Midnight Preprod · 공개 테스트넷' : '실제 로컬 체인 · public testnet 아님';
    $('network-disclosure').textContent = preprod ? 'Midnight Preprod를 사용하며 어댑터·relay를 신뢰합니다.' : 'Midnight는 로컬 네트워크이고 어댑터·relay를 신뢰합니다.';
    const { job } = state;
    const e = state.evidence?.midnightNetwork === (preprod ? 'preprod' : 'undeployed-local') && state.evidence.status === 'passed' ? state.evidence : null;
    $('operator-policy').textContent = state.operatorPolicy ? '최신 로컬 위임 · 거래당 최대 ' + (Number(state.operatorPolicy.maxPerTxLamports) / 1e9).toFixed(2) + ' SOL · 운영자에게 공개된 값' : '로컬 위임 설정 확인 불가';
    $('job-label').textContent = labels[job.stage] || '실행 준비';
    $('job-detail').textContent = job.status === 'running' ? '실제 SDK와 체인에 요청 중입니다. 아래에는 마지막 완료 기록을 표시합니다.'
      : ['failed', 'interrupted'].includes(job.status) ? '실패를 자격 부재로 처리하지 않습니다. 기존 실행 재개로 영수증부터 대조합니다.'
      : '새 실행은 테스트 지갑으로 서명하고 0.05 test SOL을 지급합니다. 네트워크 상황에 따라 수 분 이상 걸릴 수 있습니다.';
    const busy = job.status === 'running' || state.externalBusy || state.readOnly;
    $('run').disabled = busy || ['failed', 'interrupted'].includes(job.status);
    $('resume').disabled = busy || job.status === 'idle';
    if (state.externalBusy) $('job-label').textContent = 'CLI에서 실제 데모 실행 중';
    if (state.readOnly) {
      $('job-label').textContent = '저장 기록 미리보기 · 읽기 전용';
      $('job-detail').textContent = '새 지급을 실행하지 않는 화면입니다. 아래 결과는 마지막 완료 기록이며 현재 자격은 확인하지 않습니다.';
    }
    const passed = e?.status === 'passed';
    const payment = e?.payment;
    const paid = Number.isSafeInteger(payment?.lamports) && payment.lamports > 0
      && payment.vaultDelta === -payment.lamports && payment.recipientDelta === payment.lamports;
    const amount = sol(payment?.lamports);
    $('result-amount').textContent = payment ? amount : '—';
    $('result-payment').textContent = paid ? 'PAID · 저장된 잔액 변화 확인' : '확인 가능한 지급 결과 없음';
    $('result-lamports').textContent = paid ? payment.lamports.toLocaleString('en-US') + ' lamports moved' : '잔액 변화 확인 불가';
    $('story-record').textContent = e ? '저장된 과거 실행 · ' + time(e.completedAt) + ' · 현재 자격 상태가 아닙니다.' : '확정된 실행 기록 없음 · 아래 흐름은 설명이며 성공 증거가 아닙니다.';
    const authorized = e?.midnight?.some(x => x.name === 'payment' && (x.txId || x.recoveredCommitment));
    $('policy-amount').textContent = payment ? amount : '지급 요청 기록 없음';
    $('policy-outcome').textContent = authorized ? '✓ AUTHORIZATION CREATED' : '승인 기록 없음';
    $('policy-checks').className = 'policy-checks' + (authorized ? ' verified' : '');
    const denial = e?.rejectedPayments?.find(x => x.name === 'source-deleted');
    const issuedAt = e?.metrics?.authorizations?.['pending-source']?.confirmedAt;
    const deletedAt = e?.metrics?.deleteValidatedAt;
    const syncedAt = e?.metrics?.sourceInvalidationConfirmedAt;
    const revoked = denial?.programError === 6003 && denial.balancesUnchanged === true
      && denial.liveAtAttempt === true && denial.remainingLeaseMs > 0
      && e?.xrpl?.delete?.result === 'tesSUCCESS'
      && e?.midnight?.some(x => x.name === 'pending-source' && (x.txId || x.recoveredCommitment))
      && Date.parse(issuedAt) < Date.parse(deletedAt) && Date.parse(deletedAt) <= Date.parse(syncedAt)
      && Date.parse(syncedAt) <= Date.parse(denial.attemptedAt);
    $('revoke-issued').textContent = time(issuedAt);
    $('revoke-deleted').textContent = time(deletedAt);
    $('revoke-synced').textContent = time(syncedAt);
    $('revoke-attempt').textContent = revoked ? time(denial.attemptedAt) + ' · 만료 ' + seconds(denial.remainingLeaseMs) + ' 전' : '만료 전 거절 근거 확인 불가';
    $('revoke-outcome').textContent = revoked ? '✕ REJECTED · Source 6003' : '거절 근거 확인 불가';
    $('revoke-balance').textContent = revoked ? '0 SOL moved · Balance change: 0' : '잔액 변화 확인 불가';
    $('revoke-link').hidden = !revoked || !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(denial?.signature);
    $('revoke-link').href = $('revoke-link').hidden ? '' : 'https://explorer.solana.com/tx/' + denial.signature + '?cluster=devnet';
    $('result-consumed').textContent = payment?.consumed === true ? '해당 승인 소비됨 · 저장 기록' : payment?.consumed === false ? '해당 승인 미소비 · 저장 기록' : '승인 소비 확인 불가';
    $('result-time').textContent = e ? '완료 · ' + time(e.completedAt) : '확정된 실행 기록 없음';
    $('result-link').hidden = !paid || !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(payment?.signature);
    $('result-link').href = $('result-link').hidden ? '' : 'https://explorer.solana.com/tx/' + payment.signature + '?cluster=devnet';
    for (const id of ['identity-badge', 'midnight-badge', 'solana-badge']) badge(id, passed ? '최근 실행 통과' : '기록 없음', passed ? 'good' : 'muted');
    badge('xrpl-badge', passed ? '실행 후 삭제됨' : '확인 불가', 'muted');
    $('record-time').textContent = passed ? '기록된 실행 · ' + time(e.completedAt) : '확정된 실행 기록 없음';
    $('source-status').textContent = passed ? '자격 없음 · 삭제 관측' : '상태 확인 불가';
    $('observed-at').textContent = time(e?.lastSourceObservation?.observedAt ? e.lastSourceObservation.observedAt * 1000 : e?.metrics?.deleteValidatedAt);
    $('midnight-address').textContent = e?.midnightContract || '—';
    $('solana-address').textContent = e?.solanaProgram || '—';
    $('payment-status').textContent = paid ? amount + ' · 저장된 지급 확인' : '지급 확인 불가';
    $('binding-time').textContent = seconds(e?.metrics?.identityBindingMs);
    $('proof-time').textContent = seconds(e?.metrics?.authorizations?.payment?.contractProofMs);
    $('authorization-time').textContent = seconds(e?.metrics?.authorizations?.payment?.endToEndAuthorizationMs);
    $('revocation-time').textContent = seconds(e?.metrics?.deletionToDestinationInvalidationMs);
    const checks = [];
    if (paid) checks.push(row(amount + ' valid request', 'PAID'));
    for (const denial of e?.rejectedPayments || []) checks.push(row({ 'consumed-replay': 'Same authorization reused', 'mandate-revoked': 'Mandate revoked → old authorization', 'source-deleted': 'Credential deleted → old authorization' }[denial.name] || denial.name, denial.programError === ({ 'consumed-replay': 6007, 'mandate-revoked': 6001, 'source-deleted': 6003 })[denial.name] && denial.balancesUnchanged === true ? 'REJECTED · 0 SOL moved' : '거절 근거 확인 불가'));
    const overLimit = e?.overLimit?.noSubmission === true && e.overLimit.result === 'approval-generation-rejected' && e.overLimit.reason === 'amount-over-limit';
    $('limit-outcome').textContent = overLimit ? '위임 한도 초과 요청 · 승인 생성 거절 확인 · 체인 미제출 / 온체인 실패 proof 없음' : '설명용 예시 · 한도 초과 거절 증거 없음';
    $('checks').replaceChildren(...(checks.length ? checks : [row('확정된 실행 기록', '없음')]));
    const receipts = [];
    for (const [key, label] of [['create', 'XRPL 자격 발급'], ['accept', 'XRPL 자격 수락'], ['delete', 'XRPL 자격 삭제']]) {
      const value = e?.xrpl?.[key]; if (value) receipts.push(receipt(label, value.hash || value.txHash || value.transactionHash, 'xrpl'));
    }
    for (const value of e?.midnight || []) receipts.push(receipt('Midnight · ' + value.name, value.txId, 'midnight'));
    if (payment) receipts.push(receipt('Solana · ' + amount + ' 요청', payment.signature, 'solana'));
    for (const value of e?.rejectedPayments || []) receipts.push(receipt('Solana · ' + value.name, value.signature, 'solana'));
    $('receipts').replaceChildren(...(receipts.length ? receipts : [row('거래 기록', '없음')]));
  } catch {
    $('job-label').textContent = '서버 상태 확인 불가';
    $('job-detail').textContent = '연결을 확인해 주세요. 표시된 기록은 현재 자격 상태를 보증하지 않습니다.';
    $('result-time').textContent = '현재 서버 상태 확인 불가 · 남아 있는 값은 이전에 불러온 과거 기록';
    $('story-record').textContent = '서버 상태 확인 불가 · 아래 값은 이전에 불러온 과거 기록입니다.';
    $('operator-policy').textContent = '현재 로컬 위임 설정 확인 불가';
    $('run').disabled = true; $('resume').disabled = true;
  }
}
refresh();
