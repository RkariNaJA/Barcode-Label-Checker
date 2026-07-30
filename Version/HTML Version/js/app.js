"use strict";
/* ================= Customer templates =================
   Each template defines: match key, compared fields, how to parse its
   label PDF, and how to find its columns in the Excel file. */
const TEMPLATES = {
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
let TPL = null;   // selected customer template

/* ================= Helpers ================= */
const norm = s => String(s ?? "").replace(/\s+/g," ").trim();
const normCmp = s => norm(s).toUpperCase();
const digitsOnly = s => String(s ?? "").replace(/\D/g,"");
const el = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* leading-zero-insensitive number-ish compare: "00048" == "48" */
const numKey = s => (digitsOnly(s).replace(/^0+(?=\d)/,"") || "");

function fieldsEqual(key, a, b){
  if (key === "ean" || key === "code128") return digitsOnly(a) === digitsOnly(b) && digitsOnly(a) !== "";
  if (key === "qtyBox" || key === "po" || key === "parcel") return numKey(a) === numKey(b) && numKey(a) !== "";
  return normCmp(a) === normCmp(b);
}

/* match key of a record (label or excel row) */
function keyOf(rec){
  if (TPL.keyField === "parcel") return numKey(rec.po) + "-" + numKey(rec.parcel);
  return normCmp(rec[TPL.keyField]);
}
const keyDisplay = rec => norm(rec[TPL.keyField]);

/* ================= PDF text extraction (per page) ================= */
async function extractPdfPages(arrayBuffer){
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
    pages.push(text.split(/\n/).map(norm).filter(l => l !== "" && l !== "PREVIEW"));
  }
  return pages;
}

const SIZES = new Set(["XS","S","M","L","XL","XXL","3XL","XXXL","4XL","2XS","OSFA","TU","UNI"]);
const DATE_RE = /^\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}$/;

/* ================= BABOLAT hang-tag parser =================
   Labels flow as text blocks, each ending with a ref line like
   "NW00000_R00_K00 WE000000". */
function parseBabolatPdf(pages, sourceName){
  const lines = pages.flat();
  const refRe = /^[A-Z]{1,4}\d+_[A-Z0-9]+_[A-Z0-9]+\s+WE\d+$/i;
  const labels = [];
  let block = [];
  for (const line of lines){
    if (refRe.test(line)){
      const lab = parseBabolatBlock(block, line, sourceName);
      if (lab) labels.push(lab);
      block = [];
    } else {
      block.push(line);
    }
  }
  return labels;
}

function parseBabolatBlock(blockLines, refLine, sourceName){
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
    if (m && SIZES.has(m[2].toUpperCase())){
      lab.color = norm(m[1]); lab.size = m[2].toUpperCase(); consumed.add(i);
    }
  });

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

function parseUccPdf(pages, sourceName){
  const labels = [];
  pages.forEach((lines, idx) => {
    const lab = parseUccPage(lines, idx + 1, sourceName);
    if (lab) labels.push(lab);
  });
  return labels;
}

function parseUccPage(lines, pageNum, sourceName){
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
  const size = take(/\b(XXXL|XXL|XL|XS|4XL|3XL|2XS|S|M|L)\b/);
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

/* ================= Excel parsing ================= */
function parseExcel(arrayBuffer, sourceName){
  const wb = XLSX.read(arrayBuffer, {type:"array"});
  const parsed = [];
  for (const name of wb.SheetNames){
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:""});
    const sheet = tryParseSheet(rows, name, sourceName);
    if (sheet) parsed.push(sheet);
  }
  if (!parsed.length){
    const need = TPL.excelRequire.join(" + ");
    throw new Error(`No sheet with the expected ${TPL.name} headers (${need} columns) was found in "${sourceName}".`);
  }
  return parsed;
}

function tryParseSheet(rows, sheetName, sourceName){
  let headerIdx = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++){
    const cells = rows[i].map(c => normCmp(c));
    const c = {};
    for (const [key, re] of Object.entries(TPL.excelMap)){
      c[key] = cells.findIndex(x => x && re.test(x));
    }
    if (TPL.excelRequire.every(k => c[k] >= 0)){ headerIdx = i; cols = c; break; }
  }
  if (headerIdx < 0) return null;

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++){
    const row = rows[i];
    const get = k => cols[k] !== undefined && cols[k] >= 0 ? norm(row[cols[k]]) : "";
    const item = {rowNum: i + 1, sheet: sheetName, source: sourceName};
    for (const key of Object.keys(TPL.excelMap)) item[key] = get(key);
    if (item.size) item.size = normCmp(item.size);
    if (!norm(item[TPL.keyField]) && !digitsOnly(item.ean)) continue;   // blank row
    items.push(item);
  }
  if (!items.length) return null;
  return {sheet: sheetName, source: sourceName, items};
}

