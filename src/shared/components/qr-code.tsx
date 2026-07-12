import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export interface QrCodeProps {
  /** The string to encode (e.g. an otpauth:// URI). */
  value: string
  /** Rendered size in px. */
  size?: number
  alt?: string
}

/**
 * Renders a QR code entirely client-side (no network) as a data-URI image.
 * Used for TOTP enrollment, where the encoded otpauth URI carries the shared
 * secret — so the image is marked `ph-no-capture` to keep it out of any
 * analytics capture, and the data URI never leaves the browser.
 */
export function QrCode({ value, size = 176, alt }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="animate-pulse rounded-lg bg-[var(--cv-card-bg)]"
      />
    )
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={alt}
      className="ph-no-capture rounded-lg bg-white p-1"
    />
  )
}
