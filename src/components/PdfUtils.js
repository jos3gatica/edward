import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { blobToDataUrl, extensionOf, OFFICE_MEDIA_PATTERNS } from './utils.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractOfficeImages(file) {
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

export async function renderPdfPagesToImages(file, scale = 2) {
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
    images.push({
      id: `pdf-${pageNumber}`,
      index: pageNumber,
      source: 'PDF renderizado',
      label: `Página ${pageNumber}`,
      filename: `pdf-page-${pageNumber}.png`,
      size: blob.size,
      blob,
      dataUrl: canvas.toDataURL('image/png'),
    })
  }

  return images
}