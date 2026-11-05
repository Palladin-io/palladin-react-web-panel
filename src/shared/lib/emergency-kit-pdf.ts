import QRCode from 'qrcode'
import { zlibSync } from 'fflate'

/**
 * identity-kdf v3 `emergencyKit`: the PDF is built in memory and handed only to
 * the user's own download. It never contains the recovery phrase, the master
 * password or any key other than the Secret Key.
 */
export interface EmergencyKitContent {
  email: string
  secretKey: string
  qrPayload: string
  signInAddress: string
  generatedOn: string
  labels: {
    title: string
    intro: string
    signInAddress: string
    account: string
    secretKey: string
    secretKeyHint: string
    scan: string
    masterPassword: string
    masterPasswordHint: string
    howTo: string
    steps: [string, string, string]
    keepPrivate: string
  }
}

const PAGE_WIDTH_PT = 595
const PAGE_HEIGHT_PT = 842
const SCALE = 2
const MARGIN = 48
const encoder = new TextEncoder()
const FONT = '"Inter", ui-sans-serif, system-ui, sans-serif'

// Canvas cannot resolve CSS variables, so the light-theme --cv-* values are mirrored here.
const PDF_PALETTE = {
  paper: '#FFFFFF',
  ink: '#0C0E12',
  muted: '#3D4E66',
  accent: '#E54645',
  rule: '#D9DEE6',
  qr: '#000000',
} as const

/**
 * The page is rasterised with the browser's own fonts so every locale renders
 * without embedding a font file; the image is stored lossless (Flate) so the
 * Secret Key and QR stay sharp in print.
 */
export async function createEmergencyKitPdf(content: EmergencyKitContent): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_WIDTH_PT * SCALE
  canvas.height = PAGE_HEIGHT_PT * SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  try {
    drawEmergencyKit(context, content)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const rgb = new Uint8Array(canvas.width * canvas.height * 3)
    for (let source = 0, target = 0; source < data.length; source += 4, target += 3) {
      rgb[target] = data[source]
      rgb[target + 1] = data[source + 1]
      rgb[target + 2] = data[source + 2]
    }
    try {
      const pdf = buildSingleImagePdf(rgb, canvas.width, canvas.height)
      return new Blob([pdf], { type: 'application/pdf' })
    } finally {
      rgb.fill(0)
      data.fill(0)
    }
  } finally {
    context.clearRect(0, 0, canvas.width, canvas.height)
    canvas.width = 0
    canvas.height = 0
  }
}

