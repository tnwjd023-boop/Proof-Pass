# Gate 1 요청 인코딩·바인딩 구현 계획

> 구현: superpowers:executing-plans로 직접 실행하고 마지막에 한 번 독립 검토한다. 기존 자율 진행 요청을 유지한다.

**Goal:** 실제 OpenDID proof와 두 지갑의 동일 세션 서명을 검증하는 재현 가능한 CLI 완성.
**Architecture:** 엄격한 공통 바이트 계약 → 영속 세션·지갑 검사 → 고정 issuer registry를 쓰는 Java verifier → 실제 RPC/SDK CLI 증거.
**Tech Stack:** Node22, native crypto, xrpl5.3.0/ripple-keypairs3.1.0, OpenDID 고정 SDK, Java21, Rust1.90.
**Spec:** `docs/superpowers/specs/2026-09-21-gate1-binding-design.md` 및 기존 기획서7·8·18절.

## Global Constraints

- 원본 신원·proof·개인키·연결된 두 지갑 주소를 공개 evidence에 기록하지 않는다.
- 금액·epoch·시간은 u64 canonical decimal string, 바이트 필드는 lowercase hex 고정 길이.
- 테스트넷 전용. 기존 Gate0 프로그램과 잔액은 변경하지 않는다.
- 새 루트 Git 저장소가 없으므로 현재 workspace에서 변경하고 ledger를 보존한다.

## Review Focus

1. 숫자 반올림·선행0·누락·여분 필드가 같은 요청으로 취급되지 않아야 한다.
2. 다른 audience·nonce·지갑 서명은 동일 계정이라도 세션을 통과하지 않아야 한다.
3. disabled master·오래된 ledger·RPC 오류는 허용으로 해석하지 않아야 한다.
4. 프로세스 재시작·동시 complete에서 세션을 두 번 소비하지 않아야 한다.
5. proof 입력에 포함된 issuer 정의나 `verified=true`가 고정 verifier 검증을 대체하지 않아야 한다.

## Task 1: 공통 프로토콜

Files: `src/protocol.mjs`, `test/protocol.test.mjs`, `test/fixtures/payment-v1.json`, `test/protocol-vector.rs`.
Interfaces: `encodePayment(request): Buffer`, `paymentHash(request): hex32`, `encodeBinding(session): Buffer`, `bindingNonce(session): decimal`.

- [x] 필드 치환마다 해시가 달라지고 수치 범위를 위반하면 거절하는 테스트를 먼저 실행한다.

```js
assert.notEqual(paymentHash(request), paymentHash({ ...request, amountBaseUnits: '50000001' }));
assert.throws(() => encodePayment({ ...request, amountBaseUnits: 50000000 }));
```

- [x] `node --test test/protocol.test.mjs`에서 미구현 실패 확인 후 version형 고정 인코딩을 구현한다.
- [x] 독립 Rust encoder가 fixture와 동일한 bytes를 출력하는지 확인한다. Rust 테스트는 little-endian 금액과 전체 고정 field 순서를 별도로 구성한다.

## Task 2: 영속 세션·실제 지갑 서명

Files: `src/binding/sessions.mjs`, `src/binding/wallets.mjs`, `test/binding.test.mjs`.
Interfaces: `SessionStore(directory, policy)`, `issue(addresses, now)`, `complete(sessionId, proofs, dependencies)`; dependencies는 내부 verifier·XRPL 조회·adapter signer이고 외부 입력은 아니다.

- [x] 실제 테스트 키로 정상 서명·주소 치환·서명 변조·만료·중복·동시 소비를 먼저 테스트한다.

```js
const outcomes = await Promise.allSettled([complete(), complete()]);
assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
```

- [x] 실패를 확인하고 로컬 파일 잠금, nonce derivation, native Ed25519/ripple-keypairs 검증을 구현한다.
- [x] 단위 테스트의 계정조회 fixture와 실제 RPC integration 결과를 별도로 기록한다.

## Task 3: 실제 OpenDID verifier

Files: `test/opendid/src/main/java/OpenDidBinding.java`, 기존 `OpenDidRoundTrip.java`, `scripts/gate1/opendid-binding.sh`, `src/binding/opendid.mjs`.
Interfaces: Java `issue <nonce> <private directory>` / `verify <nonce> <trusted registry> <proof>`; Node `verifyPresentation(session, proofPath)`는 호출한 verifier의 종료코드와 nonce-bound 결과만 소비한다.

- [x] 실제 SDK proof를 올바른 nonce로 허용하고 다른 nonce·변조 proof·caller 정의 치환을 거절하는 integration을 먼저 작성한다.
- [x] fixture export 경로는 `.local`로 제한하고 전체 proof stdout을 끈다.
- [x] 고정 registry로 proof request를 재구성해 `ZkpProofManager.verifyProof`를 호출한다. 실패 로그는 일반 오류 코드만 노출한다.

## Task 4: 실제 세션 CLI·증거·최종 검토

Files: `scripts/gate1/binding-demo.mjs`, `scripts/gate1/check-protocol.sh`, `evidence/gate1/binding.json`, `docs/GATE1-STATUS.md`.

- [x] 새 adapter 키와 세션을 `.local/gate1`에 저장하고 기존 프로젝트 전용 테스트 지갑으로 transcript에 서명한다.
- [x] fresh XRPL validated 상태와 실제 Java verifier로 complete, 재사용 거절을 실행한다.
- [x] 공개 증거는 모드·검증 종류·거절 이유·nonce 바인딩 여부·소요시간만 기록한다.
- [x] `node --test test/*.test.mjs`, Rust bytes 비교, 실제 binding CLI를 검증하고 한 번 독립 검토한다.
- [x] Gate1 전체 미완료 상태와 이후 observer·회로·릴레이·소비 경로를 명시한다.
