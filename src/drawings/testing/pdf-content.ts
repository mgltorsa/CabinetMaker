/**
 * Test-only helpers to look inside a generated PDF: decoded page content
 * streams and the hex form pdf-lib writes for standard-font text.
 */
import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, StandardFonts, type PDFObject } from 'pdf-lib'
import { toWinAnsi } from '../pdf-text'

function streamText(stream: PDFRawStream): string {
  const filter = stream.dict.get(PDFName.of('Filter'))
  const bytes = filter === PDFName.of('FlateDecode') ? inflateSync(stream.contents) : stream.contents
  return Buffer.from(bytes).toString('latin1')
}

/** Concatenated, decoded content streams of page `index`. */
export async function pageContent(bytes: Uint8Array, index: number): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  const page = doc.getPage(index)
  const contents: PDFObject | undefined = page.node.Contents()
  const refs: PDFObject[] = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return refs
    .map((r) => (r instanceof PDFRef ? doc.context.lookup(r) : r))
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map(streamText)
    .join('\n')
}

/** `<…>` hex string pdf-lib writes for `text` in Helvetica (after WinAnsi sanitising). */
export async function helveticaHex(text: string): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  return font.encodeText(toWinAnsi(text)).toString()
}

/** Does `content` draw `text` (case-insensitive hex match)? */
export async function drawsText(content: string, text: string): Promise<boolean> {
  return content.toUpperCase().includes((await helveticaHex(text)).toUpperCase())
}
