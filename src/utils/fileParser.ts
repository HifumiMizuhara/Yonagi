import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source dynamically to a CDN matching the local package version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts plain text from a PDF file locally in the browser
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += `[Page ${i}]\n${pageText}\n\n`;
    }

    return fullText.trim();
  } catch (error) {
    console.error('Failed to extract PDF text:', error);
    throw new Error('PDFのテキスト解析に失敗しました。ファイルが壊れているか、保護されている可能性があります。');
  }
}

/**
 * Reads a text file and returns its content.
 * CSV/TSV files are rendered as a Markdown table so the model can read them
 * as structured data instead of a raw comma soup.
 */
export async function readFileAsText(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('テキストファイルの読み込みに失敗しました。'));
    reader.readAsText(file);
  });

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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}
