import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

function platformIcon(name) {
  const icons = { 'YouTube':'▶','Instagram':'📷','TikTok':'♪','Facebook':'f','X (Twitter)':'𝕏','Reddit':'r','Vimeo':'V','Twitch':'▶','Dailymotion':'D','Bilibili':'B','Niconico':'N','Youku':'Y','TED':'T','Daily Mail':'DM','BBC':'B' }
  return icons[name] || name?.slice(0, 2) || '?'
}

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('VidDetect', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('handles')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function getStoredDirHandle() {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly')
      const req = tx.objectStore('handles').get('folder')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}
async function storeDirHandle(handle) {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite')
      tx.objectStore('handles').put(handle, 'folder')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

function shortenUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace('www.', '') + u.pathname.replace(/\/$/, '').slice(0, 40)
  } catch {
    return url
  }
}

function formatSize(bytes) {
  if (!bytes) return null
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let s = bytes
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++ }
  return `${s.toFixed(1)} ${u[i]}`
}

function formatDur(s) {
  if (!s) return null; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const se = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')}` : `${m}:${String(se).padStart(2, '0')}`
}

export default function App() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('vd-history') || '[]'))
  const [toast, setToast] = useState(null)
  const [preview, setPreview] = useState(null)
  const [playlistEntries, setPlaylistEntries] = useState(null)
  const [plLoading, setPlLoading] = useState(false)
  const [selectedVideos, setSelectedVideos] = useState(() => new Set())
  const [downloadQueue, setDownloadQueue] = useState(null)
  const [queueStatus, setQueueStatus] = useState({})
  const [allDone, setAllDone] = useState(false)
  const [queueElapsed, setQueueElapsed] = useState(0)
  const [playlistTitle, setPlaylistTitle] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isPlTab, setIsPlTab] = useState(() => !!new URLSearchParams(window.location.search).get('playlist'))
  const queueTimer = useRef(null)
  const toastTimer = useRef(null)
  const dirHandleRef = useRef(null)
  const plPageRef = useRef(1)
  const plUrlRef = useRef('')

  useEffect(() => {
    localStorage.setItem('vd-history', JSON.stringify(history))
  }, [history])

  async function fetchPlaylistPage(page) {
    const url = plUrlRef.current
    if (!url) return
    setPlLoading(true)
    if (page === 1) setError(null)
    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}&page=${page}&perPage=10`)
      const d = await res.json()
      if (d.success) {
        if (page === 1 && !d.entries.length) {
          setError('No entries found in this playlist')
        } else {
          setPlaylistTitle(d.playlistTitle)
          setTotalCount(d.totalCount)
          setHasMore(d.hasMore ?? false)
          setPlaylistEntries(prev => page === 1 ? d.entries : [...prev, ...d.entries])
        }
      } else {
        setError(d.error || 'Failed to load playlist')
      }
    } catch {
      setError('Failed to load playlist')
    } finally {
      setPlLoading(false)
    }
  }

  function loadMore() {
    plPageRef.current += 1
    fetchPlaylistPage(plPageRef.current)
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const url = p.get('playlist')
    if (!url) return
    plUrlRef.current = url
    plPageRef.current = 1
    setPlaylistEntries(null)
    setError(null)
    fetchPlaylistPage(1)
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const addHistory = useCallback((url, title, source) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.url !== url)
      const next = [{ url, title, source }, ...filtered]
      return next.slice(0, 10)
    })
  }, [])

  async function handleDetect(urlOverride) {
    const trimmed = (urlOverride || input).trim()
    if (!trimmed) return
    let finalUrl = trimmed
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl

    setResult(null)
    setPlaylistEntries(null)
    setError(null)
    setPreview(null)
    setLoading(true)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to analyze URL')
        return
      }
      setResult(data)
      addHistory(data.webpageUrl || finalUrl, data.title || 'Untitled', data.source.name)
    } catch {
      setError('Connection error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  function handleBrowsePlaylist(url) {
    window.open(`/?playlist=${encodeURIComponent(url)}`, 'viddetect-playlist')
  }

  function triggerDownload(url) {
    window.open(url, '_blank')
  }

  function toggleSelect(url) {
    setSelectedVideos(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url); else next.add(url)
      return next
    })
  }

  function toggleSelectAll() {
    if (!playlistEntries) return
    if (selectedVideos.size === playlistEntries.length) {
      setSelectedVideos(new Set())
    } else {
      setSelectedVideos(new Set(playlistEntries.map(e => e.url)))
    }
  }

  function formatTime(sec) {
    if (!sec || sec < 0) return null
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  async function startDownloadQueue(format) {
    const selected = [...selectedVideos]
    if (!selected.length) return

    let dirHandle = dirHandleRef.current
    let useFallback = false
    if (!dirHandle) {
      dirHandle = await getStoredDirHandle()
      if (dirHandle) {
        try {
          if ((await dirHandle.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
            const perm = await dirHandle.requestPermission?.({ mode: 'readwrite' })
            if (perm !== 'granted') dirHandle = null
          }
        } catch { dirHandle = null }
        if (dirHandle) dirHandleRef.current = dirHandle
      }
    }
    if (!dirHandle) {
      showToast('Select a folder to save downloads…')
      try {
        dirHandle = await window.showDirectoryPicker()
        storeDirHandle(dirHandle)
        dirHandleRef.current = dirHandle
      } catch (e) {
        if (e.name === 'AbortError' || e.name === 'SecurityError') {
          showToast('Folder selection cancelled')
          return
        }
        useFallback = true
      }
    }

    if (!dirHandle && !useFallback) return

    const saved = JSON.parse(localStorage.getItem('vd-dl-queue') || 'null')
    if (saved && saved.entries.some(e => e.status === 'downloading')) {
      saved.entries.forEach(e => { if (e.status === 'downloading') e.status = 'failed' })
    }

    const statusMap = {}
    const entries = selected.map(url => {
      const entry = { url, title: playlistEntries.find(e => e.url === url)?.title || 'Untitled', status: 'pending', size: 0, downloaded: 0 }
      statusMap[url] = entry
      return entry
    })

    const queue = { entries, format, totalSize: 0, startTime: Date.now(), dirHandle }
    setDownloadQueue(queue)
    setQueueStatus(statusMap)
    setAllDone(false)
    setQueueElapsed(0)

    queueTimer.current = setInterval(() => {
      setQueueElapsed(prev => prev + 1)
    }, 1000)

    localStorage.setItem('vd-dl-queue', JSON.stringify({ entries: queue.entries, format: queue.format, startTime: queue.startTime }))

    try {
      const res = await fetch('/api/batch-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: selected, format }),
      })
      const data = await res.json()
      if (data.success) {
        queue.totalSize = data.totalSize
        data.entries.forEach((e, i) => {
          if (entries[i]) {
            entries[i].size = e.size || 0
            entries[i].title = e.title || entries[i].title
          }
        })
        setDownloadQueue({ ...queue })
      }
    } catch {}

    await processQueue(queue)

    clearInterval(queueTimer.current)
    setAllDone(true)

    localStorage.removeItem('vd-dl-queue')
  }

  async function processQueue(queue) {
    for (const entry of queue.entries) {
      if (entry.status === 'done') continue

      entry.status = 'downloading'
      setQueueStatus(prev => ({ ...prev, [entry.url]: { ...entry } }))

      try {
        const url = `/api/download?url=${encodeURIComponent(entry.url)}&quality=best&format=${queue.format}&title=${encodeURIComponent(entry.title)}`
        const response = await fetch(url)

        if (!response.ok) {
          entry.status = 'failed'
          setQueueStatus(prev => ({ ...prev, [entry.url]: { ...entry } }))
          continue
        }

        if (!entry.size) {
          const cl = response.headers.get('Content-Length')
          if (cl) entry.size = parseInt(cl, 10)
        }

        const ext = queue.format === 'mp3' ? 'mp3' : 'mp4'
        const safeName = entry.title.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim() || 'video'
        const filename = `${safeName}.${ext}`

        const reader = response.body.getReader()
        let lastUpdate = 0

        if (queue.dirHandle) {
          const fileHandle = await queue.dirHandle.getFileHandle(filename, { create: true })
          const writable = await fileHandle.createWritable()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            entry.downloaded += value.length
            await writable.write(value)
            const now = Date.now()
            if (now - lastUpdate > 200) {
              lastUpdate = now
              setQueueStatus(prev => ({ ...prev, [entry.url]: { ...entry } }))
            }
          }
          await writable.close()
        } else {
          const chunks = []
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            entry.downloaded += value.length
          }
          const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || `video/${ext}` })
          const blobUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = blobUrl
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(blobUrl)
        }

        entry.status = 'done'
        setQueueStatus(prev => ({ ...prev, [entry.url]: { ...entry } }))
      } catch {
        entry.status = 'failed'
        setQueueStatus(prev => ({ ...prev, [entry.url]: { ...entry } }))
      }
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    handleDetect()
  }

  return (
    <div className={`app${isPlTab ? ' pl-tab-view' : ''}`}>

      {!isPlTab && (
      <>
      <header>
        <h1>viddetect</h1>
        <p className="subtitle">paste a URL & download media from any platform</p>
        <p className="hero-desc">Supports YouTube, Instagram, TikTok, Twitter/X, Facebook, and more. Detects available formats, resolutions, and playlist contents. Download single videos or batch from playlists.</p>
      </header>

      <form className="input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          spellCheck={false}
        />
        <button type="submit" disabled={loading}>
          {loading ? '…' : 'Detect'}
        </button>
      </form>

      {loading && (
        <div className="loading">
          <div>
            <span className="bounce-dot" />
            <span className="bounce-dot" />
            <span className="bounce-dot" />
          </div>
          <p>extracting formats…</p>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="result">
          <div className="header-card">
            <span className="source-badge">{result.source.name}</span>
            {result.uploader && <span style={{ color: '#666', fontSize: '0.78rem' }}>{result.uploader}</span>}
            <span className="meta">
              {result.duration && <span>{formatDur(result.duration)}</span>}
              {result.formats?.length && <span>{result.formats.length} quality</span>}
              {result.source.igType && <span>{result.source.igType}</span>}
            </span>
          </div>

          {(result.playlist || result.source?.playlist) && (
            <div className="playlist-banner">
              <span className="pl-icon">▶</span>
              <span className="pl-text">
                {result.playlist
                  ? <>Part of playlist <strong>"{result.playlist.title}"</strong> ({result.playlist.count} videos)</>
                  : <>This URL is part of a playlist</>}
              </span>
              <button
                className="btn btn-pl"
                onClick={() => handleBrowsePlaylist(result.playlist?.url || result.originalUrl || '')}
                disabled={plLoading}
              >
                {plLoading ? '…' : 'Browse'}
              </button>
            </div>
          )}

          {(result.thumbnail || result.formats?.some(f => Boolean(f.height))) && (
            <div className="thumbnail-wrap">
              {result.thumbnail && <img src={result.thumbnail} alt="" loading="lazy" />}
              {result.formats?.length && (
                <button
                  className={`preview-btn${preview ? ' active' : ''}`}
                  onClick={() => {
                    if (preview) { setPreview(null); return }
                    const f = result.formats[result.formats.length - 1]
                    const pUrl = `/api/download?url=${encodeURIComponent(result.webpageUrl || '')}&quality=${encodeURIComponent(f.height || 'best')}&title=${encodeURIComponent(result.title || '')}&preview=1`
                    setPreview(pUrl)
                  }}
                >
                  {preview ? 'Close' : '▶ Preview'}
                </button>
              )}
            </div>
          )}

          {preview && (
            <video className="preview-player" controls autoPlay muted>
              <source src={preview} type="video/mp4" />
            </video>
          )}

          {result.title && <div className="title">{result.title}</div>}

          <div className="formats">
            {result.formats?.map((f, i) => {
              const dlUrl = `/api/download?url=${encodeURIComponent(result.webpageUrl || '')}&quality=${encodeURIComponent(f.height || 'best')}&title=${encodeURIComponent(result.title || '')}`
              const isImage = f.ext === 'jpg' || f.ext === 'jpeg' || f.ext === 'png'
              return (
                <div className="format-row" key={i}>
                  <div className="format-left">
                    <span className="res-badge">{f.resolution}</span>
                    <span className="ext-tag">{f.format || f.ext?.toUpperCase() || '?'}</span>
                    {f.size && <span className="size-tag">{formatSize(f.size)}</span>}
                  </div>
                  <div className="format-actions">
                    <button className="btn btn-dl" onClick={() => triggerDownload(dlUrl)}>{isImage ? 'Download' : 'MP4'}</button>
                    <button className="btn btn-copy" onClick={() => {
                      navigator.clipboard.writeText(window.location.origin + dlUrl)
                        .then(() => showToast('URL copied'))
                        .catch(() => showToast('Failed to copy'))
                    }}>URL</button>
                  </div>
                </div>
              )
            })}
          </div>

          {result.formats?.length && !result.formats.some(f => f.ext === 'jpg' || f.ext === 'jpeg') && (
            <div className="mp3-card">
              <div className="mp3-icon">♪</div>
              <div className="mp3-body">
                <strong>Audio Only</strong>
                <span className="mp3-desc">192 kbps MP3 — extracted from source</span>
              </div>
              <button
                className="btn btn-mp3"
                onClick={() => {
                  const dlUrl = `/api/download?url=${encodeURIComponent(result.webpageUrl || '')}&quality=best&title=${encodeURIComponent(result.title || '')}&format=mp3`
                  triggerDownload(dlUrl)
                }}
              >
                MP3
              </button>
            </div>
          )}

        </div>
      )}
        </>
      )}

      {isPlTab && plLoading && !playlistEntries && (
        <div className="pl-tab-loading">
          <div className="pl-tab-header">
            <span className="pl-skel-title ghost-line w-40" />
          </div>
          <div className="pl-list">
            {Array.from({ length: 10 }).map((_, i) => (
              <div className="pl-entry pl-skeleton" key={i}>
                <div className="pl-cb-placeholder" />
                <div className="pl-thumb ghost" />
                <div className="pl-entry-body">
                  <div className="ghost-line w-80" />
                  <div className="ghost-line w-30" />
                </div>
                <div className="ghost-btn ghost" />
              </div>
            ))}
          </div>
        </div>
      )}

      {isPlTab && !playlistEntries && !plLoading && (
        <div className="pl-tab-error">
          <p>{error || 'Failed to load playlist.'}</p>
          <button className="btn btn-pl" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {playlistEntries && !downloadQueue && (result?.playlist?.url || isPlTab) && (
            <div className="playlist-view">
              <div className="pl-view-header">
                <span className="pl-back" onClick={() => { setPlaylistEntries(null); setSelectedVideos(new Set()); if (isPlTab) window.close() }}>← Back</span>
                {isPlTab && <span className="pl-tab-title">{playlistTitle}</span>}
                <label className="pl-select-all">
                  <input type="checkbox" checked={playlistEntries.length > 0 && selectedVideos.size === playlistEntries.length} onChange={toggleSelectAll} />
                  <span>Select All</span>
                </label>
                <span className="pl-view-count">{playlistEntries.length}{totalCount > 0 ? ` of ${totalCount}` : ''} videos</span>
                {selectedVideos.size > 0 && (
                  <div className="pl-dl-all">
                    <button className="btn btn-pl-dl" onClick={() => startDownloadQueue('mp4')}>
                      DL as MP4 ({selectedVideos.size})
                    </button>
                    <button className="btn btn-pl-dl-mp3" onClick={() => startDownloadQueue('mp3')}>
                      DL as MP3 ({selectedVideos.size})
                    </button>
                  </div>
                )}
              </div>
          <div className="pl-list">
            {playlistEntries.map((e, i) => (
              <div className={`pl-entry${selectedVideos.has(e.url) ? ' pl-selected' : ''}${!isPlTab ? '' : ' pl-stagger'}`} key={i} style={isPlTab ? { animationDelay: `${i * 0.04}s` } : {}}>
                <input type="checkbox" className="pl-cb" checked={selectedVideos.has(e.url)} onChange={() => toggleSelect(e.url)} />
                {e.thumbnail && <img className="pl-thumb" src={e.thumbnail} alt="" />}
                <div className="pl-entry-body">
                  <span className="pl-entry-title">{e.title}</span>
                  {e.duration && <span className="pl-entry-dur">{formatDur(e.duration)}</span>}
                </div>
                <button className="btn btn-analyze" onClick={() => handleDetect(e.url)}>Analyze</button>
              </div>
            ))}
          </div>
          {(hasMore || (totalCount > playlistEntries.length)) && (
            <button className="btn btn-load-more" onClick={loadMore} disabled={plLoading}>
              {plLoading ? 'Loading…' : `Load 10 more${totalCount > 0 ? ` (${totalCount - playlistEntries.length} remaining)` : ''}`}
            </button>
          )}
        </div>
      )}

      {downloadQueue && (
        <div className="dl-queue">
          <div className="dl-queue-header">
            <span className="dl-queue-title">
              {downloadQueue.totalSize === 0
                ? 'Fetching video sizes…'
                : `Downloading ${downloadQueue.format.toUpperCase()}`}
            </span>
            <span className="dl-queue-count">
              {Object.values(queueStatus).filter(e => e.status === 'done').length} of {downloadQueue.entries.length}
            </span>
          </div>
          {downloadQueue.totalSize > 0 && (
            <div className="dl-queue-summary">
              {formatTime(queueElapsed)} elapsed — saving to selected folder
            </div>
          )}
          {downloadQueue.totalSize === 0 && !allDone && (
            <div className="dl-queue-summary dl-queue-analyzing">
              Grabbing file sizes before download…
            </div>
          )}
          <div className="dl-queue-list">
            {downloadQueue.entries.map((entry, i) => {
              const st = queueStatus[entry.url] || entry
              const pct = st.size > 0 ? Math.round(st.downloaded / st.size * 100) : 0
              return (
                <div className={`dl-entry dl-${st.status}`} key={i}>
                  <span className="dl-entry-idx">{i + 1}</span>
                  <span className="dl-entry-title">{entry.title}</span>
                  <span className="dl-entry-status">
                    {st.status === 'pending' && <span className="st-pending">—</span>}
                    {st.status === 'downloading' && (
                      <span className="st-dl">{st.size > 0 ? `${pct}%` : '…'}</span>
                    )}
                    {st.status === 'done' && <span className="st-done">✓ done</span>}
                    {st.status === 'failed' && <span className="st-fail">✗ failed</span>}
                  </span>
                  {st.status === 'downloading' && (
                    <div className={`dl-progress${st.size > 0 ? '' : ' dl-progress-indet'}`}>
                      <div className="dl-progress-fill" style={{ width: st.size > 0 ? `${pct}%` : '30%' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {allDone && (
            <div className="dl-queue-done">
              <span>✓ All downloads complete</span>
              <button className="btn" onClick={() => window.close()} style={{ marginLeft: 'auto' }}>Close</button>
            </div>
          )}
        </div>
      )}

      <div className="history">
        {history.length > 0 && <h3>History</h3>}
        <div className="history-list">
          {history.map((h, i) => (
            <div
              className="history-item"
              key={i}
              onClick={() => {
                setInput(h.url)
                setTimeout(() => {
                  const form = document.querySelector('form')
                  form?.requestSubmit()
                }, 0)
              }}
            >
              <span className="h-icon">{platformIcon(h.source)}</span>
              <span className="h-title" title={h.url}>{h.title || shortenUrl(h.url)}</span>
              <span className="h-src">{h.source}</span>
            </div>
          ))}
        </div>
      </div>

      <footer>personal / educational use only</footer>

      <div className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  )
}
