# VidDetect

A **video detection & downloader** website that turns any page's video into downloadable files — detect the source, pick a format, and grab MP4 / MP3 / previews.

> Node.js (Express + **yt-dlp**) backend · React 19 / Vite client · Chrome MV3 extension + bookmarklet

---

## What it does

Paste or browse a page that contains video (e.g. YouTube), and VidDetect:

1. **Detects** the underlying media (via `yt-dlp`) and lists every available format.
2. Lets you **pick** MP4 video, MP3 audio, or a preview clip.
3. **Downloads** the selected format to disk — or browse a **playlist** and **batch-queue** files via the browser's File System Access API.

It's designed as a **website** (the Android-app layer is a non-goal).

## How it's built

**Backend** (`server.js`)
- Express server that shells out to **yt-dlp** to probe and fetch media.
- `detect.js` / `extract.js` / `scrape-playlist.js` — metadata extraction, media extraction, playlist handling.
- `cache.js` — request caching to avoid re-probing the same URL.
- `instagram.js` — Instagram-specific detection path.
- Ships with `Dockerfile` + `render.yaml` (cloud deploy), plus `run-viddetect.bat` for local Windows runs.

**Frontend** (`index.html`, `/client`, React 19 + Vite)
- Clean UI: detect → list formats → MP4/MP3/preview → playlist browse → batch queue with progress.

**Chrome extension + bookmarklet** (`extension/`, `extension-install.html`, `bookmarklet.html`)
- A lightweight MV3 extension and a bookmarklet that send the **current page's URL** (including YouTube mixes) to the backend.

## Run locally

```bash
npm install
npm start          # starts the Express server
# open http://localhost:3000
```

> **ffmpeg** is required for MP3 / merged MP4 downloads. The local bootstrap script (`run-viddetect.bat`) fetches a Windows ffmpeg build. The cloud configs expect ffmpeg to be installed in the deploy environment.

## Repo layout (key files)

```
server.js                 Express + yt-dlp backend
detect.js, extract.js     detection + extraction
scrape-playlist.js        playlist support
instagram.js              Instagram path
cache.js                  caching
index.html, /client       React 19 + Vite frontend
extension/, bookmarklet.html   Chrome MV3 + bookmarklet
Dockerfile, render.yaml   cloud deploy
run-viddetect.bat         local Windows launcher
```

## Status & known limitations

- The local **ffmpeg bootstrap is Windows-only** (`run-viddetect.bat`), while the cloud deploy (`Dockerfile`/`render.yaml`) must install ffmpeg itself — MP3/merged downloads currently work best locally.
- `/api/download` is an open, unauthenticated proxy (fine on LAN, but **risky if deployed publicly** — no auth or rate limiting).
- A couple of stale `_test*.mjs` files still reference an old removed API.
- The Android-app layer was intentionally dropped (this is a website); some leftover Android/server copies remain in the repo and can be ignored or removed.

## See also

The video detection logic here pairs with Dali's **quran-reel-detector** and **video-detector** experiments.
