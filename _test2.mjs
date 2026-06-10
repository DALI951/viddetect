const res = await fetch('http://localhost:3001/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
})
const data = await res.json()
for (const f of data.formats) {
  console.log(`${f.resolution} id=${f.formatId} size=${f.size||'N/A'}`)
  const dlRes = await fetch(`http://localhost:3001/api/download?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}&formatId=${f.formatId}`)
  if (dlRes.ok) {
    const buf = await dlRes.arrayBuffer()
    console.log(`  -> Downloaded: ${buf.byteLength} bytes`)
  } else {
    const txt = await dlRes.text()
    console.log(`  -> Failed: ${txt.slice(0, 100)}`)
  }
}
