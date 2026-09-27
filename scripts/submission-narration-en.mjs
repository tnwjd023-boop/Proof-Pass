export const narration = [
  {
    "id": "intro",
    "target": "hero",
    "text": "You gave an agent permission to pay. Then you revoked that permission. Can an approval issued earlier still spend your funds? ProofPass combines private authorization with execution-time revocation. This demo shows a recorded testnet run."
  },
  {
    "id": "policy",
    "target": ".policy-scene",
    "text": "First, the private policy. Identity details and the full delegation limit stay off the destination chain. The public request identifies the agent, recipient, and amount. Midnight checks identity evidence from the Open D I D SDK, credential status, wallet binding, and delegation conditions."
  },
  {
    "id": "limit",
    "target": ".enforcement",
    "text": "Here is why zero knowledge matters. The proof shows that zero point zero five SOL is within a hidden per-transaction limit. The demo discloses a limit of zero point one SOL for explanation. A request for zero point one five fails before authorization is created."
  },
  {
    "id": "payment",
    "target": ".scene.request",
    "text": "Now, an actual payment. A trusted relay registers the request-bound authorization on Solana. The program checks the request, current state, expiry, and whether the approval is unused. Fifty million lamports move from the vault to the recipient. That is zero point zero five test SOL."
  },
  {
    "id": "revoke",
    "target": ".revoke-scene",
    "text": "Here is the critical case. A separate, unused authorization already exists. Then the X R P L credential is deleted, and the observer updates Solana's state. Executing the old approval fails with source error six thousand three. About seven seconds remain before expiry. Authority was revoked, so the payment is blocked. No funds move from the vault to the recipient."
  },
  {
    "id": "enforcement",
    "target": ".enforcement",
    "text": "Compare all four outcomes. A valid request is paid. Reusing the same approval is rejected. Revoking the mandate blocks an old approval. Deleting the credential also blocks an old approval once the update reaches Solana. Both successful payments and rejected attempts have execution evidence."
  },
  {
    "id": "boundary",
    "target": ".disclosure",
    "text": "The trust boundaries are explicit. Solana does not verify Midnight proofs directly. The system trusts adapters, a relay, an observer, and supplied time. Revocation propagation takes time, and enforcement covers this vault's payment path. Corporate agent delegation is a future experiment. Prove permission privately. Enforce it at execution."
  }
];
