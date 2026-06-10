import { join } from 'path'
import { spawn, spawnSync } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import express from 'express'
import { detectSource } from './detect.js'
import { extractFormats, getPlaylistInfo, YTDLP_PATH } from './extract.js'
import { extractInstagramPost, extractInstagramStory, extractInstagramProfile } from './instagram.js'
import { helpers } from 'ytdlp-nodejs'
import https from 'https'
import { cacheGet, cacheSet } from './cache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.on('uncaughtException', err => {
  console.error('SERVER CRASH AVERTED — uncaught exception:', err.message)
  console.error(err.stack)
})
process.on('unhandledRejection', (reason) => {
  console.error('SERVER CRASH AVERTED — unhandled rejection:', reason)
})

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

const REACT_DIST = join(__dirname, 'client', 'dist')
const hasReactBuild = existsSync(join(REACT_DIST, 'index.html'))
if (hasReactBuild) {
  app.use(express.static(REACT_DIST))
} else {
  app.use(express.static(__dirname))
}

function ffmpegWorks() {
  const p = helpers.findFFmpegBinary()
  return p && existsSync(p) && spawnSync(p, ['-version'], { stdio: 'ignore' }).status === 0
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        downloadFile(new URL(res.headers.location, url).toString(), dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', err => { file.close(); reject(err) })
    }).on('error', reject)
  })
}

async function ensureFfmpeg() {
  if (ffmpegWorks()) return

  console.log('Downloading ffmpeg from yt-dlp FFmpeg-Builds...')
  const zipPath = join(BIN_DIR, 'ffmpeg.zip')

  try {
    const releaseUrl = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
    console.log('Fetching', releaseUrl)
    await downloadFile(releaseUrl, zipPath)
    console.log('Extracting ffmpeg...')

    execSync(`tar -xf "${zipPath}" -C "${BIN_DIR}" --strip-components=2 "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe" "ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe"`, { stdio: 'ignore' })
    execSync(`del "${zipPath}"`, { stdio: 'ignore' })

    if (ffmpegWorks()) {
      console.log('ffmpeg ready')
    } else {
      console.warn('ffmpeg binary from archive is not working')
    }
  } catch (err) {
    console.warn('ffmpeg download failed, will use combined formats only:', err.message)
    try { execSync(`del "${zipPath}"`, { stdio: 'ignore' }) } catch {}
  }
}
ensureFfmpeg()

import { ensureYtDlp } from './extract.js'
ensureYtDlp().catch(() => {})

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'video'
}

