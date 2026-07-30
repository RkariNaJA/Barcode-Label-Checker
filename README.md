# Barcode Label Checker — PDF vs Excel — Hi-Tech Apparel

Verifies vendor barcode label proofs (PDF) against the official EAN list (Excel)
before production, replacing the manual line-by-line check. Runs entirely in the
browser — no upload; files never leave the PC.

## Main purpose

The vendor sends a PDF with one label per SKU/size; each must match its row in
the EAN Excel. A wrong EAN digit, swapped size, or wrong color code means
mislabeled goods. The tool finds those differences in seconds and exports a
report.

## Two versions

Both behave identically:

- **`react-app/`** — current version (v2.0), React 18 + Vite. New features land here first.
- **`Version/HTML Version/`** — original plain HTML/JS, kept in sync; source of the
  portable single-file `Version/compare.html`.

## User workflow

1. Open the page (run the React app or double-click `Version/compare.html`).
2. Select the customer / label template.
3. Drag & drop the label **PDF(s)** and **EAN Excel file(s)** (multiple of each is fine).
4. It compares automatically: summary counters, a side-by-side PDF-vs-Excel table
   with differing cells in red, and a per-row status (`MATCH` / `DIFF` /
   `NOT IN EXCEL` / `NOT IN PDF`).
5. Filter by SKU, Orli, Size, PO, or "only problems".
6. **Download .xlsx / .csv** for the full report (all rows, ignoring filters).

## Customer templates

Defined in `TEMPLATES` (`react-app/src/lib/templates.js`; HTML: `Version/HTML Version/js/app.js`).
Each declares the match key, compared fields, PDF parser, and Excel column map.
Adding a customer = one more entry + a select-screen card.

- **BABOLAT** (`Data BABOLAT/`) — hang-tag labels; blocks are separated by a ref line
  like `NW00000_R00_K00 WE000000` (at the bottom of each block on approved PDFs, or the
  top on some drafts — both handled). Matched by 6-digit **SKU**; verifies EAN-13,
  designation, Orli, color, size, Made in, ship date, PO, spec text.
- **UCC** (`Data UCC/`) — one carton label per page. Matched by **Parcel** from the
  24-digit 128C barcode (`PO(7)+Parcel(6)+SKU(6)+Qty/Box(5)`); verifies SKU, EAN-13
  (loose digits, checksum-validated), designation, Orli, color, size, Qty/Box,
  Made in, ETD, PO, 128C, supplier. Right sheet auto-picked by PO.

Duplicate match keys are flagged in **Notes**. PDFs must be text-based (not scans);
the Excel header row and sheet are found automatically.

## Project structure

```
Compare PDF Barcode and EXCEL/
├── react-app/     current React version (see below)
├── Version/       original HTML version + portable single file
├── Data BABOLAT/  BABOLAT samples (→ 20 MATCH)
├── Data UCC/      UCC samples (→ 268/268 MATCH)
└── README.md
```

`react-app/` — `src/lib/` holds pure logic, `src/components/` the UI:

```
react-app/src/
├── main.jsx        boots React, mounts <App>
├── App.jsx         hub: state, dropped files, auto re-run of compare
├── style.css       styling (light + dark)
├── lib/
│   ├── templates.js  TEMPLATES registry + PDF parsers
│   ├── pdf.js        PDF → text (pdf.js)
│   ├── excel.js      Excel → rows (SheetJS); finds header + sheet
│   ├── compare.js    matching engine → MATCH / DIFF / NOT IN…
│   ├── export.js     .xlsx / .csv download
│   └── utils.js      text cleanup, field-equality rules, match key
└── components/     CustomerSelect, DropZone, FileChips, Summary, FilterBar, ResultsTable
```

```
Version/
├── compare.html    THE FILE TO SHARE — self-contained, offline, no install
└── HTML Version/   editable source: index.html, css/, js/app.js, js/lib/*,
                    scripts/build_single_file.py
```

## Running & building

