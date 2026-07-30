import { useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATES } from "./lib/templates.js";
import { extractPdfPages } from "./lib/pdf.js";
import { parseExcel, selectSheets } from "./lib/excel.js";
import { compare } from "./lib/compare.js";
import { downloadXlsx, downloadCsv } from "./lib/export.js";
import { norm, normCmp, keyDisplay } from "./lib/utils.js";
import CustomerSelect from "./components/CustomerSelect.jsx";
import DropZone from "./components/DropZone.jsx";
import FileChips from "./components/FileChips.jsx";
import Summary from "./components/Summary.jsx";
import FilterBar from "./components/FilterBar.jsx";
import ResultsTable from "./components/ResultsTable.jsx";

const EMPTY_FILTERS = {sku:"", orli:"", size:"", po:"", onlyProblems:false, onlyMatches:false};

export default function App(){
  const [custId, setCustId] = useState(null);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [excelFiles, setExcelFiles] = useState([]);
  const [messages, setMessages] = useState([]);   // {text, kind}
  const [results, setResults] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const runId = useRef(0);
  const tpl = custId ? TEMPLATES[custId] : null;

  const addMsg = (text, kind) => setMessages(m => [...m, {text, kind}]);

  function selectCustomer(id){
    setCustId(id);
    setPdfFiles([]); setExcelFiles([]);
    setResults(null); setMessages([]);
    setFilters(EMPTY_FILTERS);
  }

  function backToCustomers(){
    setCustId(null);
  }

  function clearAll(){
    runId.current++;   // cancel any in-flight run
    setPdfFiles([]); setExcelFiles([]);
    setResults(null); setMessages([]);
    setFilters(EMPTY_FILTERS);
  }

  function toggleTheme(){
    const root = document.documentElement;
    const dark = (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    root.dataset.theme = dark ? "light" : "dark";
  }

  function addFiles(files){
    for (const f of files){
      const n = f.name.toLowerCase();
      if (n.endsWith(".pdf")){
        setPdfFiles(prev => prev.some(x => x.name === f.name && x.size === f.size) ? prev : [...prev, f]);
      } else if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")){
        setExcelFiles(prev => prev.some(x => x.name === f.name && x.size === f.size) ? prev : [...prev, f]);
      } else {
        addMsg(`Skipped "${f.name}" — not a PDF or Excel file.`, "error");
      }
    }
  }

  /* auto-run whenever the file set changes */
  useEffect(() => {
    if (!tpl) return;
    const id = ++runId.current;
    setResults(null);
    setMessages(m => m.filter(x => x.kind === "error" && x.text.startsWith("Skipped")));
    if (!pdfFiles.length || !excelFiles.length){
      if (pdfFiles.length || excelFiles.length){
        addMsg(excelFiles.length ? "Now add the label PDF file(s)." : "Now add the EAN Excel file(s).");
      }
      return;
    }
    (async () => {
      const msgs = [];
      try{
        addMsg("Reading files…");
        const parsedSheets = [];
        for (const f of excelFiles){
          try{
            parsedSheets.push(...parseExcel(tpl, await f.arrayBuffer(), f.name));
          } catch(err){
            msgs.push({text: err.message, kind:"error"});
          }
        }
        if (!parsedSheets.length) throw new Error("None of the Excel file(s) could be read.");
        /* Sizes present in the Excel define the valid size vocabulary, so the
           PDF parser recognizes any real size (e.g. "XO") without a hardcoded
           list. Genuine size mismatches are still caught in compare(). */
        const excelSizes = new Set(parsedSheets.flatMap(s => s.items).map(it => it.size).filter(Boolean));
        const labels = [];
        for (const f of pdfFiles){
          const pages = await extractPdfPages(await f.arrayBuffer());
          const labs = tpl.parsePdf(pages, f.name, excelSizes);
          if (!labs.length) msgs.push({text:`No ${tpl.name} labels could be read from "${f.name}". Is it a text-based label PDF?`, kind:"error"});
          labels.push(...labs);
        }
        const sheets = selectSheets(parsedSheets, labels);
        const excelItems = sheets.flatMap(s => s.items);
        if (id !== runId.current) return;      // superseded by a newer run
        const sheetNames = sheets.map(s => excelFiles.length > 1 ? `"${s.sheet}" (${s.source})` : `"${s.sheet}"`).join(", ");
        msgs.push({text:`${tpl.name}: read ${labels.length} label(s) from ${pdfFiles.length} PDF(s) and ${excelItems.length} row(s) from ${excelFiles.length} Excel file(s), sheet ${sheetNames}.`});
        setMessages(msgs);
        setResults(compare(tpl, labels, excelItems));
      } catch(err){
        if (id !== runId.current) return;
        setMessages([...msgs, {text:"Error: " + err.message, kind:"error"}]);
        console.error(err);
      }
    })();
  }, [tpl, pdfFiles, excelFiles]);

  /* filter options from the full result set */
  const rowVal = (r, key) => norm(r.label?.[key] || r.excel?.[key] || "");
  const options = useMemo(() => {
    const distinct = key => [...new Set((results || []).map(r => rowVal(r, key)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
    return {orli: distinct("orli"), size: distinct("size"), po: distinct("po")};
  }, [results]);

  const shown = useMemo(() => {
    if (!results || !tpl) return [];
    const q = normCmp(filters.sku);
    const orli = options.orli.includes(filters.orli) ? filters.orli : "";
    const size = options.size.includes(filters.size) ? filters.size : "";
    const po = options.po.includes(filters.po) ? filters.po : "";
    return results.filter(r =>
      (!q || normCmp(rowVal(r, "sku")).includes(q) || normCmp(keyDisplay(tpl, r.label || r.excel)).includes(q)) &&
      (!orli || rowVal(r, "orli") === orli) &&
      (!size || rowVal(r, "size") === size) &&
      (!po || rowVal(r, "po") === po) &&
      (!filters.onlyProblems || r.status !== "MATCH") &&
      (!filters.onlyMatches || r.status === "MATCH"));
  }, [results, tpl, filters, options]);

  return (
    <main>
      <header>
        <div className="brand">
          <div className="mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <h1>Barcode Label Checker
            <small>Compare vendor label PDF against EAN Excel — ตรวจสอบป้ายบาร์โค้ดกับไฟล์ Excel</small>
          </h1>
        </div>
        <div className="headBtns">
          {tpl && <button id="custBtn" type="button" onClick={backToCustomers}>Mode: {tpl.name} — change</button>}
          <button id="themeBtn" type="button" onClick={toggleTheme}>Dark / Light</button>
        </div>
      </header>

      {!tpl && <CustomerSelect onSelect={selectCustomer} />}

      {tpl && (
        <section id="tool">
          <DropZone onFiles={addFiles} />
          <FileChips pdfFiles={pdfFiles} excelFiles={excelFiles}
            onRemovePdf={i => setPdfFiles(prev => prev.filter((_, j) => j !== i))}
            onRemoveExcel={i => setExcelFiles(prev => prev.filter((_, j) => j !== i))}
            onClearAll={clearAll} />
          <div id="msg">
            {messages.map((m, i) => (
              <div key={i} className={"note" + (m.kind === "error" ? " error" : "")}>{m.text}</div>
            ))}
          </div>

          {results && (
            <section id="results">
              <Summary results={results} />
              <FilterBar filters={filters} setFilters={setFilters} options={options}
                onDownloadXlsx={() => downloadXlsx(tpl, results)}
                onDownloadCsv={() => downloadCsv(tpl, results)} />
              <ResultsTable tpl={tpl} rows={shown} />
              <p id="hiddenNote">{results.length !== shown.length
                ? `Showing ${shown.length} of ${results.length} rows (${results.length - shown.length} hidden by filters).` : ""}</p>
            </section>
          )}
        </section>
      )}

      <footer>
        <span>Runs entirely in your browser — no files are uploaded anywhere.</span>
        <span>Barcode Label Checker v2.0</span>
      </footer>
    </main>
  );
}
