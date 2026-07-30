import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { norm } from "./utils.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/* ================= PDF text extraction (per page) ================= */
export async function extractPdfPages(arrayBuffer){
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let text = "", line = "", lastY = null, prevEnd = null;
    for (const item of tc.items){
      const x = item.transform ? item.transform[4] : null;
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line){
        text += line + "\n"; line = ""; prevEnd = null;
      }
      if (y !== null) lastY = y;
      // separate items that don't visually touch (gap or backward jump)
      if (line && x !== null && prevEnd !== null && (x - prevEnd > 1 || x - prevEnd < -1)){
        line += " ";
      }
      line += item.str;
      if (x !== null) prevEnd = x + (item.width || 0);
      if (item.hasEOL){ text += line + "\n"; line = ""; lastY = null; prevEnd = null; }
    }
    if (line) text += line + "\n";
    const lines = text.split(/\n/).map(norm).filter(l => l !== "" && l !== "PREVIEW");
    pages.push(stripWatermark(lines));
  }
  return pages;
}

/* Draft/revised label PDFs render the "PREVIEW" watermark as separate rotated
   glyphs, each landing on its own line ("P","R","E","V","I","E","W"). A single
   "PREVIEW" token is filtered above; drop the split form too so it can't leak
   into a label's designation. */
function stripWatermark(lines){
  const out = [];
  for (let i = 0; i < lines.length; i++){
    if (/^[A-Za-z]$/.test(lines[i])){
      let j = i;
      while (j < lines.length && /^[A-Za-z]$/.test(lines[j])) j++;
      if (lines.slice(i, j).join("").toUpperCase() === "PREVIEW"){ i = j - 1; continue; }
      for (let k = i; k < j; k++) out.push(lines[k]);   // real single-char lines — keep
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out;
}
