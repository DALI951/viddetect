// Viddetect Android Server
// This file is bundled with esbuild for nodejs-mobile

// Frontend data will be injected here
const FE = null

const { spawn, spawnSync, execSync } = require('child_process')
const { createWriteStream, existsSync, readFileSync, mkdirSync, copyFileSync } = require('fs')
const { join, dirname } = require('path')
const https = require('https')
const express = require('express')

const PORT = process.env.PORT || 3001
const EXE_DIR = process.env.EXE_DIR || __dirname
const DATA_DIR = join(EXE_DIR, '..', '..', '..', '..')
const BIN_DIR = join(DATA_DIR, 'bin')

// Ensure directories exist
try { mkdirSync(BIN_DIR, { recursive: true }) } catch {}
try { mkdirSync(join(DATA_DIR, 'downloads'), { recursive: true }) } catch {}

process.on('uncaughtException', err => {
  console.error('CRASH:', err.message)
})
process.on('unhandledRejection', reason => {
  console.error('UNHANDLED:', reason)
})

// Binary helpers for Android
function findBinary(name) {
  // Check app data directory first (copied from native libs)
  const dataBin = join(DATA_DIR, name)
  if (existsSync(dataBin)) return dataBin
  // Check BIN_DIR
  const bin = join(BIN_DIR, name)
  if (existsSync(bin)) return bin
  // Check if it's in PATH
  return name
}

function ffmpegWorks() {
  const p = findBinary('ffmpeg')
  if (!existsSync(p)) return false
  try {
    return spawnSync(p, ['-version'], { stdio: 'ignore' }).status === 0
  } catch { return false }
}

// MIME types for frontend files
const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
}

const app = express()
app.use(express.json())

// Serve embedded frontend
app.get('/', (req, res) => {
  const idx = FE ? FE['index.html'] : null
  if (idx) { res.setHeader('Content-Type', idx.m); res.end(Buffer.from(idx.b, 'base64')) }
  else res.status(404).send('Frontend not loaded')
})