function drawEmergencyKit(context: CanvasRenderingContext2D, content: EmergencyKitContent): void {
  const { labels } = content
  const { ink, muted, accent, rule } = PDF_PALETTE
  context.scale(SCALE, SCALE)
  context.fillStyle = PDF_PALETTE.paper
  context.fillRect(0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT)
  context.textBaseline = 'top'
  const width = PAGE_WIDTH_PT - MARGIN * 2
  let y = MARGIN

  const text = (value: string, font: string, color: string, lineHeight: number, maxWidth = width, x = MARGIN) => {
    context.font = font
    context.fillStyle = color
    for (const line of wrap(context, value, maxWidth)) {
      context.fillText(line, x, y)
      y += lineHeight
    }
  }
  const divider = () => {
    context.fillStyle = rule
    context.fillRect(MARGIN, y, width, 1)
    y += 16
  }

  text('Palladin', `700 14px ${FONT}`, accent, 20)
  text(labels.title, `700 26px ${FONT}`, ink, 32)
  text(content.generatedOn, `400 11px ${FONT}`, muted, 22)
  text(labels.intro, `400 11px ${FONT}`, ink, 16)
  y += 12
  divider()

  text(labels.signInAddress, `600 10px ${FONT}`, muted, 15)
  text(content.signInAddress, `400 13px ${FONT}`, ink, 24)
  text(labels.account, `600 10px ${FONT}`, muted, 15)
  text(content.email, `400 13px ${FONT}`, ink, 24)
  divider()

  const qrSize = 150
  const qrTop = y
  const keyWidth = width - qrSize - 24
  text(labels.secretKey, `600 10px ${FONT}`, muted, 16, keyWidth)
  const groups = content.secretKey.split('-')
  const half = Math.ceil(groups.length / 2)
  text(`${groups.slice(0, half).join('-')}-`, '600 15px monospace', ink, 22, keyWidth)
  text(groups.slice(half).join('-'), '600 15px monospace', ink, 26, keyWidth)
  text(labels.secretKeyHint, `400 10px ${FONT}`, muted, 14, keyWidth)
  drawQr(context, content.qrPayload, MARGIN + width - qrSize, qrTop, qrSize)
  y = Math.max(y, qrTop + qrSize)
  context.font = `400 9px ${FONT}`
  context.fillStyle = muted
  context.fillText(labels.scan, MARGIN + width - qrSize, y + 4)
  y += 28
  divider()

  text(labels.masterPassword, `600 10px ${FONT}`, muted, 16)
  context.strokeStyle = rule
  context.lineWidth = 1
  context.strokeRect(MARGIN, y, width, 36)
  y += 44
  text(labels.masterPasswordHint, `400 10px ${FONT}`, muted, 14)
  y += 10
  divider()

  text(labels.howTo, `700 12px ${FONT}`, ink, 20)
  labels.steps.forEach((step, index) => text(`${index + 1}. ${step}`, `400 11px ${FONT}`, ink, 16))
  y += 14
  text(labels.keepPrivate, `600 11px ${FONT}`, accent, 16)
}

function drawQr(context: CanvasRenderingContext2D, payload: string, x: number, y: number, size: number): void {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' })
  const cell = size / modules.size
  context.fillStyle = PDF_PALETTE.qr
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) context.fillRect(x + column * cell, y + row * cell, cell + 0.25, cell + 0.25)
    }
  }
}

function wrap(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of value.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Minimal PDF 1.4: one A4 page showing one RGB image XObject. */
export function buildSingleImagePdf(rgb: Uint8Array, widthPx: number, heightPx: number): Uint8Array<ArrayBuffer> {
  if (rgb.length !== widthPx * heightPx * 3) throw new RangeError('Image size does not match its dimensions')
  const image = zlibSync(rgb, { level: 6 })
  const drawing = encoder.encode(`q ${PAGE_WIDTH_PT} 0 0 ${PAGE_HEIGHT_PT} 0 0 cm /Kit Do Q`)
  const objects: Uint8Array[][] = [
    [encoder.encode('<< /Type /Catalog /Pages 2 0 R >>')],
    [encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
    [encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH_PT} ${PAGE_HEIGHT_PT}] `
      + '/Resources << /XObject << /Kit 4 0 R >> >> /Contents 5 0 R >>')],
    [encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`),
    image, encoder.encode('\nendstream')],
    [encoder.encode(`<< /Length ${drawing.length} >>\nstream\n`), drawing, encoder.encode('\nendstream')],
  ]
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]
  let offset = chunks[0].length
  const offsets: number[] = []
  objects.forEach((parts, index) => {
    offsets.push(offset)
    const object = [encoder.encode(`${index + 1} 0 obj\n`), ...parts, encoder.encode('\nendobj\n')]
    chunks.push(...object)
    offset += object.reduce((total, part) => total + part.length, 0)
  })
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ',
    ...offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n `)].join('\n')
  chunks.push(encoder.encode(`${xref}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`))
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let position = 0
  for (const chunk of chunks) {
    output.set(chunk, position)
    position += chunk.length
  }
  image.fill(0)
  return output
}

/** Hands the kit to the browser's own download; the object URL is revoked immediately after. */
export function downloadEmergencyKit(pdf: Blob, fileName: string): void {
  const url = URL.createObjectURL(pdf)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
