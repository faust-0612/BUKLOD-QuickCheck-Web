import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export type LocalFrame = { name: string; dataUrl?: string; text?: string };
const MAX = 30 * 1024 * 1024;
const EDGE = 1500;
const Q = 0.7;
const sourceName = (file: File) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
const jpeg = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/jpeg', Q);
async function imageFrame(file: File) {
  const b = await createImageBitmap(file); try {
    const s = Math.min(1, EDGE / Math.max(b.width, b.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(b.width*s)); c.height = Math.max(1, Math.round(b.height*s));
    const x = c.getContext('2d'); if (!x) throw new Error('Could not prepare image.'); x.drawImage(b,0,0,c.width,c.height);
    return [{ name: sourceName(file), dataUrl: jpeg(c) }];
  } finally { b.close(); }
}
async function pdfFrames(file: File) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const out: LocalFrame[] = [];
  for (let n=1;n<=pdf.numPages;n++) { const p = await pdf.getPage(n); const base=p.getViewport({scale:1}); const s=Math.max(1,Math.min(1.8,EDGE/Math.max(base.width,base.height))); const v=p.getViewport({scale:s}); const c=document.createElement('canvas'); c.width=Math.ceil(v.width); c.height=Math.ceil(v.height); const x=c.getContext('2d'); if(!x) throw new Error(`Could not render PDF page ${n}.`); await p.render({canvasContext:x,viewport:v}).promise; out.push({name:`${sourceName(file)}#page-${String(n).padStart(3,'0')}`,dataUrl:jpeg(c)}); p.cleanup(); }
  return out;
}
async function docxFrames(file: File) { const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}); const t=r.value.replace(/\u0000/g,'').trim(); if(!t) throw new Error('Word file has no readable text.'); const out:LocalFrame[]=[]; for(let i=0;i<t.length;i+=14000) out.push({name:`${sourceName(file)}#text-${String(out.length+1).padStart(3,'0')}`,text:t.slice(i,i+14000)}); return out; }
export async function prepareLocalFile(file: File): Promise<LocalFrame[]> { if(file.size>MAX) throw new Error('File is over 30 MB.'); const n=file.name.toLowerCase(); if(file.type.startsWith('image/')) return imageFrame(file); if(file.type==='application/pdf'||n.endsWith('.pdf')) return pdfFrames(file); if(n.endsWith('.docx')) return docxFrames(file); throw new Error('Use PDF, Word .docx, or image files.'); }