/* Every Excel file contributes rows. Within each file, prefer the sheet(s)
   whose PO matches the POs seen in the PDF labels — UCC workbooks carry old
   POs on extra sheets; without a PO match the file's first sheet is used. */
function selectSheets(parsedSheets, labels){
  const pdfPos = new Set(labels.map(l => numKey(l.po)).filter(Boolean));
  const byFile = new Map();
  for (const s of parsedSheets){
    if (!byFile.has(s.source)) byFile.set(s.source, []);
    byFile.get(s.source).push(s);
  }
  const selected = [];
  for (const sheets of byFile.values()){
    const matching = pdfPos.size ? sheets.filter(s => s.items.some(it => pdfPos.has(numKey(it.po)))) : [];
    selected.push(...(matching.length ? matching : [sheets[0]]));
  }
  return selected;
}

/* ================= Comparison ================= */
function compare(labels, excelItems){
  const byKey = new Map();
  excelItems.forEach(it => {
    const k = keyOf(it);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  });
  const usedExcel = new Set();
  const results = [];

  const labKeyCount = new Map();
  labels.forEach(l => labKeyCount.set(keyOf(l), (labKeyCount.get(keyOf(l)) || 0) + 1));

  for (const lab of labels){
    const k = keyOf(lab);
    const cands = byKey.get(k) || [];
    const xl = cands.find(c => !usedExcel.has(c)) || cands[0] || null;
    if (xl) usedExcel.add(xl);
    const r = {label: lab, excel: xl, diffs: [], notes: []};
    if (labKeyCount.get(k) > 1) r.notes.push(`duplicate ${TPL.keyLabel} in PDF`);
    if (!xl){
      r.status = "NOT IN EXCEL";
    } else {
      if (cands.length > 1) r.notes.push(`duplicate ${TPL.keyLabel} in Excel`);
      for (const f of TPL.fields){
        if (!fieldsEqual(f.key, lab[f.key], xl[f.key])) r.diffs.push(f.key);
      }
      r.status = r.diffs.length ? "DIFF" : "MATCH";
    }
    results.push(r);
  }
  for (const it of excelItems){
    if (!usedExcel.has(it)) results.push({label:null, excel:it, diffs:[], notes:[], status:"NOT IN PDF"});
  }
  return results;
}

/* ================= State & customer selection ================= */
const state = {pdfFiles: [], excelFiles: [], results: null, labels: [], excelItems: []};

function selectCustomer(id){
  TPL = TEMPLATES[id];
  state.pdfFiles = []; state.excelFiles = [];
  state.results = null; state.labels = []; state.excelItems = [];
  el("custScreen").hidden = true;
  el("tool").hidden = false;
  el("custBtn").hidden = false;
  el("custBtn").textContent = "Mode: " + TPL.name + " — change";
  el("msg").innerHTML = "";
  el("results").hidden = true;
  renderChips();
}

document.querySelectorAll(".custCard").forEach(btn =>
  btn.addEventListener("click", () => selectCustomer(btn.dataset.cust)));

el("custBtn").addEventListener("click", () => {
  TPL = null;
  el("tool").hidden = true;
  el("custBtn").hidden = true;
  el("custScreen").hidden = false;
});

el("themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  root.dataset.theme = dark ? "light" : "dark";
});

/* ================= File input ================= */
const drop = el("drop"), fileInput = el("fileInput");
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });
["dragover","dragenter"].forEach(ev => drop.addEventListener(ev, e => {e.preventDefault(); drop.classList.add("over");}));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => {e.preventDefault(); drop.classList.remove("over");}));
drop.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
fileInput.addEventListener("change", () => { addFiles([...fileInput.files]); fileInput.value = ""; });

function addFiles(files){
  for (const f of files){
    const n = f.name.toLowerCase();
    if (n.endsWith(".pdf")){
      if (!state.pdfFiles.some(x => x.name === f.name && x.size === f.size)) state.pdfFiles.push(f);
    } else if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")){
      if (!state.excelFiles.some(x => x.name === f.name && x.size === f.size)) state.excelFiles.push(f);
    } else {
      showMsg(`Skipped "${f.name}" — not a PDF or Excel file.`, "error");
    }
  }
  renderChips();
  runIfReady();
}

