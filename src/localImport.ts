export type LocalInputFrame = {
  name: string;
  dataUrl?: string;
  text?: string;
  retries: number;
  failureReason?: string;
};

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_RENDER_EDGE = 1500;
const JPEG_QUALITY = 0.7;
const DOCX_CHUNK_CHARS = 14000;

function sourceName(file: File) {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return relative || file.name;
}

function fileExtension(file: File) {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function imageToFrame(file: File): Promise<LocalInputFrame[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_RENDER_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return [{ name: sourceName(file), dataUrl: canvasToJpeg(canvas), retries: 0 }];
  } finally {
    bitmap.close();
  }
}

let pdfWorkerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfWorkerConfigured) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

async function pdfToFrames(file: File): Promise<LocalInputFrame[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const frames: LocalInputFrame[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(1, Math.min(1.8, MAX_RENDER_EDGE / Math.max(base.width, base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Could not render PDF page ${pageNumber}.`);
    await page.render({ canvasContext: context, viewport }).promise;
    frames.push({
      name: `${sourceName(file)}#page-${String(pageNumber).padStart(3, '0')}`,
      dataUrl: canvasToJpeg(canvas),
      retries: 0,
    });
    page.cleanup();
  }
  return frames;
}

function splitDocumentText(value: string) {
  const text = value.replace(/\u0000/g, '').trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    if (current.length + paragraph.length + 2 <= DOCX_CHUNK_CHARS) {
      current += `\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  if (!chunks.length && text) chunks.push(text.slice(0, DOCX_CHUNK_CHARS));
  return chunks;
}

async function docxToFrames(file: File): Promise<LocalInputFrame[]> {
  const mammoth = await import('mammoth');
  const result = await mammoth.default.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const chunks = splitDocumentText(result.value);
  if (!chunks.length) throw new Error('Word file has no readable text. Export it as PDF if the content is mainly images.');
  return chunks.map((text, index) => ({
    name: chunks.length === 1 ? sourceName(file) : `${sourceName(file)}#text-${String(index + 1).padStart(3, '0')}`,
    text,
    retries: 0,
  }));
}

export async function prepareLocalFile(file: File): Promise<LocalInputFrame[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error('File is over 30 MB. Split or compress it first.');
  const ext = fileExtension(file);
  if (file.type.startsWith('image/')) return imageToFrame(file);
  if (file.type === 'application/pdf' || ext === '.pdf') return pdfToFrames(file);
  if (ext === '.docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return docxToFrames(file);
  if (ext === '.doc') throw new Error('Legacy .doc is not supported locally. Save it as .docx or PDF first.');
  throw new Error('Unsupported file. Use PDF, Word .docx, or an image.');
}
