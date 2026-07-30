import { fieldsEqual, keyOf } from "./utils.js";

/* ================= Comparison ================= */
export function compare(tpl, labels, excelItems){
  const byKey = new Map();
  excelItems.forEach(it => {
    const k = keyOf(tpl, it);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  });
  const usedExcel = new Set();
  const results = [];

  const labKeyCount = new Map();
  labels.forEach(l => labKeyCount.set(keyOf(tpl, l), (labKeyCount.get(keyOf(tpl, l)) || 0) + 1));

  for (const lab of labels){
    const k = keyOf(tpl, lab);
    const cands = byKey.get(k) || [];
    const xl = cands.find(c => !usedExcel.has(c)) || cands[0] || null;
    if (xl) usedExcel.add(xl);
    const r = {label: lab, excel: xl, diffs: [], notes: []};
    if (labKeyCount.get(k) > 1) r.notes.push(`duplicate ${tpl.keyLabel} in PDF`);
    if (!xl){
      r.status = "NOT IN EXCEL";
    } else {
      if (cands.length > 1) r.notes.push(`duplicate ${tpl.keyLabel} in Excel`);
      for (const f of tpl.fields){
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
