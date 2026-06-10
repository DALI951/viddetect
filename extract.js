import { spawnSync } from 'child_process'
import { YtDlp, helpers } from 'ytdlp-nodejs'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export const ytdlp = new YtDlp()
const __dirname = dirname(fileURLToPath(import.meta.url))
const BIN_DIR = join(__dirname, 'node_modules', 'ytdlp-nodejs', 'bin')
const YTDLP_PATH = join(BIN_DIR, 'yt-dlp.exe')

function ytDlpJson(args) {
  const p = spawnSync(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 })
  if (p.error) throw p.error
  if (p.status !== 0) throw new Error((p.stderr || '').toString().trim() || `yt-dlp exited with code ${p.status}`)
  try { return JSON.parse(p.stdout.toString()) } catch { throw new Error('Invalid yt-dlp output: ' + (p.stderr || '').toString().trim()) }
}

export async function getPlaylistInfo(url) {
  try {
    const result = ytDlpJson(['--flat-playlist', '--dump-single-json', url])
    if (!result?.entries?.length) return null
    return {
      title: result.title || 'Playlist',
      count: result.playlist_count || result.entries.length,
      url: result.webpage_url || url,
    }
  } catch (e) {
    console.error('getPlaylistInfo:', e)
    return null
  }
}

function mapEntry(e) {
  return {
    title: e.title || 'Untitled',
    url: e.url || e.webpage_url || '',
    thumbnail: e.thumbnail || null,
    duration: e.duration ? parseInt(e.duration) : null,
  }
}

export async function getPlaylistPage(url, page = 1, perPage = 10) {
  const start = (page - 1) * perPage + 1
  const end = start + perPage - 1
  const result = ytDlpJson([
    '--flat-playlist', '--dump-single-json',
    '--playlist-items', `${start}-${end}`,
    url,
  ])
  const entries = (result.entries || []).map(mapEntry)
  const totalCount = result.playlist_count != null ? result.playlist_count : null
  return {
    entries,
    playlistTitle: result.title || result.fulltitle || 'Playlist',
    totalCount,
    hasMore: entries.length === perPage,
  }
}

export async function ensureYtDlp() {
  if (!existsSync(YTDLP_PATH)) {
    console.log('yt-dlp binary not found, downloading...')
    await helpers.downloadYtDlp()
  }
  if (!existsSync(YTDLP_PATH)) throw new Error('yt-dlp binary not found at ' + YTDLP_PATH)
  try {
    await ytdlp.updateYtDlpAsync()
  } catch (e) {
    console.error('yt-dlp update failed (continuing with existing binary):', e.message)
  }
}

function scoreFormat(f) {
  let score = 0
  if (f.filesize || f.filesize_approx) score += 20
  score += f.ext === 'mp4' ? 5 : f.ext === 'webm' ? 3 : 1
  if (f.acodec && f.acodec !== 'none') score += 10
  if (f.vcodec && f.vcodec !== 'none') score += 5
  if (f.fps && f.fps > 30) score += 2
  return score
}

function pickBestByResolution(formats) {
  let best = null
  for (const f of formats) {
    if (!best || scoreFormat(f) > scoreFormat(best)) best = f
  }
  return best
}

export async function extractFormats(url) {
  await ensureYtDlp()

  const data = ytDlpJson(['--dump-json', '--no-check-formats', '--no-playlist', url])

  if (!data?.formats?.length) {
    throw new Error('No downloadable formats found')
  }

  const title = data.title || data.fulltitle || 'Untitled'
  const thumbnail = data.thumbnail || null
  const duration = data.duration ? parseInt(data.duration) : null

  const STANDARD_LABELS = new Set(['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'])

  const byResolution = {}

  for (const f of data.formats) {
    if (!f.url) continue
    if (!f.resolution || f.resolution === 'audio only') continue
    if (!f.vcodec || f.vcodec === 'none') continue

    let resLabel = (f.format_note || f.resolution || 'Unknown').trim()
    if (resLabel.includes('x') && resLabel.split('x').every(p => /^\d+$/.test(p))) {
      resLabel = `${resLabel.split('x')[1]}p`
    } else if (/^\d+$/.test(resLabel)) {
      resLabel = `${resLabel}p`
    }

    if (!byResolution[resLabel]) byResolution[resLabel] = []
    byResolution[resLabel].push(f)
  }

  const allFormats = []
  const filteredFormats = []

  for (const [resLabel, items] of Object.entries(byResolution)) {
    const best = pickBestByResolution(items)
    if (!best) continue

    if (resLabel === '1280p') continue

    const formatName = (best.ext || '').toUpperCase()
    const height = parseInt(best.height) || parseInt(resLabel) || 0

    const entry = { resolution: resLabel, format: formatName, ext: best.ext || 'mp4', size: best.filesize || best.filesize_approx || null, height }
    allFormats.push(entry)
    if (/^\d+p$/.test(resLabel) && !STANDARD_LABELS.has(resLabel)) continue
    filteredFormats.push(entry)
  }

  const formats = filteredFormats.length ? filteredFormats : allFormats
  formats.sort((a, b) => b.height - a.height)

  return {
    title,
    thumbnail,
    duration,
    formats,
    webpageUrl: data.webpage_url || url,
    uploader: data.uploader || data.channel || null,
  }
}

export async function extractFormatSizes(urls, format = 'mp4') {
  const results = []
  for (const url of urls) {
    try {
      const data = await extractFormats(url)
      const best = format === 'mp3'
        ? data.formats[data.formats.length - 1]
        : data.formats[0]
      results.push({
        url,
        title: data.title,
        size: best?.size || 0,
        duration: data.duration,
      })
    } catch {
      results.push({ url, title: null, size: 0, duration: null })
    }
  }
  return results
}
