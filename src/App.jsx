import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const OFFICE_MEDIA_PATTERNS = [
  /^word\/media\//i,
  /^ppt\/media\//i,
  /^xl\/media\//i,
]

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']

function bytesToSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** index)
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function extensionOf(name = '') {
  const lower = name.toLowerCase()
  const hit = IMAGE_EXTENSIONS.find((ext) => lower.endsWith(ext))
  return hit || '.png'
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function extractOfficeImages(file) {
  const zip = await JSZip.loadAsync(file)
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => OFFICE_MEDIA_PATTERNS.some((pattern) => pattern.test(entry.name)))

  const results = []
  for (const [index, entry] of entries.entries()) {
    const blob = await entry.async('blob')
    const name = entry.name.split('/').pop() || `image-${index + 1}${extensionOf(entry.name)}`
    const dataUrl = await blobToDataUrl(blob)
    results.push({
      id: `office-${index + 1}`,
      index: index + 1,
      source: 'Archivo Office',
      label: name,
      filename: name,
      size: blob.size,
      blob,
      dataUrl,
    })
  }

  return results
}

async function renderPdfPagesToImages(file, scale = 2) {
  const data = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const images = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const filename = `pdf-page-${pageNumber}.png`
    images.push({
      id: `pdf-${pageNumber}`,
      index: pageNumber,
      source: 'PDF renderizado',
      label: `Página ${pageNumber}`,
      filename,
      size: blob.size,
      blob,
      dataUrl: canvas.toDataURL('image/png'),
    })
  }

  return images
}

async function blobFromFile(file) {
  return file
}

async function loadImageBitmap(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function detectBackgroundColor(ctx, width, height) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]

  const colors = points.map(([x, y]) => {
    const px = ctx.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data
    return [px[0], px[1], px[2]]
  })

  const sum = colors.reduce((acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]], [0, 0, 0])
  return sum.map((v) => v / colors.length)
}

function colorDistance(a, b) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function computeMaskFromCanvas(ctx, width, height, backgroundColor) {
  const data = ctx.getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const rgb = [data[i], data[i + 1], data[i + 2]]
      const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3
      const dist = colorDistance(rgb, backgroundColor)
      if (brightness < 245 && dist > 18) mask[y * width + x] = 1
    }
  }

  return mask
}

function overlap(a, b, pad = 0) {
  return !(
    a.x + a.width + pad < b.x ||
    b.x + b.width + pad < a.x ||
    a.y + a.height + pad < b.y ||
    b.y + b.height + pad < a.y
  )
}

function mergeBoxes(boxes) {
  const merged = []
  for (const box of boxes.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const existing = merged.find((item) => overlap(item, box, 12))
    if (!existing) {
      merged.push({ ...box })
      continue
    }
    const minX = Math.min(existing.x, box.x)
    const minY = Math.min(existing.y, box.y)
    const maxX = Math.max(existing.x + existing.width, box.x + box.width)
    const maxY = Math.max(existing.y + existing.height, box.y + box.height)
    existing.x = minX
    existing.y = minY
    existing.width = maxX - minX
    existing.height = maxY - minY
    existing.area = existing.width * existing.height
  }
  return merged
}

function componentLabeling(mask, width, height) {
  const visited = new Uint8Array(width * height)
  const boxes = []
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      if (!mask[idx] || visited[idx]) continue

      const stack = [[x, y]]
      visited[idx] = 1
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y
      let count = 0

      while (stack.length) {
        const [cx, cy] = stack.pop()
        count += 1
        if (cx < minX) minX = cx
        if (cy < minY) minY = cy
        if (cx > maxX) maxX = cx
        if (cy > maxY) maxY = cy

        for (const [dx, dy] of dirs) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const nidx = ny * width + nx
          if (visited[nidx] || !mask[nidx]) continue
          visited[nidx] = 1
          stack.push([nx, ny])
        }
      }

      const boxWidth = maxX - minX + 1
      const boxHeight = maxY - minY + 1
      const area = boxWidth * boxHeight
      const fillRatio = count / area
      if (boxWidth >= 24 && boxHeight >= 24 && area >= 800 && fillRatio > 0.08) {
        boxes.push({ x: minX, y: minY, width: boxWidth, height: boxHeight, area })
      }
    }
  }

  return mergeBoxes(boxes)
}

