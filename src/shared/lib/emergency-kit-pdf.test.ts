import { unzlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildSingleImagePdf } from './emergency-kit-pdf'

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('buildSingleImagePdf', () => {
  it('writes one A4 page whose xref offsets point at every object and whose image round-trips', () => {
    const rgb = Uint8Array.from({ length: 4 * 3 * 3 }, (_, index) => index)
    const pdf = buildSingleImagePdf(rgb, 4, 3)
    const body = text(pdf)
    expect(body.startsWith('%PDF-1.4')).toBe(true)
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(body).toContain('/MediaBox [0 0 595 842]')

    const startxref = Number(/startxref\n(\d+)/.exec(body)![1])
    const offsets = body.slice(startxref).split('\n').filter((line) => / 00000 n $/.test(line)).map((line) => Number(line.slice(0, 10)))
    expect(offsets).toHaveLength(5)
    offsets.forEach((offset, index) => expect(body.slice(offset, offset + 8)).toBe(`${index + 1} 0 obj\n`))

    const streamStart = body.indexOf('stream\n', body.indexOf('/Subtype /Image')) + 'stream\n'.length
    const length = Number(/\/Subtype \/Image[^>]*\/Length (\d+)/.exec(body)![1])
    expect(Array.from(unzlibSync(pdf.subarray(streamStart, streamStart + length)))).toEqual(Array.from(rgb))
  })

  it('rejects pixel data that does not match the declared size', () => {
    expect(() => buildSingleImagePdf(new Uint8Array(5), 4, 3)).toThrow(RangeError)
  })
})
