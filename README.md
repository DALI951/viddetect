# VidDetect — Video Detection & Download

A full-stack video detection and downloading application (v2.0.0) with a Node.js/Express backend, React frontend, Android app, and browser extension. Detects video sources from URLs across 15+ platforms and downloads via yt-dlp.

## Features

- **Universal URL Detection** — Supports YouTube, Vimeo, Twitch, Instagram, TikTok, Facebook, Twitter/X, Reddit, Bilibili, and more
- **Download Engine** — yt-dlp integration for high-quality video downloads
- **Instagram Extraction** — Post, story, and profile media extraction
- **YouTube Playlists** — Scrape and download full playlists
- **React Client** — Clean web UI for managing downloads
- **Browser Extension** — Chrome extension for sending YouTube mixes/playlists to the app
- **Android App** — Native Android client with Node.js runtime
- **Caching System** — Intelligent caching for repeated requests
- **Docker Support** — Dockerfile for easy deployment
- **Cloudflare Tunnel** — cloudflared support for remote access
- **Playlist Scraping** — Custom crawl and scrape functionality

## Tech Stack

**Backend:** Node.js, Express, axios, ytdlp-nodejs, Instagram URL direct
**Frontend:** React 19, Vite
**Mobile:** Android (Kotlin, Gradle, Node.js for Mobile)
**Extension:** Chrome Manifest V3
**Infrastructure:** Docker, cloudflared, Render (render.yaml)

## Getting Started

`ash
npm install
node server.js
`

Visit http://localhost:3000 (or the configured port).

## What's Missing / Future Improvements

- [ ] User authentication and multi-user support
- [ ] Download queue management with priorities
- [ ] Format selection (quality, codec, container)
- [ ] Batch URL import
- [ ] WebSocket-based real-time progress
- [ ] Download history and statistics
- [ ] Proxy/VPN support for geo-restricted content
- [ ] Scheduled downloads
- [ ] iOS companion app
- [ ] Media server integration (Plex, Jellyfin)
- [ ] Subtitle download and embedding
- [ ] Dark mode for web UI
