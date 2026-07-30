import * as XLSX from "xlsx";
import { keyDisplay } from "./utils.js";

/* ================= Export ================= */
function buildExportRows(tpl, results){
  const rows = [];
  const head = [tpl.keyLabel];
  for (const f of tpl.fields){ head.push("PDF " + f.label, "Excel " + f.label); }
  head.push(tpl.posLabel, "Status", "Different data", "Notes", "PDF file", "Excel file / row");
  rows.push(head);
  for (const r of results){
    const row = [keyDisplay(tpl, r.label || r.excel)];
    for (const f of tpl.fields){
      row.push(r.label ? r.label[f.key] : "", r.excel ? r.excel[f.key] : "");
    }
    row.push(r.label?.position || "", r.status,
      r.diffs.map(k => tpl.fields.find(f => f.key === k).label).join(", "),
      r.notes.join("; "),
      r.label?.source || "", r.excel ? `${r.excel.source} row ${r.excel.rowNum}` : "");
    rows.push(row);
  }
  return rows;
}

function stamp(){
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function downloadXlsx(tpl, results){
  const ws = XLSX.utils.aoa_to_sheet(buildExportRows(tpl, results));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparison");
  XLSX.writeFile(wb, `${tpl.id}_compare_${stamp()}.xlsx`);
}

export function downloadCsv(tpl, results){
  const csv = buildExportRows(tpl, results).map(row =>
    row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${tpl.id}_compare_${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