app.get('/assets/*', (req, res) => {
  if (!FE) { res.status(404).send('No frontend'); return }
  const p = req.path.replace(/^\//, '')
  const entry = FE[p]
  if (entry) {
    res.setHeader('Content-Type', entry.m)
    res.setHeader('Cache-Control', 'public, max-age=31536000')
    res.end(Buffer.from(entry.b, 'base64'))
  } else res.status(404).send('Not found')
})

// Source detection
const PLATFORMS = [
  { test: /(?:www\.)?youtube\.com/i, name: 'YouTube' },
  { test: /(?:www\.)?youtu\.be/i, name: 'YouTube' },
  { test: /(?:www\.)?vimeo\.com/i, name: 'Vimeo' },
  { test: /(?:www\.)?dailymotion\.com/i, name: 'Dailymotion' },
  { test: /(?:www\.)?twitch\.tv/i, name: 'Twitch' },
  { test: /(?:www\.)?facebook\.com/i, name: 'Facebook' },
  { test: /(?:www\.)?fb\.watch/i, name: 'Facebook' },
  { test: /(?:www\.)?instagram\.com/i, name: 'Instagram' },
  { test: /(?:www\.)?twitter\.com/i, name: 'X (Twitter)' },
  { test: /(?:www\.)?x\.com/i, name: 'X (Twitter)' },
  { test: /(?:www\.)?tiktok\.com/i, name: 'TikTok' },
  { test: /(?:www\.)?reddit\.com/i, name: 'Reddit' },
  { test: /(?:www\.)?bilibili\.com/i, name: 'Bilibili' },
  { test: /(?:www\.)?nicovideo\.jp/i, name: 'Niconico' },
  { test: /(?:www\.)?youku\.com/i, name: 'Youku' },
  { test: /(?:www\.)?ted\.com/i, name: 'TED' },
  { test: /(?:www\.)?dailymail\.co\.uk/i, name: 'Daily Mail' },
  { test: /(?:www\.)?bbc\.(?:com|co\.uk)/i, name: 'BBC' },
]

function instagramType(url) {
  if (/\/stories\//i.test(url)) return 'story'
  if (/\/p\/|\/reel\/|\/tv\/|\/reels\//i.test(url)) return 'post'
  return 'profile'
}

function hasPlaylist(url) {
  try { const u = new URL(url); return !!(u.searchParams.get('list') || u.searchParams.get('playlist')) }
  catch { return false }
}

function detectSource(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    for (const p of PLATFORMS) {
      if (p.test.test(host)) {
        const s = { name: p.name, type: 'known' }
        if (p.name === 'Instagram') s.igType = instagramType(url)
        if (p.name === 'YouTube' && hasPlaylist(url)) s.playlist = true
        return s
      }
    }
    return { name: host, type: 'generic' }
  } catch { return null }
}

// Cache
const TTL = 5 * 60 * 1000; const store = new Map()
function cacheKey(url) {
  try { const u = new URL(url); u.searchParams.sort(); return u.origin + u.pathname.replace(/\/$/, '').toLowerCase() + u.search }
  catch { return url }
}
function cacheGet(url) {
  const k = cacheKey(url); const e = store.get(k); if (!e) return null
  if (Date.now() - e.ts > TTL) { store.delete(k); return null }
  return e.data
}
function cacheSet(url, data) { store.set(cacheKey(url), { data, ts: Date.now() }) }

// yt-dlp helper
function ytDlpJson(args) {
  const p = spawnSync(findBinary('yt-dlp'), args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 })
  if (p.error) throw p.error
  if (p.status !== 0) throw new Error((p.stderr || '').toString().trim() || 'yt-dlp error ' + p.status)
  try { return JSON.parse(p.stdout.toString()) } catch { throw new Error('Invalid yt-dlp output') }
}

function scoreFormat(f) {
  let s = 0; if (f.filesize || f.filesize_approx) s += 20
  s += f.ext === 'mp4' ? 5 : f.ext === 'webm' ? 3 : 1
  if (f.acodec && f.acodec !== 'none') s += 10; if (f.vcodec && f.vcodec !== 'none') s += 5
  if (f.fps && f.fps > 30) s += 2; return s
}
function pickBest(fmts) { let b = null; for (const f of fmts) { if (!b || scoreFormat(f) > scoreFormat(b)) b = f }; return b }

async function extractFormats(url) {
  const data = ytDlpJson(['--dump-json', '--no-check-formats', '--no-playlist', url])
  if (!data?.formats?.length) throw new Error('No formats found')
  const title = data.title || data.fulltitle || 'Untitled'
  const thumbnail = data.thumbnail || null
  const duration = data.duration ? parseInt(data.duration) : null
  const STD = new Set(['144p','240p','360p','480p','720p','1080p','1440p','2160p'])
  const byRes = {}
  for (const f of data.formats) {
    if (!f.url || !f.resolution || f.resolution === 'audio only' || !f.vcodec || f.vcodec === 'none') continue
    let r = (f.format_note || f.resolution || 'Unknown').trim()
    if (r.includes('x') && r.split('x').every(p => /^\d+$/.test(p))) r = r.split('x')[1] + 'p'
    else if (/^\d+$/.test(r)) r = r + 'p'
    if (!byRes[r]) byRes[r] = []; byRes[r].push(f)
  }
  const all = []; const filtered = []
  for (const [r, items] of Object.entries(byRes)) {
    const best = pickBest(items); if (!best || r === '1280p') continue
    const h = parseInt(best.height) || parseInt(r) || 0
    const e = { resolution: r, format: (best.ext || '').toUpperCase(), ext: best.ext || 'mp4', size: best.filesize || best.filesize_approx || null, height: h }
    all.push(e); if (!(/^\d+p$/.test(r) && !STD.has(r))) filtered.push(e)
  }
  const fmts = filtered.length ? filtered : all; fmts.sort((a, b) => b.height - a.height)
  return { title, thumbnail, duration, formats: fmts, webpageUrl: data.webpage_url || url, uploader: data.uploader || data.channel || null }
}

async function getPlaylistInfo(url) {
  try {
    const r = ytDlpJson(['--flat-playlist', '--dump-single-json', url])
    if (!r?.entries?.length) return null
    return { title: r.title || 'Playlist', count: r.playlist_count || r.entries.length, url: r.webpage_url || url }
  } catch { return null }
}

async function getPlaylistPage(url, page, perPage) {
  const start = (page - 1) * perPage + 1
  const r = ytDlpJson(['--flat-playlist', '--dump-single-json', '--playlist-items', start + '-' + (start + perPage - 1), url])
  const entries = (r.entries || []).map(e => ({ title: e.title || 'Untitled', url: e.url || e.webpage_url || '', thumbnail: e.thumbnail || null, duration: e.duration ? parseInt(e.duration) : null }))
  return { entries, playlistTitle: r.title || r.fulltitle || 'Playlist', totalCount: r.playlist_count != null ? r.playlist_count : null, hasMore: entries.length === perPage }
}

// Instagram
function decodeHtml(s) { return s.replace(/&amp;/g, '&').replace(/&#38;/g, '&') }
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36' } }, res => {
      let h = ''; res.on('data', c => h += c); res.on('end', () => resolve(h))
    }).on('error', reject)
  })
}

