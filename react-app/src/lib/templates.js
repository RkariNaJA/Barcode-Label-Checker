import { norm, digitsOnly } from "./utils.js";

const SIZES = new Set(["XS","S","M","L","XL","XXL","3XL","XXXL","4XL","2XS","OSFA","TU","UNI"]);

/* ================= BABOLAT hang-tag parser =================
   Labels flow as text blocks separated by a ref line like
   "NW00000_R00_K00 WE000000". Most PDFs put the ref line at the END of each
   label's block, but some (e.g. revised drafts) put it at the START — both
   layouts are handled below. */
function parseBabolatPdf(pages, sourceName, extraSizes){
  const lines = pages.flat();
  const refRe = /^[A-Z]{1,4}\d+_[A-Z0-9]+_[A-Z0-9]+\s+WE\d+$/i;
  /* Recognize the built-in sizes plus whatever sizes appear in the Excel being
     compared, so a new size (e.g. "XO") never has to be hardcoded here. */
  const sizeSet = extraSizes && extraSizes.size ? new Set([...SIZES, ...extraSizes]) : SIZES;
  const labels = [];
  const emit = (block, ref) => {
    const lab = parseBabolatBlock(block, ref, sourceName, sizeSet);
    if (lab) labels.push(lab);
  };
  /* A ref line closes the block that accumulated before it (trailing-ref
     layout). If the block is empty when a ref line appears, the ref instead
     leads its own block (leading-ref layout) and is closed by the next ref
     line or the end of the document. */
  let block = [];
  let pendingRef = null;
  for (const line of lines){
    if (refRe.test(line)){
      if (pendingRef !== null){        // leading-ref: block belongs to the previous ref
        emit(block, pendingRef);
        block = [];
        pendingRef = line;
      } else if (block.length){        // trailing-ref: block belongs to this ref
        emit(block, line);
        block = [];
      } else {                          // empty block before a ref → leading-ref layout
        pendingRef = line;
      }
    } else {
      block.push(line);
    }
  }
  if (pendingRef !== null) emit(block, pendingRef);   // final leading-ref block
  return labels;
}

function parseBabolatBlock(blockLines, refLine, sourceName, sizeSet = SIZES){
  const joined = blockLines.join("\n");
  const lab = {source: sourceName, ref: refLine, position:"",
    sku:"", designation:"", orli:"", color:"", size:"",
    ean:"", madeIn:"", shipDate:"", po:"", under:""};
  const consumed = new Set();

  blockLines.forEach((line, i) => {
    if (!lab.ean && /^[\d ]+$/.test(line) && digitsOnly(line).length === 13 && i > 0){
      lab.ean = digitsOnly(line); consumed.add(i); return;
    }
    if (!lab.sku && /^\d{6}$/.test(line)){ lab.sku = line; consumed.add(i); return; }
    if (!lab.position && /^[A-Z]{1,2}\d{1,3}$/.test(line)){ lab.position = line; consumed.add(i); return; }
  });

  const madeM = joined.replace(/\n/g, " ").match(/Made in\s+([A-Za-z .]+?)\s+(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})\s+(Under\s+.+?Specifications?)\s*(\d*)/i);
  if (madeM){
    lab.madeIn = "Made in " + norm(madeM[1]);
    lab.shipDate = norm(madeM[2]);
    lab.under = norm(madeM[3]);
    lab.po = madeM[4] || "";
    blockLines.forEach((line, i) => {
      if (/Made in|Under\s|Specifications/i.test(line)) consumed.add(i);
    });
  }
  if (!lab.po){
    const poM = joined.match(/Specifications?\s*(\d{4,10})/i);
    if (poM) lab.po = poM[1];
  }

  blockLines.forEach((line, i) => {
    if (consumed.has(i) || lab.color) return;
    const m = line.match(/^(\d{3,5}\s+.+?)\s+(\S+)$/);
    if (m && sizeSet.has(m[2].toUpperCase())){
      lab.color = norm(m[1]); lab.size = m[2].toUpperCase(); consumed.add(i);
    }
  });

  /* Fallback: the last token wasn't a recognized size (a size printed on the
     label that isn't in the Excel). Still split the color-code line so the size
     lands in its own field instead of corrupting color + designation — any true
     size mismatch then surfaces normally in the comparison. */
  if (!lab.color){
    blockLines.forEach((line, i) => {
      if (consumed.has(i) || lab.color) return;
      const m = line.match(/^(\d{3,5}\s+.+?)\s+(\S+)$/);
      if (m){ lab.color = norm(m[1]); lab.size = m[2].toUpperCase(); consumed.add(i); }
    });
  }

  blockLines.forEach((line, i) => {
    if (consumed.has(i) || lab.orli) return;
    if (/^[A-Z0-9]{5,12}$/i.test(line) && /\d/.test(line) && /[A-Z]/i.test(line)){
      lab.orli = line; consumed.add(i);
    }
  });

  lab.designation = norm(blockLines.filter((_, i) => !consumed.has(i)).join(" "));
  if (!lab.ean && !lab.sku) return null;
  return lab;
}

