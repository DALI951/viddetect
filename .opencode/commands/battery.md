# /battery — viddetect health check

Run from the repo root. Stop at the first failure and report it with the real output.

1. **Deps present**
   `node -e "require('fs').existsSync('node_modules/express')"` → true
   `node -e "require('fs').existsSync('client/node_modules')"` → true
2. **Client build exists**
   `node -e "console.log(require('fs').existsSync('client/dist/index.html'))"` → true
   (if false: `cd client && npm run build`)
3. **Binaries**
   `node_modules/ytdlp-nodejs/bin/yt-dlp.exe` exists and is > 10 MB.
   `node_modules/ytdlp-nodejs/bin/ffmpeg.exe` exists (needed for MP3 + merged MP4; if missing,
   see RULES.md → Traps).
4. **Server responds**
   `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/` → `200`
   (if not running: `node server.js` in a separate shell)
5. **Real extraction works** (the only test that matters)
   ```
   curl.exe -s -X POST http://localhost:3001/api/analyze -H "Content-Type: application/json" -d "{\"url\":\"https://www.youtube.com/watch?v=dQw4w9WgXcQ\"}"
   ```
   → JSON containing a `title` and a `formats` array with more than 0 entries.
6. **Download a real file**
   Take one format from step 5, hit `/api/download`, confirm the file lands on disk with
   size > 0 and starts with a valid container header (not an HTML error page).

Report: `Did / Proof / Result / Next`.
