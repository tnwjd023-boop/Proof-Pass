# Submission materials

- [Google Slides deck](https://docs.google.com/presentation/d/1fXuCEU8KvUr1EhAWfzKfmLRtKEbb8S_xW6fb4hIpIRY/edit)
- [Public demo](https://tnwjd023-boop.github.io/Proof-Pass/)
- [Demo video player](https://tnwjd023-boop.github.io/Proof-Pass/watch.html)
- [Public deck preview and downloads](https://tnwjd023-boop.github.io/Proof-Pass/deck.html)

The seven-slide deck uses Noto Sans KR, deep green execution states, and rust-colored rejection states. Native Google Slides text is editable. Before submission, the owner must set the Google deck's General access to **Anyone with the link / Viewer**; the connected API does not expose this permission type. The public HTML deck and downloads do not require Google access.

The 2:43 video records the actual read-only evidence UI with Korean synthetic narration (Microsoft Heami Desktop). It explains the saved September 21 testnet run; it is not a new network execution. The public site exposes no payment controls, wallet secrets, or operator server. Historical evidence files are unchanged.

## Build and verification

Use Node 22.23.2 and the repository's installed Playwright dependency. The deck builder additionally expects `pptxgenjs` under `.local/submission-tools/node_modules` and the official Google Fonts Noto Sans KR variable font at `.local/submission-tools/NotoSansKR.ttf`. The video builder expects local `ffmpeg-static`, `ffprobe-static`, and the seven narration WAV files described by `narration.json`. These are production tools, not application dependencies.

1. `node scripts/build-public-demo.mjs`
2. `node scripts/build-submission-deck.mjs`
3. `node scripts/record-submission-video.mjs` (requires narration WAV inputs)
4. `node scripts/build-submission-pages.mjs`
5. `node scripts/check-public-submission.mjs`

Keep the font's OFL license alongside the deployed font. The generated `dist/submission` is deployed from the separate `gh-pages` branch. The local static server is for preview and QA only.

Checks cover desktop/mobile layout, read-only state, payment and zero-balance rejection evidence, video duration, chapter seeking/playback, downloads, and browser errors. Existing Node tests: 45 passed. No Compact circuit or Solana program changes were made for these submission assets.