function encodeDisposition(name, ext = 'mp4') {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  const encoded = encodeURIComponent(name).replace(/%20/g, ' ')
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encoded}.${ext}`
}

app.post('/api/analyze', async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing "url" field' })
    return
  }

  let finalUrl = url
  if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl

  const source = detectSource(finalUrl)
  if (!source) {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  try {
    const cached = cacheGet(finalUrl)
    if (cached) {
      res.json(cached)
      return
    }

    let resultPromise
    if (source?.name === 'Instagram') {
      switch (source.igType) {
        case 'story':   resultPromise = extractInstagramStory(finalUrl); break
        case 'profile': resultPromise = extractInstagramProfile(finalUrl); break
        default:        resultPromise = extractInstagramPost(finalUrl)
      }
    } else {
      resultPromise = extractFormats(finalUrl)
    }

    const [result, playlist] = await Promise.all([
      resultPromise,
      source?.playlist ? getPlaylistInfo(finalUrl).catch(() => null) : null,
    ])

    const payload = { success: true, source, originalUrl: finalUrl, ...result, playlist }
    cacheSet(finalUrl, payload)
    res.json(payload)
  } catch (err) {
    res.status(400).json({ success: false, source, error: err.stderr || err.message })
  }
})

app.post('/api/batch-analyze', async (req, res) => {
  const { urls, format } = req.body
  if (!urls?.length) { res.status(400).json({ error: 'Missing urls' }); return }

  const dlFormat = format === 'mp3' ? 'mp3' : 'mp4'
  const entries = []
  const batch = urls.slice(0, 50)

  const concurrency = 5
  for (let i = 0; i < batch.length; i += concurrency) {
    const chunk = batch.slice(i, i + concurrency)
    const results = await Promise.allSettled(chunk.map(async url => {
      try {
        const data = await extractFormats(url)
        const best = dlFormat === 'mp3'
          ? data.formats[data.formats.length - 1]
          : data.formats[0]
        return { url, title: data.title, size: best?.size || 0, duration: data.duration }
      } catch {
        return { url, title: null, size: 0, duration: null }
      }
    }))
    for (const r of results) {
      entries.push(r.status === 'fulfilled' ? r.value : { url: chunk[results.indexOf(r)], title: null, size: 0, duration: null })
    }
  }

  const totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0)
  res.json({ success: true, entries, totalSize })
})

app.get('/api/download', async (req, res) => {
  const { url, quality, title, format, preview } = req.query
  if (!url || !quality) {
    res.status(400).json({ error: 'Missing "url" or "quality" parameter' })
    return
  }

  let decodedUrl
  try {
    decodedUrl = decodeURIComponent(url)
    new URL(decodedUrl)
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const qual = decodeURIComponent(quality)
  const rawTitle = title ? decodeURIComponent(title) : ''
  const safeTitle = sanitizeFilename(rawTitle) || `video-${qual}p`
  const dlFormat = format === 'mp3' ? 'mp3' : 'mp4'
  const isPreview = preview === '1'

  const source = detectSource(decodedUrl)
  if (source?.name === 'Instagram') {
    if (source.igType === 'post') {
      try {
        const result = await extractInstagramPost(decodedUrl)
        const vidFormat = result.formats.find(f => f.has_video) || result.formats[0]
        if (!vidFormat) {
          if (!res.headersSent) res.status(404).json({ error: 'No video found on Instagram' })
          return
        }

        if (dlFormat === 'mp3') {
          const ffmpegPath = helpers.findFFmpegBinary()
          if (!ffmpegPath || !existsSync(ffmpegPath)) {
            if (!res.headersSent) res.status(400).json({ error: 'ffmpeg required for MP3 extraction' })
            return
          }
          const convert = spawn(ffmpegPath, [
            '-i', 'pipe:',
            '-f', 'mp3',
            '-acodec', 'libmp3lame',
            '-b:a', '192k',
            '-'
          ], { stdio: ['pipe', 'pipe', 'pipe'] })
          res.setHeader('Content-Disposition', encodeDisposition(safeTitle, 'mp3'))
          res.setHeader('Content-Type', 'audio/mpeg')

          https.get(vidFormat.url, cdnRes => {
            if (cdnRes.statusCode >= 300 && cdnRes.statusCode < 400 && cdnRes.headers.location) {
              https.get(cdnRes.headers.location, cdnRes2 => {
                cdnRes2.pipe(convert.stdin)
              }).on('error', err => {
                if (!res.headersSent) res.status(502).json({ error: 'Instagram MP3 proxy failed', details: err.message })
              })
              return
            }
            cdnRes.pipe(convert.stdin)
          }).on('error', err => {
            if (!res.headersSent) res.status(502).json({ error: 'Instagram MP3 proxy failed', details: err.message })
          })
          convert.stdout.pipe(res)
          return
        }

        const disposition = isPreview
          ? 'inline'
          : encodeDisposition(safeTitle)

        https.get(vidFormat.url, cdnRes => {
          if (cdnRes.statusCode >= 300 && cdnRes.statusCode < 400 && cdnRes.headers.location) {
            https.get(cdnRes.headers.location, cdnRes2 => {
              res.setHeader('Content-Disposition', disposition)
              res.setHeader('Content-Type', cdnRes2.headers['content-type'] || 'video/mp4')
              cdnRes2.pipe(res)
            }).on('error', err => {
              if (!res.headersSent) res.status(502).json({ error: 'Instagram proxy failed', details: err.message })
            })
            return
          }
          res.setHeader('Content-Disposition', disposition)
          res.setHeader('Content-Type', cdnRes.headers['content-type'] || 'video/mp4')
          cdnRes.pipe(res)
        }).on('error', err => {
          if (!res.headersSent) res.status(502).json({ error: 'Instagram proxy failed', details: err.message })
        })
      } catch (err) {
        if (!res.headersSent) res.status(502).json({ error: 'Instagram download failed', details: err.message })
      }
      return
    }

    if (source.igType === 'profile') {
      try {
        const result = await extractInstagramProfile(decodedUrl)
        const format = result.formats[0]
        if (!format?.url) {
          if (!res.headersSent) res.status(404).json({ error: 'No profile picture found' })
          return
        }
        res.setHeader('Content-Disposition', encodeDisposition(safeTitle || 'profile', 'jpg'))
        res.setHeader('Content-Type', 'image/jpeg')
        https.get(format.url, cdnRes => {
          if (cdnRes.statusCode >= 300 && cdnRes.statusCode < 400 && cdnRes.headers.location) {
            https.get(cdnRes.headers.location, cdnRes2 => {
              cdnRes2.pipe(res)
            }).on('error', err => {
              if (!res.headersSent) res.status(502).json({ error: 'Image proxy failed', details: err.message })
            })
            return
          }
          cdnRes.pipe(res)
        }).on('error', err => {
          if (!res.headersSent) res.status(502).json({ error: 'Image proxy failed', details: err.message })
        })
      } catch (err) {
        if (!res.headersSent) res.status(502).json({ error: 'Instagram profile download failed', details: err.message })
      }
      return
    }

    if (source.igType === 'story') {
      try {
        const proc = spawn(YTDLP_PATH, [
          '-f', 'b',
          '-o', '-',
          '--no-part',
          '--no-mtime',
          '--no-playlist',
          decodedUrl
        ], { stdio: ['ignore', 'pipe', 'pipe'] })
        res.setHeader('Content-Disposition', isPreview ? 'inline' : encodeDisposition(safeTitle))
        res.setHeader('Content-Type', 'video/mp4')
        proc.stdout.on('error', () => { if (!proc.killed) proc.kill() })
        proc.stdout.pipe(res)
        let stderr = ''
        proc.stderr.on('data', chunk => { stderr += chunk.toString() })
        req.on('close', () => { if (!proc.killed) proc.kill() })
        proc.on('error', err => { if (!res.headersSent) res.status(502).json({ error: 'Story download failed', details: err.message }) })
        proc.on('close', code => {
          if (code !== 0 && !res.headersSent) {
            res.status(502).json({ error: 'Story download failed. Instagram stories require being logged in.', details: stderr })
          }
        })
      } catch (err) {
        if (!res.headersSent) res.status(502).json({ error: 'Story download failed', details: err.message })
      }
      return
    }
  }

  const ffOk = ffmpegWorks()
  const height = parseInt(qual)

  if (dlFormat === 'mp3') {
    if (!ffOk) {
      if (!res.headersSent) res.status(400).json({ error: 'ffmpeg required for MP3 extraction' })
      return
    }
    try {
      const ffmpegPath = helpers.findFFmpegBinary()
      const convert = spawn(ffmpegPath, [
        '-i', 'pipe:',
        '-f', 'mp3',
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-'
      ], { stdio: ['pipe', 'pipe', 'pipe'] })

      const proc = spawn(YTDLP_PATH, [
        '-f', 'ba/b',
        '-o', '-',
        '--no-part',
        '--no-mtime',
        '--no-playlist',
        decodedUrl
      ], { stdio: ['ignore', 'pipe', 'pipe'] })

      res.setHeader('Content-Disposition', encodeDisposition(safeTitle, 'mp3'))
      res.setHeader('Content-Type', 'audio/mpeg')

      proc.stdout.on('error', () => { if (!proc.killed) proc.kill() })
      convert.stdout.on('error', () => { if (!convert.killed) convert.kill() })
      proc.stdout.pipe(convert.stdin)
      convert.stdout.pipe(res)

      let stderr = ''
      proc.stderr.on('data', chunk => { stderr += chunk.toString() })
      convert.stderr.on('data', () => {})

      req.on('close', () => {
        if (!proc.killed) proc.kill()
        if (!convert.killed) convert.kill()
      })

      proc.on('error', (err) => {
        if (!res.headersSent) res.status(502).json({ error: 'Download failed', details: err.message })
      })

      proc.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
          res.status(502).json({ error: 'yt-dlp audio error', details: stderr })
        }
      })
      convert.on('error', (err) => {
        if (!res.headersSent) res.status(502).json({ error: 'Audio conversion failed', details: err.message })
      })
    } catch (err) {
      if (!res.headersSent) res.status(502).json({ error: 'MP3 download failed', details: err.message })
    }
    return
  }

  const fmt = height && ffOk
    ? `bv[height<=${height}]+ba/b[height<=${height}]+ba/b`
    : height
      ? `b[height<=${height}]/bv[height<=${height}]/b`
      : 'b'

  try {
    const args = [
      '-f', fmt,
      '-o', '-',
      '--no-part',
      '--no-mtime',
      '--no-playlist',
    ]

    if (isPreview) {
      args.push('--download-sections', '*0-30')
      args.push('--force-key-frames-at-cuts')
    }

    if (ffOk) {
      args.push('-S', '+codec:h264', '--merge-output-format', 'mp4', '--ffmpeg-location', helpers.findFFmpegBinary())
    }

    args.push(decodedUrl)

    const proc = spawn(YTDLP_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const disposition = isPreview ? 'inline' : encodeDisposition(safeTitle)
    res.setHeader('Content-Disposition', disposition)
    res.setHeader('Content-Type', 'video/mp4')

    proc.stdout.on('error', () => { if (!proc.killed) proc.kill() })
    proc.stdout.pipe(res)

    let stderr = ''
    proc.stderr.on('data', chunk => { stderr += chunk.toString() })

    req.on('close', () => {
      if (!proc.killed) proc.kill()
    })

    proc.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Download failed', details: err.message })
      }
    })

    proc.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(502).json({ error: 'yt-dlp error', details: stderr })
      }
    })
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Download failed', details: err.message })
    }
  }
})

app.get('/api/playlist', async (req, res) => {
  const { url, page: pageStr, perPage: perPageStr } = req.query
  if (!url) { res.status(400).json({ error: 'Missing url' }); return }

  let decodedUrl
  try {
    decodedUrl = decodeURIComponent(url)
    new URL(decodedUrl)
  } catch {
    res.status(400).json({ error: 'Invalid URL' }); return
  }

  const page = parseInt(pageStr, 10) || 1
  const perPage = Math.min(parseInt(perPageStr, 10) || 10, 50)

  try {
    const { getPlaylistPage } = await import('./extract.js')
    const data = await getPlaylistPage(decodedUrl, page, perPage)
    console.log(`[playlist] page=${page} url=${decodedUrl.slice(0,80)} entries=${data.entries.length} total=${data.totalCount} hasMore=${data.hasMore}`)
    let totalCount = data.totalCount
    if (totalCount == null) {
      const cached = cacheGet(decodedUrl)
      if (cached?.playlist?.count) totalCount = cached.playlist.count
    }
    res.json({
      success: true,
      entries: data.entries,
      playlistTitle: data.playlistTitle,
      totalCount,
      hasMore: data.hasMore,
      page,
      perPage,
    })
  } catch (err) {
    console.error(`[playlist] ERROR page=${page} url=${decodedUrl.slice(0,80)}:`, err.message)
    res.status(400).json({ success: false, error: err.stderr || err.message })
  }
})

if (hasReactBuild) {
  app.get('*', (req, res) => {
    res.sendFile(join(REACT_DIST, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`viddetect running at http://localhost:${PORT}`)
})