function cropCanvas(sourceCanvas, rect, pad = 6) {
  const x = Math.max(0, Math.round(rect.x - pad))
  const y = Math.max(0, Math.round(rect.y - pad))
  const width = Math.min(sourceCanvas.width - x, Math.round(rect.width + pad * 2))
  const height = Math.min(sourceCanvas.height - y, Math.round(rect.height + pad * 2))
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height)
  return canvas
}

async function segmentImageFile(file) {
  const img = await loadImageBitmap(file)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)

  const bg = detectBackgroundColor(ctx, canvas.width, canvas.height)
  const mask = computeMaskFromCanvas(ctx, canvas.width, canvas.height, bg)
  const boxes = componentLabeling(mask, canvas.width, canvas.height)

  const regions = []
  for (const [index, box] of boxes.entries()) {
    const crop = cropCanvas(canvas, box, 6)
    const blob = await new Promise((resolve) => crop.toBlob(resolve, 'image/png'))
    regions.push({
      id: `img-${index + 1}`,
      index: index + 1,
      source: 'Imagen segmentada',
      label: `Segmento ${index + 1}`,
      filename: `segmento-${index + 1}.png`,
      size: blob.size,
      blob,
      dataUrl: crop.toDataURL('image/png'),
    })
  }

  if (!regions.length) {
    const dataUrl = await blobToDataUrl(file)
    return [{
      id: 'img-1',
      index: 1,
      source: 'Imagen única',
      label: file.name,
      filename: file.name,
      size: file.size,
      blob: file,
      dataUrl,
    }]
  }

  return regions
}

function isOfficeDocument(fileName = '') {
  const lower = fileName.toLowerCase()
  return ['.docx', '.pptx', '.xlsx'].some((ext) => lower.endsWith(ext))
}