function renderChips(){
  const box = el("files");
  box.innerHTML = "";
  const mk = (kind, name, onRemove) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span class="kind ${kind}">${kind.toUpperCase()}</span><span class="name" title="${esc(name)}">${esc(name)}</span>`;
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "✕"; btn.title = "Remove";
    btn.addEventListener("click", onRemove);
    chip.appendChild(btn);
    box.appendChild(chip);
  };
  state.pdfFiles.forEach((f, i) => mk("pdf", f.name, () => { state.pdfFiles.splice(i,1); renderChips(); runIfReady(); }));
  state.excelFiles.forEach((f, i) => mk("xlsx", f.name, () => { state.excelFiles.splice(i,1); renderChips(); runIfReady(); }));
  if (state.pdfFiles.length || state.excelFiles.length){
    const clr = document.createElement("button");
    clr.type = "button"; clr.id = "clearAll"; clr.textContent = "Clear all — ล้างข้อมูล";
    clr.addEventListener("click", clearAll);
    box.appendChild(clr);
  }
}

function clearAll(){
  state.pdfFiles = []; state.excelFiles = [];
  state.results = null; state.labels = []; state.excelItems = [];
  el("msg").innerHTML = "";
  el("results").hidden = true;
  renderChips();
}

function showMsg(text, kind){
  const d = document.createElement("div");
  d.className = "note" + (kind === "error" ? " error" : "");
  d.textContent = text;
  el("msg").appendChild(d);
}

/* ================= Run ================= */
async function runIfReady(){
  el("msg").innerHTML = "";
  el("results").hidden = true;
  if (!TPL) return;
  if (!state.pdfFiles.length || !state.excelFiles.length){
    if (state.pdfFiles.length || state.excelFiles.length){
      showMsg(state.excelFiles.length ? "Now add the label PDF file(s)." : "Now add the EAN Excel file(s).");
    }
    return;
  }
  try{
    showMsg("Reading files…");
    const labels = [];
    for (const f of state.pdfFiles){
      const pages = await extractPdfPages(await f.arrayBuffer());
      const labs = TPL.parsePdf(pages, f.name);
      if (!labs.length) showMsg(`No ${TPL.name} labels could be read from "${f.name}". Is it a text-based label PDF?`, "error");
      labels.push(...labs);
    }
    const parsedSheets = [];
    const excelErrors = [];
    for (const f of state.excelFiles){
      try{
        parsedSheets.push(...parseExcel(await f.arrayBuffer(), f.name));
      } catch(err){
        excelErrors.push(err.message);
      }
    }
    if (!parsedSheets.length) throw new Error(excelErrors.join(" ") || "None of the Excel file(s) could be read.");
    const sheets = selectSheets(parsedSheets, labels);
    const excelItems = sheets.flatMap(s => s.items);
    state.labels = labels;
    state.excelItems = excelItems;
    state.results = compare(labels, excelItems);
    el("msg").innerHTML = "";
    excelErrors.forEach(m => showMsg(m, "error"));
    const sheetNames = sheets.map(s => state.excelFiles.length > 1 ? `"${s.sheet}" (${s.source})` : `"${s.sheet}"`).join(", ");
    showMsg(`${TPL.name}: read ${labels.length} label(s) from ${state.pdfFiles.length} PDF(s) and ${excelItems.length} row(s) from ${state.excelFiles.length} Excel file(s), sheet ${sheetNames}.`);
    populateFilters();
    renderResults();
  } catch(err){
    el("msg").innerHTML = "";
    showMsg("Error: " + err.message, "error");
    console.error(err);
  }
}

/* ================= Filters ================= */
el("onlyProblems").addEventListener("change", () => {
  if (el("onlyProblems").checked) el("onlyMatches").checked = false;
  renderResults();
});
el("onlyMatches").addEventListener("change", () => {
  if (el("onlyMatches").checked) el("onlyProblems").checked = false;
  renderResults();
});
el("fSku").addEventListener("input", renderResults);
el("fOrli").addEventListener("change", renderResults);
el("fSize").addEventListener("change", renderResults);
el("fPo").addEventListener("change", renderResults);

function rowVal(r, key){ return norm(r.label?.[key] || r.excel?.[key] || ""); }

function populateFilters(){
  const fill = (id, key, prefix) => {
    const sel = el(id);
    const prev = sel.value;
    const vals = [...new Set((state.results || []).map(r => rowVal(r, key)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
    sel.innerHTML = `<option value="">${prefix}: all</option>` +
      vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (vals.includes(prev)) sel.value = prev;
  };
  fill("fOrli", "orli", "Orli");
  fill("fSize", "size", "Size");
  fill("fPo", "po", "PO");
}

function applyFilters(res){
  const q = normCmp(el("fSku").value);
  const orli = el("fOrli").value;
  const size = el("fSize").value;
  const po = el("fPo").value;
  const onlyProblems = el("onlyProblems").checked;
  const onlyMatches = el("onlyMatches").checked;
  return res.filter(r =>
    (!q || normCmp(rowVal(r, "sku")).includes(q) || normCmp(keyDisplay(r.label || r.excel)).includes(q)) &&
    (!orli || rowVal(r, "orli") === orli) &&
    (!size || rowVal(r, "size") === size) &&
    (!po || rowVal(r, "po") === po) &&
    (!onlyProblems || r.status !== "MATCH") &&
    (!onlyMatches || r.status === "MATCH"));
}

/* ================= Rendering ================= */
function renderResults(){
  const res = state.results || [];
  const counts = {MATCH:0, DIFF:0, "NOT IN EXCEL":0, "NOT IN PDF":0};
  res.forEach(r => counts[r.status]++);
  el("summary").innerHTML = `
    <div class="stat"><b>${res.length}</b><span>Total rows</span></div>
    <div class="stat ok"><b>${counts.MATCH}</b><span>Match</span></div>
    <div class="stat bad"><b>${counts.DIFF}</b><span>Diff</span></div>
    <div class="stat warn"><b>${counts["NOT IN EXCEL"]}</b><span>Not in Excel</span></div>
    <div class="stat warn"><b>${counts["NOT IN PDF"]}</b><span>Not in PDF</span></div>`;

  const shown = applyFilters(res);

  let html = `<table><thead><tr><th rowspan="2" class="pair-end">${TPL.keyLabel}</th>`;
  for (const f of TPL.fields) html += `<th colspan="2" class="pair-end group">${f.label}</th>`;
  html += `<th rowspan="2">${TPL.posLabel}</th><th rowspan="2" class="statcol">Status</th><th rowspan="2">Different data</th><th rowspan="2">Notes</th><th rowspan="2">Source</th></tr><tr>`;
  TPL.fields.forEach(() => { html += `<th class="sub">PDF</th><th class="sub pair-end">Excel</th>`; });
  html += `</tr></thead><tbody>`;
  for (const r of shown){
    const cls = r.status === "MATCH" ? "st-match" : r.status === "DIFF" ? "st-mismatch" : "st-missing";
    html += `<tr class="${cls}"><td class="pair-end">${esc(keyDisplay(r.label || r.excel))}</td>`;
    for (const f of TPL.fields){
      const pv = r.label ? r.label[f.key] : null;
      const ev = r.excel ? r.excel[f.key] : null;
      const d = (r.status === "DIFF" && r.diffs.includes(f.key)) ? " diff" : "";
      html += `<td class="${d.trim()}">${pv !== null && pv !== "" ? esc(pv) : '<span class="muted">—</span>'}</td>`;
      html += `<td class="pair-end${d}">${ev !== null && ev !== "" ? esc(ev) : '<span class="muted">—</span>'}</td>`;
    }
    const diffList = r.diffs.map(k => TPL.fields.find(f => f.key === k).label).join(", ");
    html += `<td>${esc(r.label?.position || "")}</td>`;
    html += `<td class="status"><span class="pill">${r.status}</span></td>`;
    html += `<td class="difflist">${esc(diffList)}</td>`;
    html += `<td>${esc(r.notes.join("; "))}</td>`;
    html += `<td class="muted">${esc(r.label ? r.label.source : `${r.excel.source} row ${r.excel.rowNum}`)}</td></tr>`;
  }
  html += `</tbody></table>`;
  el("tableWrap").innerHTML = html;
  el("hiddenNote").textContent = res.length !== shown.length
    ? `Showing ${shown.length} of ${res.length} rows (${res.length - shown.length} hidden by filters).` : "";
  el("results").hidden = false;
}

/* ================= Export ================= */
function buildExportRows(){
  const rows = [];
  const head = [TPL.keyLabel];
  for (const f of TPL.fields){ head.push("PDF " + f.label, "Excel " + f.label); }
  head.push(TPL.posLabel, "Status", "Different data", "Notes", "PDF file", "Excel file / row");
  rows.push(head);
  for (const r of (state.results || [])){
    const row = [keyDisplay(r.label || r.excel)];
    for (const f of TPL.fields){
      row.push(r.label ? r.label[f.key] : "", r.excel ? r.excel[f.key] : "");
    }
    row.push(r.label?.position || "", r.status,
      r.diffs.map(k => TPL.fields.find(f => f.key === k).label).join(", "),
      r.notes.join("; "),
      r.label?.source || "", r.excel ? `${r.excel.source} row ${r.excel.rowNum}` : "");
    rows.push(row);
  }
  return rows;
}

function stamp(){
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

el("dlXlsx").addEventListener("click", () => {
  const ws = XLSX.utils.aoa_to_sheet(buildExportRows());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparison");
  XLSX.writeFile(wb, `${TPL.id}_compare_${stamp()}.xlsx`);
});

el("dlCsv").addEventListener("click", () => {
  const csv = buildExportRows().map(row =>
    row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${TPL.id}_compare_${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
