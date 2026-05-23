import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { triggerDownload } from './components/utils.js'
import { extractOfficeImages, renderPdfPagesToImages } from './components/PdfUtils.js'
import { segmentImageFile } from './components/ImageSegmenter.js'
import Header from './components/Header.jsx'
import InfoCard from './components/InfoCard.jsx'
import ResultCard from './components/ResultCard.jsx'

export default function App() {
  const [theme, setTheme] = useState('light')
  const [sourceName, setSourceName] = useState('')
  const [status, setStatus] = useState('Carga una imagen para separar sus elementos visuales, o un documento para extraer imágenes embebidas.')
  const [items, setItems] = useState([])
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const summary = useMemo(
    () => (!items.length ? 'Sin imágenes extraídas' : `${items.length} imágenes detectadas y separadas`),
    [items],
  )

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
      } else if (['.docx', '.pptx', '.xlsx'].some((ext) => lowerName.endsWith(ext))) {
        extracted = await extractOfficeImages(file)
        setStatus(
          extracted.length
            ? `Se extrajeron ${extracted.length} imágenes embebidas desde ${file.name}.`
            : 'No se encontraron imágenes embebidas en el archivo Office.',
        )
      } else if (lowerType.startsWith('image/')) {
        extracted = await segmentImageFile(file)
        setStatus(
          extracted.length > 1
            ? `Se separaron ${extracted.length} segmentos desde la imagen.`
            : 'No se detectaron varios segmentos, se mantuvo como imagen única.',
        )
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
      <Header
        theme={theme}
        sourceName={sourceName}
        onThemeToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
        onFileChange={onChange}
      />

      <main className="main-panel">
        <section className="panel preview-panel">
          <div className="panel-head">
            <div>
              <h2>Vista previa de archivo de origen</h2>
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

        <InfoCard title="Estado">
          <p>{status}</p>
        </InfoCard>

        <InfoCard title="Resultado">
          <p>{summary}</p>
          <div className="button-stack">
            <button className="primary-btn" type="button" onClick={exportAll} disabled={!items.length || busy}>
              Exportar ZIP
            </button>
          </div>
        </InfoCard>

        <section className="panel results-panel">
          <div className="panel-head">
            <div>
              <h2>Imágenes separadas</h2>
              <p>Cada elemento corresponde a una imagen extraída del archivo y puede guardarse por separado.</p>
            </div>
          </div>
          <div className="results-grid">
            {items.map((item) => (
              <ResultCard key={item.id} item={item} onSave={exportOne} />
            ))}
            {!items.length && (
              <div className="empty-state wide">
                Cuando se extraigan imágenes del archivo, aparecerán aquí como archivos separados.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}