const res = await fetch('http://localhost:3001/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
})
const data = await res.json()
console.log('Success:', data.success)
if (data.formats) {
  for (const f of data.formats) {
    console.log(`${f.resolution} - ${f.format} id=${f.formatId} size=${f.size||'N/A'}`)
  }
}
