import * as XLSX from "xlsx";
import { norm, normCmp, digitsOnly, numKey } from "./utils.js";

/* ================= Excel parsing ================= */
export function parseExcel(tpl, arrayBuffer, sourceName){
  const wb = XLSX.read(arrayBuffer, {type:"array"});
  const parsed = [];
  for (const name of wb.SheetNames){
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:""});
    const sheet = tryParseSheet(tpl, rows, name, sourceName);
    if (sheet) parsed.push(sheet);
  }
  if (!parsed.length){
    const need = tpl.excelRequire.join(" + ");
    throw new Error(`No sheet with the expected ${tpl.name} headers (${need} columns) was found in "${sourceName}".`);
  }
  return parsed;
}

function tryParseSheet(tpl, rows, sheetName, sourceName){
  let headerIdx = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++){
    const cells = rows[i].map(c => normCmp(c));
    const c = {};
    for (const [key, re] of Object.entries(tpl.excelMap)){
      c[key] = cells.findIndex(x => x && re.test(x));
    }
    if (tpl.excelRequire.every(k => c[k] >= 0)){ headerIdx = i; cols = c; break; }
  }
  if (headerIdx < 0) return null;

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++){
    const row = rows[i];
    const get = k => cols[k] !== undefined && cols[k] >= 0 ? norm(row[cols[k]]) : "";
    const item = {rowNum: i + 1, sheet: sheetName, source: sourceName};
    for (const key of Object.keys(tpl.excelMap)) item[key] = get(key);
    if (item.size) item.size = normCmp(item.size);
    if (!norm(item[tpl.keyField]) && !digitsOnly(item.ean)) continue;   // blank row
    items.push(item);
  }
  if (!items.length) return null;
  return {sheet: sheetName, source: sourceName, items};
}

/* Every Excel file contributes rows. Within each file, prefer the sheet(s)
   whose PO matches the POs seen in the PDF labels — UCC workbooks carry old
   POs on extra sheets; without a PO match the file's first sheet is used. */
export function selectSheets(parsedSheets, labels){
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