export default function App() {
  const [theme, setTheme] = useState('light')
  const [sourceName, setSourceName] = useState('')
  const [status, setStatus] = useState('Carga una imagen para separar sus elementos visuales, o un documento para extraer imágenes embebidas.')
  const [items, setItems] = useState([])
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: light)').matches
    setTheme(prefersDark ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const summary = useMemo(() => {
    if (!items.length) return 'Sin imágenes extraídas'
    return `${items.length} imágenes detectadas y separadas`
  }, [items])

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const processFile = async (file) => {
    setBusy(true)
    setStatus('Analizando archivo...')
    setItems([])
    setPreview('')
    setSourceName(file.name)

    try {
      let extracted = []
      const lowerType = file.type.toLowerCase()
      const lowerName = file.name.toLowerCase()

      if (lowerType === 'application/pdf' || lowerName.endsWith('.pdf')) {
        extracted = await renderPdfPagesToImages(file)
        setStatus(`PDF procesado. Se generaron ${extracted.length} imágenes, una por página renderizada.`)
      } else if (isOfficeDocument(lowerName)) {
        extracted = await extractOfficeImages(file)
        setStatus(extracted.length ? `Se extrajeron ${extracted.length} imágenes embebidas desde ${file.name}.` : 'No se encontraron imágenes embebidas en el archivo Office.')
      } else if (lowerType.startsWith('image/')) {
        extracted = await segmentImageFile(file)
        setStatus(extracted.length > 1 ? `Se separaron ${extracted.length} segmentos desde la imagen.` : 'No se detectaron varios segmentos, se mantuvo como imagen única.')
      } else {
        setStatus('Formato no soportado. Usa PDF, DOCX, PPTX, XLSX o una imagen.')
      }

      setItems(extracted)
      setPreview(extracted[0]?.dataUrl || '')
    } catch (error) {
      setStatus(`No fue posible procesar el archivo: ${error.message}`)
      setItems([])
      setPreview('')
    } finally {
      setBusy(false)
      resetInput()
    }
  }

  const onChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    await processFile(file)
  }

  const exportOne = (item) => {
    triggerDownload(item.blob, item.filename)
  }

  const exportAll = async () => {
    if (!items.length) return
    const zip = new JSZip()
    items.forEach((item) => {
      zip.file(item.filename, item.blob)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    triggerDownload(blob, 'imagenes-extraidas.zip')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <img
              src="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/2c0c2b2a-9a9d-4f44-8e3d-73b5eb02d274/d5kcb27-9b5079b4-2d99-44d2-9c75-334c0945c2dc.png/v1/fill/w_400,h_623/20121106_edward_scissorhands_by_amoykid_d5kcb27-fullview.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiIvZi8yYzBjMmIyYS05YTlkLTRmNDQtOGUzZC03M2I1ZWIwMmQyNzQvZDVrY2IyNy05YjUwNzliNC0yZDk5LTQ0ZDItOWM3NS0zMzRjMDk0NWMyZGMucG5nIiwiaGVpZ2h0IjoiPD02MjMiLCJ3aWR0aCI6Ijw9NDAwIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLndhdGVybWFyayJdLCJ3bWsiOnsicGF0aCI6Ii93bS8yYzBjMmIyYS05YTlkLTRmNDQtOGUzZC03M2I1ZWIwMmQyNzQvYW1veWtpZC00LnBuZyIsIm9wYWNpdHkiOjk1LCJwcm9wb3J0aW9ucyI6MC40NSwiZ3Jhdml0eSI6ImNlbnRlciJ9fQ.WuSJ_cw8dEWQGW10RohbK34WoIpCKXync5mBrpjH91Y"
              alt="Edward Scissorhands"
              className="brand-face"
            />
          </div>
          <div>
            <h1>EDWARD</h1>
            <p>¿Achivo de imágenes con varias imágenes? EDWARD las cortará por tí.</p>
          </div>
        </div>

        <label className="upload-card">
          <span className="eyebrow">Entrada</span>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            accept="image/*,.pdf,.docx,.pptx,.xlsx"
            onChange={onChange}
          />
          <span className="file-trigger">Seleccionar archivo</span>
          <span className="file-name">{sourceName || 'PDF, DOCX, PPTX, XLSX o imagen'}</span>
          {/* <small>En imágenes se detectan y separan regiones visuales; en Office se extraen imágenes reales embebidas.</small> */}
        </label>

        <section className="info-card">
          <span className="eyebrow">Estado</span>
          <p>{status}</p>
        </section>

        <section className="info-card">
          <span className="eyebrow">Resultado</span>
          <p>{summary}</p>
          <div className="button-stack">
            <button className="primary-btn" type="button" onClick={exportAll} disabled={!items.length || busy}>
              Exportar ZIP
            </button>
          </div>
        </section>

        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
          aria-label="Cambiar tema"
        >
          {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
        </button>
      </aside>

      <main className="main-panel">
        <section className="panel preview-panel">
          <div className="panel-head">
            <div>
              <h2>Vista previa del origen extraído</h2>
              <p>{sourceName || 'Todavía no hay un archivo cargado'}</p>
            </div>
          </div>
          <div className="preview-stage">
            {preview ? (
              <div className="preview-wrap">
                <img src={preview} alt="Primera imagen extraída" />
              </div>
            ) : (
              <div className="empty-state">La primera imagen extraída aparecerá aquí.</div>
            )}
          </div>
        </section>

        <section className="panel results-panel">
          <div className="panel-head">
            <div>
              <h2>Imágenes separadas</h2>
              <p>Cada elemento corresponde a una imagen extraída del archivo y puede guardarse por separado.</p>
            </div>
          </div>

          <div className="results-grid">
            {items.map((item) => (
              <article key={item.id} className="result-card">
                <img src={item.dataUrl} alt={item.label} loading="lazy" />
                <div className="result-body">
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.source}</p>
                    <p>{bytesToSize(item.size)}</p>
                  </div>
                  <button className="secondary-btn" type="button" onClick={() => exportOne(item)}>
                    Guardar archivo
                  </button>
                </div>
              </article>
            ))}
            {!items.length && <div className="empty-state wide">Cuando se extraigan imágenes del archivo, aparecerán aquí como archivos separados.</div>}
          </div>
        </section>
      </main>
    </div>
  )
}