async function extractInstagramPost(url) {
  const { instagramGetUrl } = require('instagram-url-direct')
  const result = await instagramGetUrl(url)
  const formats = result.media_details.map((item, i) => {
    const v = item.type === 'video'
    return { format_id: 'ig-' + i, url: item.url, ext: v ? 'mp4' : 'jpg', mime: v ? 'video/mp4' : 'image/jpeg', resolution: v ? item.dimensions.height + 'p' : item.dimensions.width + 'x' + item.dimensions.height, height: item.dimensions.height, width: item.dimensions.width, has_video: v, has_audio: v, format_note: v ? 'Original Video' : 'Original Image', filesize: null, thumbnail: item.thumbnail || null }
  })
  return { title: (result.post_info?.caption?.slice(0, 100)) || 'Instagram by ' + (result.post_info?.owner_username || 'unknown'), thumbnail: result.media_details[0]?.thumbnail || null, duration: null, uploader: result.post_info?.owner_username || null, webpageUrl: url, formats }
}

async function extractInstagramProfile(url) {
  const html = await fetchPage(url)
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<script\s+type="application\/ld\+json"[^>]*>([^<]+)<\/script>/)
  let img = null
  if (m) {
    if (m[0].includes('og:image')) img = decodeHtml(m[1])
    else try { const j = JSON.parse(m[1]); img = j?.image?.url || j?.image || null; if (img) img = decodeHtml(img) } catch {}
  }
  if (!img) throw new Error('No profile picture found')
  const username = url.replace(/\/+$/, '').split('/').pop() || 'instagram'
  return { title: username + ' (profile)', thumbnail: img, duration: null, uploader: username, webpageUrl: url, formats: [{ resolution: 'Original', format: 'JPG', ext: 'jpg', size: null, height: 0, url: img }] }
}

async function extractInstagramStory(url) {
  const data = ytDlpJson(['-f', 'b', '--dump-json', '--no-playlist', url])
  if (!data?.formats?.length) throw new Error('No story formats')
  const byRes = {}
  for (const f of data.formats || []) {
    if (!f.url) continue
    const l = f.format_note || f.resolution || String(f.height || f.width || 0)
    if (!byRes[l]) byRes[l] = []; byRes[l].push(f)
  }
  const formats = []
  for (const [r, items] of Object.entries(byRes)) {
    const best = items.sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0]
    if (!best) continue
    formats.push({ resolution: r, format: (best.ext || '').toUpperCase(), ext: best.ext || 'mp4', size: best.filesize || best.filesize_approx || null, height: parseInt(best.height) || 0, url: best.url })
  }
  formats.sort((a, b) => b.height - a.height)
  return { title: data.title || data.fulltitle || 'Untitled', thumbnail: data.thumbnail || null, duration: data.duration ? parseInt(data.duration) : null, uploader: data.uploader || data.channel || null, webpageUrl: data.webpage_url || url, formats }
}

function sanitize(name) { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'video' }
function encodeDisposition(name, ext) {
  ext = ext || 'mp4'
  const a = name.replace(/[^\x20-\x7e]/g, '_')
  const e = encodeURIComponent(name).replace(/%20/g, ' ')
  return 'attachment; filename="' + a + '.' + ext + '"; filename*=UTF-8\'\'' + e + '.' + ext
}

// Routes
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') { res.status(400).json({ error: 'Missing url' }); return }
  let fu = url; if (!/^https?:\/\//i.test(fu)) fu = 'https://' + fu
  const src = detectSource(fu)
  if (!src) { res.status(400).json({ error: 'Invalid URL' }); return }
  try {
    const c = cacheGet(fu); if (c) { res.json(c); return }
    let rp = src?.name === 'Instagram' ? (src.igType === 'story' ? extractInstagramStory(fu) : src.igType === 'profile' ? extractInstagramProfile(fu) : extractInstagramPost(fu)) : extractFormats(fu)
    const [result, pl] = await Promise.all([rp, src?.playlist ? getPlaylistInfo(fu).catch(() => null) : null])
    const payload = { success: true, source: src, originalUrl: fu, ...result, playlist: pl }
    cacheSet(fu, payload); res.json(payload)
  } catch (err) { res.status(400).json({ success: false, source: src, error: err.stderr || err.message }) }
})