/* ================= UCC carton-label parser =================
   One label per page. The 24-digit 128C code encodes
   PO(7) + Parcel(6) + SKU(6) + Qty/Box(5). The EAN-13 is printed as
   vertical single digits whose draw order may rotate the leading digit,
   so candidates are validated with the EAN-13 checksum. */
function validEan13(d){
  if (!/^\d{13}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += (+d[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === +d[12];
}

function eanFromLooseDigits(digits){
  for (let start = 0; start + 13 <= digits.length; start++){
    const w = digits.slice(start, start + 13).join("");
    const candidates = [w[12] + w.slice(0, 12), w, w.slice(1) + w[0],
      w.split("").reverse().join("")];
    for (const c of candidates) if (validEan13(c)) return c;
  }
  return "";
}

function parseUccPdf(pages, sourceName, extraSizes){
  /* Recognize the built-in sizes plus whatever sizes appear in the Excel being
     compared, so a new size (e.g. "XO") isn't hardcoded here. */
  const sizeSet = extraSizes && extraSizes.size ? new Set([...SIZES, ...extraSizes]) : SIZES;
  const labels = [];
  pages.forEach((lines, idx) => {
    const lab = parseUccPage(lines, idx + 1, sourceName, sizeSet);
    if (lab) labels.push(lab);
  });
  return labels;
}

function parseUccPage(lines, pageNum, sourceName, sizeSet = SIZES){
  /* The carton label is rotated, so extracted "lines" merge unrelated
     fields. Parse the whole page text with targeted patterns instead. */
  const lab = {source: sourceName, ref: `page ${pageNum}`, position: "p." + pageNum,
    sku:"", designation:"", orli:"", color:"", size:"", ean:"",
    madeIn:"", shipDate:"", po:"", qtyBox:"", parcel:"", code128:"", supplier:""};

  let text = " " + lines.join(" ").replace(/\s+/g, " ") + " ";
  const take = re => {
    const m = text.match(re);
    if (m){ text = text.replace(re, " "); }
    return m;
  };

  const c128 = take(/\b\d{24}\b/);
  if (c128){
    lab.code128 = c128[0];
    lab.po = lab.code128.slice(0, 7);
    lab.parcel = lab.code128.slice(7, 13);
    lab.sku = lab.code128.slice(13, 19);
    lab.qtyBox = lab.code128.slice(19, 24);
  }

  text = text.replace(/\b(?:Orli code|PO n[°o]?|QTY|Parcel n[°o]?|ETD|Color|Size|SKU)\s*:/gi, " ");

  const made = take(/\bMade in\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/);
  if (made) lab.madeIn = norm(made[0]);
  const dt = take(/\b\d{1,2}\s+[A-Z][a-z]{2,8}\.?\s+\d{4}\b/);
  if (dt) lab.shipDate = norm(dt[0]);
  const sup = take(/\bHi-?Tech\b/i);
  if (sup) lab.supplier = norm(sup[0]);
  const orli = take(/\b\d[A-Z]{2}\d{4,6}[A-Z]{0,4}\b/);
  if (orli) lab.orli = orli[0];
  /* color = code + Mixed-case words ("4156 Legion Blue"); designation words
     are ALL CAPS so they don't get swallowed */
  const color = take(/\b\d{3,5}\s+[A-Z][a-z][\w\/.&-]*(?:\s+[A-Z][a-z][\w\/.&-]*){0,2}/);
  if (color) lab.color = norm(color[0]);
  /* Match against the built-in + Excel size vocabulary instead of a fixed list,
     so an unusual size lands in the Size field rather than the designation.
     Longest first so "XXL" wins over "XL"/"L"; escape any regex-special chars. */
  const sizeAlt = [...sizeSet].map(z => z.toUpperCase())
    .sort((a, b) => b.length - a.length)
    .map(z => z.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const size = sizeAlt ? take(new RegExp(`\\b(${sizeAlt})\\b`)) : null;
  if (size) lab.size = size[1].toUpperCase();

  /* EAN: printed as separate digits (order may rotate the lead digit) or a
     merged 13-digit run — always validate with the EAN-13 checksum */
  const digitStream = [];
  const restWords = [];
  for (const t of text.split(" ")){
    if (!t) continue;
    if (!lab.ean && /^\d{13}$/.test(t)){
      const e = eanFromLooseDigits(t.split(""));
      if (e){ lab.ean = e; continue; }
    }
    if (/^\d$/.test(t)){ digitStream.push(t); continue; }
    if (/^\d+$/.test(t)) continue;               // PO/parcel/SKU/qty repeats — taken from 128C
    restWords.push(t);
  }
  if (!lab.ean) lab.ean = eanFromLooseDigits(digitStream);
  lab.designation = norm(restWords.join(" "));
  if (!lab.code128 && !lab.ean) return null;     // blank / non-label page
  return lab;
}

/* ================= Customer templates =================
   Each template defines: match key, compared fields, how to parse its
   label PDF, and how to find its columns in the Excel file. */
export const TEMPLATES = {
  babolat: {
    id: "babolat", name: "BABOLAT", keyField: "sku", keyLabel: "SKU", posLabel: "Label pos.",
    fields: [
      {key:"ean", label:"EAN-13"},
      {key:"designation", label:"Designation"},
      {key:"orli", label:"Orli code"},
      {key:"color", label:"Color"},
      {key:"size", label:"Size"},
      {key:"madeIn", label:"Made in"},
      {key:"shipDate", label:"Ship date"},
      {key:"po", label:"PO number"},
      {key:"under", label:"Under spec text"},
    ],
    excelRequire: ["sku", "ean"],
    excelMap: {
      sku:/SKU/, ean:/EAN|BARCODE/, designation:/DESIGNATION/, orli:/ORLI/,
      color:/COLOR|COLOUR/, size:/^5\.|^SIZE\b|\bSIZE$/, madeIn:/MADE IN/,
      shipDate:/SHIPPING DATE|SHIP DATE/, po:/^9\.|PO\.NUMBER|PO NUMBER|PO\.\s*NUMBER/,
      under:/UNDER/,
    },
    parsePdf: parseBabolatPdf,
  },
  ucc: {
    id: "ucc", name: "UCC", keyField: "parcel", keyLabel: "Parcel", posLabel: "Page",
    fields: [
      {key:"sku", label:"SKU"},
      {key:"ean", label:"EAN-13"},
      {key:"designation", label:"Designation"},
      {key:"orli", label:"Orli code"},
      {key:"color", label:"Color"},
      {key:"size", label:"Size"},
      {key:"qtyBox", label:"Qty/Box"},
      {key:"madeIn", label:"Made in"},
      {key:"shipDate", label:"ETD"},
      {key:"po", label:"PO number"},
      {key:"code128", label:"128C code"},
      {key:"supplier", label:"Supplier"},
    ],
    excelRequire: ["parcel", "ean"],
    excelMap: {
      designation:/^1\.|DESIGNATION/, orli:/^2\.|ORLI/, color:/^3\.|COLOR|COLOUR/,
      size:/^4\.|SIZE/, madeIn:/^5\.|MADE IN/, sku:/^6\.|SKU/, ean:/^7\.|EAN|BARCODE/,
      qtyBox:/^8\.|QTY\/BOX/, shipDate:/^9\.|\bETD\b/, po:/^10\.|PO\.NUMBER/,
      parcel:/^11\.|PARCEL/, code128:/^12\.|128C/, supplier:/^13\.|SUPPLIER/,
    },
    parsePdf: parseUccPdf,
  },
};
