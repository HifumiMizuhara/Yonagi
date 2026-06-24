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
 * Reads a text file and returns its content
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('テキストファイルの読み込みに失敗しました。'));
    reader.readAsText(file);
  });
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
