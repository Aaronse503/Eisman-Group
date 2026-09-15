export interface ExtractionResult {
  status: 'extracted' | 'unsupported' | 'failed' | 'skipped';
  text: string | null;
  pageCount: number | null;
  error: string | null;
  /** True when the file is an image or a scan with no embedded text layer. */
  needsOcr?: boolean;
}

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);

/**
 * Pulls text out of an uploaded file so it can be summarised and searched.
 *
 * PDFs are parsed with pdfjs-dist, which reads the embedded text layer. A
 * scanned PDF has no text layer; rather than pretending otherwise, this
 * reports `needsOcr` and the UI says the document could not be read. OCR is
 * not implemented — see INTEGRATIONS.md for where a provider would plug in.
 */
export async function extractText(
  data: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractionResult> {
  try {
    if (TEXT_TYPES.has(mimeType)) {
      return {
        status: 'extracted',
        text: data.toString('utf8').slice(0, 2_000_000),
        pageCount: null,
        error: null,
      };
    }

    if (mimeType === 'application/pdf') {
      const text = await extractPdfText(data);
      if (!text.content.trim()) {
        return {
          status: 'unsupported',
          text: null,
          pageCount: text.pages,
          error:
            'This PDF has no selectable text — it is most likely a scan. Text extraction and summarisation need OCR, which is not configured.',
          needsOcr: true,
        };
      }
      return { status: 'extracted', text: text.content, pageCount: text.pages, error: null };
    }

    if (mimeType.startsWith('image/')) {
      return {
        status: 'unsupported',
        text: null,
        pageCount: null,
        error: 'Images need OCR to be searchable, which is not configured.',
        needsOcr: true,
      };
    }

    return {
      status: 'unsupported',
      text: null,
      pageCount: null,
      error: `Text extraction is not implemented for ${mimeType || 'this file type'} (${filename}). The file is stored and downloadable, but it is not searchable or summarised.`,
    };
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      pageCount: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function extractPdfText(data: Buffer): Promise<{ content: string; pages: number }> {
  // The legacy build runs in Node without a DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) parts.push(line);
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { content: parts.join('\n\n'), pages };
}
