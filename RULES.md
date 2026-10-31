# RULES — viddetect

Binding. If this file and my defaults disagree, this file wins.

## What this is
Paste a video URL → detect the source → list formats → download MP4/MP3/preview, browse
playlists, batch queue. **It is a WEBSITE.** (Dali decision 2026-08-05: the Android app layer
is a NON-GOAL. Do not extend `android/`, do not keep `server-android.js` in sync.)

## Stack
- Server: `server.js` — Express 4, ESM, port `3001` (`process.env.PORT` overrides).
- Client: `client/` — React 19 + Vite 8, built into `client/dist` and served statically by
  `server.js` (`hasReactBuild` check at boot: no build = the old root `index.html` fallback).
- Extractor: `extract.js` + `ytdlp-nodejs` (bundled `yt-dlp.exe`), `detect.js`, `instagram.js`,
  `scrape-playlist.js`, `cache.js`.
- Chrome MV3 extension in `extension/`, bookmarklet in `bookmarklet.html`.
- ffmpeg/ffprobe: expected inside `node_modules/ytdlp-nodejs/bin/`, downloaded on demand by
  `ensureFfmpeg()` in `server.js`.

## Commands (run from repo root)
```
npm install                 # server deps
cd client && npm install    # client deps
cd client && npm run build  # build React -> client/dist
node server.js              # start on http://localhost:3001
```
Or the all-in-one: `run-viddetect.bat` (uses `%~dp0`, works from any clone).

## API
`POST /api/analyze {url}` · `POST /api/batch-analyze` · `GET /api/download?url&format...` ·
`GET /api/playlist` · `POST|GET /api/bookmarklet-data` · `/bookmarklet` · `/extension-install` ·
`/extension/*` static.

## Do nots
- Never commit `node_modules/`, `dist/`, or binaries.
- Never deploy publicly without auth + rate limiting on `/api/download` — it is an open proxy.
- Never delete or rewrite `android/` without asking (it is frozen, not garbage).
- Never hardcode absolute paths in scripts; use `%~dp0` / `__dirname`.
- Never claim a download works without a real file on disk (size > 0, playable header).

## Decisions
- **2026-08-05** — Website-only. Android is a non-goal.
- **2026-10-31** — Fresh clone at `C:\Users\Dali\Projects\viddetect`; contract files added.

## Traps (bit us once, never twice)
- **ffmpeg bootstrap hangs.** `ensureFfmpeg()` opens a Node `https` stream to the GitHub
  release and can sit at 0 bytes forever (seen 2026-10-31). Fix by hand:
  `curl.exe -L -C - -o ffmpeg.zip <release-url>` then
  `tar -xf ffmpeg.zip --strip-components=2 "*/bin/ffmpeg.exe" "*/bin/ffprobe.exe"`
  into `node_modules/ytdlp-nodejs/bin/`. MP3 + merged downloads need it.
- **npm 11 blocks install scripts** (`allow-scripts` warnings). The yt-dlp/esbuild binaries are
  usually still on disk — check `node_modules/ytdlp-nodejs/bin/*.exe` before debugging code.
- **Truncated downloads.** `tar -tf` exits 1 on a partial zip; resume with `curl -C -`.
