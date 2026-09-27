# Submission materials

- [Google Slides deck](https://docs.google.com/presentation/d/1fXuCEU8KvUr1EhAWfzKfmLRtKEbb8S_xW6fb4hIpIRY/edit)
- [Public demo](https://tnwjd023-boop.github.io/Proof-Pass/)
- [Demo video player](https://tnwjd023-boop.github.io/Proof-Pass/watch.html)
- [Public deck preview and downloads](https://tnwjd023-boop.github.io/Proof-Pass/deck.html)

The seven-slide deck uses Noto Sans KR, deep green execution states, and rust-colored rejection states. Native Google Slides text is editable. Before submission, the owner must set the Google deck's General access to **Anyone with the link / Viewer**; the connected API does not expose this permission type. The public HTML deck and downloads do not require Google access.

The video records the actual read-only evidence UI with English male synthetic narration (Cillian, ElevenLabs via Higgsfield). It explains the saved September 21 testnet run; it is not a new network execution. The public site exposes no payment controls, wallet secrets, or operator server. Historical evidence files are unchanged.

The public player uses `ProofPass-Demo-Captioned.mp4`, with English captions burned into the picture. `ProofPass-Demo.mp4` remains the clean English master. Caption timing is derived from Whisper on the finished audio and wording is checked against `scripts/submission-narration-en.mjs`. The Higgsfield subtitles workflow renders small natural-case white text with a thin black outline above the existing scene summary.

## Build and verification

Use Node 22.23.2 and the repository's installed Playwright dependency. The deck builder additionally expects `pptxgenjs` under `.local/submission-tools/node_modules` and the official Google Fonts Noto Sans KR variable font at `.local/submission-tools/NotoSansKR.ttf`. The video builder expects local `ffmpeg-static`, `ffprobe-static`, and seven English narration MP3 files (`audio/en-0.mp3` through `audio/en-6.mp3`), generated from `scripts/submission-narration-en.mjs`; voice settings and generation IDs are recorded in `english-voice.json`. These are production tools, not application dependencies.

1. `node scripts/build-public-demo.mjs`
2. `node scripts/build-submission-deck.mjs`
3. `node scripts/record-submission-video.mjs` (requires English narration MP3 inputs)
4. Transcribe and verify the clean master, then burn `captions-en.srt` using the Higgsfield subtitles workflow's `burn_caps_clean.sh` (`--no-caps --fontsize 10 --marginv 42 --outline 1 --shadow 1`). Copy the verified captioned MP4 into `dist/submission`.
5. `node scripts/build-submission-pages.mjs`
6. `node scripts/check-public-submission.mjs`

Keep the font's OFL license alongside the deployed font. The generated `dist/submission` is deployed from the separate `gh-pages` branch. The local static server is for preview and QA only.

Checks cover desktop/mobile layout, read-only state, payment and zero-balance rejection evidence, video duration, chapter seeking/playback, downloads, and browser errors. Existing Node tests: 45 passed. No Compact circuit or Solana program changes were made for these submission assets.
