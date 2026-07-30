/* ================= Helpers ================= */
export const norm = s => String(s ?? "").replace(/\s+/g, " ").trim();
export const normCmp = s => norm(s).toUpperCase();
export const digitsOnly = s => String(s ?? "").replace(/\D/g, "");

/* leading-zero-insensitive number-ish compare: "00048" == "48" */
export const numKey = s => (digitsOnly(s).replace(/^0+(?=\d)/, "") || "");

export function fieldsEqual(key, a, b){
  if (key === "ean" || key === "code128") return digitsOnly(a) === digitsOnly(b) && digitsOnly(a) !== "";
  if (key === "qtyBox" || key === "po" || key === "parcel") return numKey(a) === numKey(b) && numKey(a) !== "";
  return normCmp(a) === normCmp(b);
}

/* match key of a record (label or excel row) */
export function keyOf(tpl, rec){
  if (tpl.keyField === "parcel") return numKey(rec.po) + "-" + numKey(rec.parcel);
  return normCmp(rec[tpl.keyField]);
}
export const keyDisplay = (tpl, rec) => norm(rec[tpl.keyField]);
