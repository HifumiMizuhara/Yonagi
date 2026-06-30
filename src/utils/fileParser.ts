import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const MAX_ATTACHMENT_COUNT = 8;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 300_000;
export const MAX_PDF_PAGES = 100;

export type FileParseErrorCode =
  | 'fileTooLarge'
  | 'pdfTooManyPages'
  | 'extractedTextTooLarge'
  | 'pdfParseFailed'
  | 'textReadFailed'
  | 'imageReadFailed';

export class FileParseError extends Error {
  code: FileParseErrorCode;

  constructor(code: FileParseErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'FileParseError';
    this.code = code;
  }
}

function assertFileSize(file: File) {
  if (file.size > MAX_FILE_SIZE_BYTES) throw new FileParseError('fileTooLarge');
}

/**
 * Extracts plain text from a PDF file locally in the browser
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  assertFileSize(file);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw new FileParseError('pdfTooManyPages');
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ');
      fullText += `[Page ${i}]\n${pageText}\n\n`;
      if (fullText.length > MAX_EXTRACTED_TEXT_CHARS) {
        throw new FileParseError('extractedTextTooLarge');
      }
    }

    return fullText.trim();
  } catch (error) {
    if (error instanceof FileParseError) throw error;
    console.error('Failed to extract PDF text:', error);
    throw new FileParseError('pdfParseFailed', { cause: error });
  }
}

/**
 * Reads a text file and returns its content.
 * CSV/TSV files are rendered as a Markdown table so the model can read them
 * as structured data instead of a raw comma soup.
 */
export async function readFileAsText(file: File): Promise<string> {
  assertFileSize(file);
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new FileParseError('textReadFailed'));
    reader.readAsText(file);
  });
  if (raw.length > MAX_EXTRACTED_TEXT_CHARS) throw new FileParseError('extractedTextTooLarge');

  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    try {
      return csvToMarkdown(raw, name.endsWith('.tsv') ? '\t' : ',');
    } catch {
      return raw; // fall back to raw text on parse failure
    }
  }
  return raw;
}

/**
 * Minimal CSV/TSV → Markdown table conversion. Handles simple quoted fields.
 */
function csvToMarkdown(text: string, delimiter: string): string {
  const rows = parseDelimited(text.trim(), delimiter);
  if (rows.length === 0) return text;
  const maxPreview = 200; // cap rows so huge files don't blow up the prompt
  const header = rows[0];
  const body = rows.slice(1, maxPreview + 1);

  const escape = (c: string) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  let md = `| ${header.map(escape).join(' | ')} |\n`;
  md += `| ${header.map(() => '---').join(' | ')} |\n`;
  for (const row of body) {
    md += `| ${row.map(escape).join(' | ')} |\n`;
  }
  if (rows.length - 1 > maxPreview) {
    md += `\n_(${rows.length - 1} 行中 ${maxPreview} 行を表示)_\n`;
  }
  return md;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Reads a file as a Base64 Data URL (used for image previews and API multimodal payloads)
 */
export function readFileAsBase64(file: File): Promise<string> {
  assertFileSize(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new FileParseError('imageReadFailed'));
    reader.readAsDataURL(file);
  });
}
