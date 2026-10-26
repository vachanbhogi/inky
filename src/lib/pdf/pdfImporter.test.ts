import { describe, expect, test } from 'bun:test'
import { extractDroppedPdfFile, hasDraggedFiles } from './pdfImporter'

describe('PDF drag-and-drop helpers', () => {
  test('extractDroppedPdfFile extracts a standard application/pdf File from dataTransfer.files', () => {
    const pdfFile = new File(['%PDF-1.4'], 'homework.pdf', { type: 'application/pdf' })
    const fakeDt = {
      files: [pdfFile],
      items: [],
      types: ['Files'],
    } as unknown as DataTransfer

    expect(hasDraggedFiles(fakeDt)).toBe(true)
    expect(extractDroppedPdfFile(fakeDt)).toBe(pdfFile)
  })

  test('extractDroppedPdfFile extracts a .pdf file even when browser reports empty MIME type', () => {
    const pdfFile = new File(['%PDF-1.4'], 'Calculus_Worksheet.PDF', { type: '' })
    const fakeDt = {
      files: [pdfFile],
      items: [],
      types: ['Files'],
    } as unknown as DataTransfer

    expect(extractDroppedPdfFile(fakeDt)).toBe(pdfFile)
  })

  test('extractDroppedPdfFile falls back to DataTransferItemList when files list is empty', () => {
    const pdfFile = new File(['%PDF-1.4'], 'midterm.pdf', { type: 'application/pdf' })
    const fakeDt = {
      files: [],
      items: [
        {
          kind: 'file',
          type: 'application/pdf',
          getAsFile: () => pdfFile,
        },
      ],
      types: ['public.file-url'],
    } as unknown as DataTransfer

    expect(hasDraggedFiles(fakeDt)).toBe(true)
    expect(extractDroppedPdfFile(fakeDt)).toBe(pdfFile)
  })

  test('hasDraggedFiles returns false for text/plain or empty drag events', () => {
    const textDt = {
      files: [],
      items: [{ kind: 'string', type: 'text/plain' }],
      types: ['text/plain'],
    } as unknown as DataTransfer

    expect(hasDraggedFiles(textDt)).toBe(false)
    expect(extractDroppedPdfFile(textDt)).toBeNull()
  })
})