app.post('/api/batch-analyze', async (req, res) => {
  const { urls, format } = req.body; if (!urls?.length) { res.status(400).json({ error: 'Missing urls' }); return }
  const df = format === 'mp3' ? 'mp3' : 'mp4'; const entries = []; const batch = urls.slice(0, 50)
  for (let i = 0; i < batch.length; i += 5) {
    const chunk = batch.slice(i, i + 5)
    const results = await Promise.allSettled(chunk.map(async u => { try { const d = await extractFormats(u); const b = df === 'mp3' ? d.formats[d.formats.length - 1] : d.formats[0]; return { url: u, title: d.title, size: b?.size || 0, duration: d.duration } } catch { return { url: u, title: null, size: 0, duration: null } } }))
    for (const r of results) entries.push(r.status === 'fulfilled' ? r.value : { url: chunk[results.indexOf(r)], title: null, size: 0, duration: null })
  }
  res.json({ success: true, entries, totalSize: entries.reduce((s, e) => s + (e.size || 0), 0) })
})

app.get('/api/download', async (req, res) => {
  const { url, quality, title, format, preview } = req.query
  if (!url || !quality) { res.status(400).json({ error: 'Missing url or quality' }); return }
  let du; try { du = decodeURIComponent(url); new URL(du) } catch { res.status(400).json({ error: 'Invalid URL' }); return }
  const qual = decodeURIComponent(quality); const rt = title ? decodeURIComponent(title) : ''
  const st = sanitize(rt) || 'video-' + qual + 'p'; const df = format === 'mp3' ? 'mp3' : 'mp4'; const ip = preview === '1'
  const src = detectSource(du)

  if (src?.name === 'Instagram') {
    if (src.igType === 'post') {
      try {
        const result = await extractInstagramPost(du)
        const vf = result.formats.find(f => f.has_video) || result.formats[0]
        if (!vf) { if (!res.headersSent) res.status(404).json({ error: 'No video' }); return }
        if (df === 'mp3') {
          const ff = findBinary('ffmpeg')
          if (!existsSync(ff)) { if (!res.headersSent) res.status(400).json({ error: 'ffmpeg required' }); return }
          const conv = spawn(ff, ['-i', 'pipe:', '-f', 'mp3', '-acodec', 'libmp3lame', '-b:a', '192k', '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
          res.setHeader('Content-Disposition', encodeDisposition(st, 'mp3')); res.setHeader('Content-Type', 'audio/mpeg')
          https.get(vf.url, cr => {
            if (cr.statusCode >= 300 && cr.statusCode < 400 && cr.headers.location) { https.get(cr.headers.location, cr2 => cr2.pipe(conv.stdin)).on('error', ()=>{}); return }
            cr.pipe(conv.stdin)
          }).on('error', ()=>{})
          conv.stdout.pipe(res); return
        }
        const d = ip ? 'inline' : encodeDisposition(st)
        https.get(vf.url, cr => {
          if (cr.statusCode >= 300 && cr.statusCode < 400 && cr.headers.location) { https.get(cr.headers.location, cr2 => { res.setHeader('Content-Disposition', d); res.setHeader('Content-Type', cr2.headers['content-type'] || 'video/mp4'); cr2.pipe(res) }).on('error', ()=>{}); return }
          res.setHeader('Content-Disposition', d); res.setHeader('Content-Type', cr.headers['content-type'] || 'video/mp4'); cr.pipe(res)
        }).on('error', ()=>{})
      } catch (err) { if (!res.headersSent) res.status(502).json({ error: 'IG download failed', details: err.message }) }
      return
    }
    if (src.igType === 'profile') {
      try {
        const result = await extractInstagramProfile(du)
        const f = result.formats[0]; if (!f?.url) { if (!res.headersSent) res.status(404).json({ error: 'No profile pic' }); return }
        res.setHeader('Content-Disposition', encodeDisposition(st || 'profile', 'jpg')); res.setHeader('Content-Type', 'image/jpeg')
        https.get(f.url, cr => { if (cr.statusCode >= 300 && cr.statusCode < 400 && cr.headers.location) { https.get(cr.headers.location, cr2 => cr2.pipe(res)).on('error', ()=>{}); return } cr.pipe(res) }).on('error', ()=>{})
      } catch (err) { if (!res.headersSent) res.status(502).json({ error: 'Profile download failed', details: err.message }) }
      return
    }
    if (src.igType === 'story') {
      try {
        const proc = spawn(findBinary('yt-dlp'), ['-f', 'b', '-o', '-', '--no-part', '--no-mtime', '--no-playlist', du], { stdio: ['ignore', 'pipe', 'pipe'] })
        res.setHeader('Content-Disposition', ip ? 'inline' : encodeDisposition(st)); res.setHeader('Content-Type', 'video/mp4')
        proc.stdout.pipe(res); let se = ''; proc.stderr.on('data', c => se += c)
        req.on('close', () => { if (!proc.killed) proc.kill() })
        proc.on('close', code => { if (code !== 0 && !res.headersSent) res.status(502).json({ error: 'Story failed', details: se }) })
      } catch (err) { if (!res.headersSent) res.status(502).json({ error: 'Story failed', details: err.message }) }
      return
    }
  }

  const ffOk = ffmpegWorks(); const h = parseInt(qual)
  if (df === 'mp3') {
    if (!ffOk) { if (!res.headersSent) res.status(400).json({ error: 'ffmpeg required' }); return }
    try {
      const ff = findBinary('ffmpeg')
      const conv = spawn(ff, ['-i', 'pipe:', '-f', 'mp3', '-acodec', 'libmp3lame', '-b:a', '192k', '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
      const proc = spawn(findBinary('yt-dlp'), ['-f', 'ba/b', '-o', '-', '--no-part', '--no-mtime', '--no-playlist', du], { stdio: ['ignore', 'pipe', 'pipe'] })
      res.setHeader('Content-Disposition', encodeDisposition(st, 'mp3')); res.setHeader('Content-Type', 'audio/mpeg')
      proc.stdout.pipe(conv.stdin); conv.stdout.pipe(res); let se = ''
      proc.stderr.on('data', c => se += c); req.on('close', () => { if (!proc.killed) proc.kill(); if (!conv.killed) conv.kill() })
      proc.on('close', code => { if (code !== 0 && !res.headersSent) res.status(502).json({ error: 'Audio error', details: se }) })
    } catch (err) { if (!res.headersSent) res.status(502).json({ error: 'MP3 failed', details: err.message }) }
    return
  }

  const fmt = h && ffOk ? 'bv[height<=' + h + ']+ba/b[height<=' + h + ']+ba/b' : h ? 'b[height<=' + h + ']/bv[height<=' + h + ']/b' : 'b'
  try {
    const args = ['-f', fmt, '-o', '-', '--no-part', '--no-mtime', '--no-playlist']
    if (ip) args.push('--download-sections', '*0-30', '--force-key-frames-at-cuts')
    if (ffOk) args.push('-S', '+codec:h264', '--merge-output-format', 'mp4', '--ffmpeg-location', findBinary('ffmpeg'))
    args.push(du)
    const proc = spawn(findBinary('yt-dlp'), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    res.setHeader('Content-Disposition', ip ? 'inline' : encodeDisposition(st)); res.setHeader('Content-Type', 'video/mp4')
    proc.stdout.pipe(res); let se = ''; proc.stderr.on('data', c => se += c)
    req.on('close', () => { if (!proc.killed) proc.kill() })
    proc.on('close', code => { if (code !== 0 && !res.headersSent) res.status(502).json({ error: 'yt-dlp error', details: se }) })
  } catch (err) { if (!res.headersSent) res.status(502).json({ error: 'Download failed', details: err.message }) }
})

app.get('/api/playlist', async (req, res) => {
  const { url, page: ps, perPage: pps } = req.query; if (!url) { res.status(400).json({ error: 'Missing url' }); return }
  let du; try { du = decodeURIComponent(url); new URL(du) } catch { res.status(400).json({ error: 'Invalid URL' }); return }
  const pg = parseInt(ps, 10) || 1; const pp = Math.min(parseInt(pps, 10) || 10, 50)
  try {
    const d = await getPlaylistPage(du, pg, pp)
    let tc = d.totalCount; if (tc == null) { const c = cacheGet(du); if (c?.playlist?.count) tc = c.playlist.count }
    res.json({ success: true, entries: d.entries, playlistTitle: d.playlistTitle, totalCount: tc, hasMore: d.hasMore, page: pg, perPage: pp })
  } catch (err) { res.status(400).json({ success: false, error: err.stderr || err.message }) }
})

app.get('*', (req, res) => {
  const idx = FE ? FE['index.html'] : null
  if (idx) { res.setHeader('Content-Type', idx.m); res.end(Buffer.from(idx.b, 'base64')) }
  else res.status(404).send('Not found')
})

app.listen(PORT, '0.0.0.0', () => {
  console.log('viddetect running on http://0.0.0.0:' + PORT)
  console.log('Data dir:', DATA_DIR)
})