```
cd react-app
npm install            # first time
npm run dev            # dev server
npm run build          # → dist/ (static files)
npm run build:single   # → dist-single/ (one HTML file)
```

HTML version: open `Version/compare.html`, or edit `HTML Version/` and rebuild,
then copy `HTML Version/compare.html` up to `Version/compare.html`:

```
cd "Version/HTML Version"
python scripts/build_single_file.py   # regenerates compare.html
```

## Testing

- `Data BABOLAT/` — 3 PDFs vs matching Excel → **20 MATCH**; extra Excel rows show **NOT IN PDF**.
- `Data UCC/` — 3 PDFs + Excel → **268/268 MATCH**.

## Changelog

### 2026-07-22 — ⚠️ IMPORTANT: BABOLAT ref line at top or bottom (bug fix)

**Symptom:** Dropping a BABOLAT PDF whose ref line sits at the **top** of each label
(e.g. a rev1 draft `Data Error/SAMPLE-draft rev1.pdf`) read
**0 labels** — "No BABOLAT labels could be read." A file with only one label was *not*
the cause; the problem was purely the position of the ref line.

**Cause:** `parseBabolatPdf` treated the ref line (`NW00000_R00_K00 WE000000`) only as
the **end** of a label block. Approved PDFs put it at the bottom, so the data was
already collected when the ref line appeared. This draft put the ref line **first**, so
the parser discarded an empty block and then never flushed the real data that followed.

**Fix:** The parser now detects both layouts — a ref line closes the block before it
(trailing-ref), or, if that block is empty, leads its own block closed by the next ref
line or end of document (leading-ref). Also strips the `PREVIEW` watermark when a draft
renders it as separate vertical letters (`P R E V I E W`), which otherwise leaked into
the Designation.

Verified: the rev1 file now reads its label correctly (SKU `000001`, EAN `1000000000017`,
`0000 Sample Color`, size `L`, PO `0100001`); `Data BABOLAT/` still reads all labels
with no regression; `npm run build` passes.

Changed: `react-app/src/lib/templates.js` (`parseBabolatPdf`), `react-app/src/lib/pdf.js`
(`extractPdfPages` + new `stripWatermark`). The HTML version (`Version/HTML Version/js/app.js`,
`js/lib/pdf.js`) still uses the old logic and needs the same change.

### 2026-07-14 — Sizes learned from the Excel, both modes (bug fix)

A label whose size wasn't on a hardcoded list (e.g. `XO`) showed a false mismatch
even though the PDF and Excel data were identical. In **BABOLAT** the unlisted size
broke the "color + size" split, emptying Color/Size and folding both into
Designation (3 wrong columns); in **UCC** the size was left empty and leaked into
Designation.

Both parsers now recognize any size present in the compared Excel (plus the built-in
list), so new sizes work with no code change. BABOLAT also has a structural fallback
for a size in no Excel row. Real mismatches are still detected — the Excel only tells
the parser which token is the size, not what it must equal.

**How it works:**

1. Read the **Excel first** and collect every size value in it (e.g. `S, M, L, XL, XXL, XS, XO`).
2. Known sizes = **built-in list + Excel sizes** (merged into one set; the hardcoded
   list stays only as a baseline).
3. Read the **PDF**, using that known-sizes set only to *locate* the size token on each label.
4. **Compare** PDF vs Excel field by field → MATCH / DIFF.

Recognizing a size never fakes a match: steps 3 and 4 are separate. Step 3 finds
*where* the size is; step 4 still checks the real values, so a label with a genuinely
wrong size is still flagged as DIFF.

Verified: BABOLAT `0100000` XO row `DIFF`→`MATCH`, 8 PO-matched pairs clean; UCC still
`268/268 MATCH` with a synthetic `XO` label now parsed correctly.

Changed: `react-app/src/App.jsx`, `react-app/src/lib/templates.js` (both `parseBabolat*`
and `parseUcc*`). The HTML version (`Version/HTML Version/js/app.js`) still uses the
old hardcoded lists and needs the same change.
