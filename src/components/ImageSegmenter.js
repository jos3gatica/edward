import { blobToDataUrl } from './utils.js'

function loadImageBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function detectBackgroundColor(ctx, width, height) {
  const points = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]
  const colors = points.map(([x, y]) => {
    const px = ctx.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data
    return [px[0], px[1], px[2]]
  })
  const sum = colors.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
    [0, 0, 0],
  )
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

export async function segmentImageFile(file) {
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