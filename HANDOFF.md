# HANDOFF — viddetect

Updated 2026-10-31.

## Done
- Fresh clone → `C:\Users\Dali\Projects\viddetect` (branch `master`, v2.0.0).
- `npm install` (87 pkgs) + `cd client && npm install` (135 pkgs) + `npm run build` → OK
  (`client/dist` 207 kB JS, 10.7 kB CSS).
- Server started: **http://localhost:3001**, HTTP 200, browser opened.
- Live API test passed: `POST /api/analyze` on a real YouTube URL → title + source + **8 formats**.

## In progress
- ffmpeg: the in-process bootstrap stalled at 0 bytes. Manual `curl -L -C -` download running,
  then extract `ffmpeg.exe` + `ffprobe.exe` into `node_modules/ytdlp-nodejs/bin/`.
  Until that lands: MP3 extraction and merged (video+audio) MP4 downloads are broken, combined
  formats still work.

## Next
1. Drop in ffmpeg/ffprobe, re-test `GET /api/download` for MP3 and a 1080p merged MP4.
2. Fix the stale `_test.mjs` / `_test2.mjs` (they call the removed `formatId` API → `quality`).
3. Open-proxy hardening on `/api/download` before any public deploy (no auth/rate limit today).
4. Optional cleanup: delete the Android server copy + committed bundles if the app layer is
   officially dropped.

## Environment
- Node 26.5.0, npm 11.17.0. Windows 10 LTSC. Port 3001.
- yt-dlp binary present (22.5 MB) inside `node_modules/ytdlp-nodejs/bin/`.

## Watch-outs
- npm 11 prints `allow-scripts` warnings — the binaries are still there; don't chase ghosts.
- `client/dist` is required for the React UI; without a build the server falls back to the old
  root `index.html`.
