# HANDOFF — viddetect

Updated 2026-10-31. **Running at http://localhost:3001.**

## Done
- Fresh clone → `C:\Users\Dali\Projects\viddetect` (branch `master`, v2.0.0).
- `npm install` (87 pkgs) + `cd client && npm install` (135 pkgs) + `npm run build` → OK
  (`client/dist`: 207 kB JS, 10.7 kB CSS).
- Server started, browser opened.
- **Full loop verified end to end:**
  - `POST /api/analyze` → real title, source `YouTube`, 8 formats.
  - `GET /api/download ...&format=mp3` → **4.88 MB MP3, ID3 header**.
  - `GET /api/download ...&quality=360&format=mp4` → **12.96 MB MP4, ffprobe: h264 640x360 +
    aac, 213.04 s** (merge path works).
- ffmpeg + ffprobe installed (ffmpeg N-128222, 162 MB each) in
  `node_modules/ytdlp-nodejs/bin/`.

## In progress
Nothing.

## Next
1. Fix stale `_test.mjs` / `_test2.mjs` — they still call the removed `formatId` arg (now
   `quality`), so they fail for no reason.
2. Harden `/api/download` (no auth, no rate limit) before any public deploy — it is an open
   proxy as written.
3. Optional cleanup if the Android layer is officially dead: `server-android.js` (divergent
   copy, missing ext/bookmarklet routes) + committed bundles `nodejs-bundle.cjs`,
   `combined-android.cjs`, `assets/main.js`.

## Environment
- Node 26.5.0, npm 11.17.0, Windows 10 LTSC, port 3001.
- `npm warn allow-scripts` is expected (npm 11); binaries are already on disk.

## Watch-outs
- `ensureFfmpeg()` in `server.js` **hangs forever at 0 bytes** on this machine (seen
  2026-10-31). Never debug code because of it — install the binaries by hand (RULES.md → Traps).
- `client/dist` must exist or the server silently serves the old root `index.html` fallback.
