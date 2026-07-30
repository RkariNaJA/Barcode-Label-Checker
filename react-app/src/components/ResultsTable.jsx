import { keyDisplay } from "../lib/utils.js";

const Muted = () => <span className="muted">—</span>;

export default function ResultsTable({ tpl, rows }){
  return (
    <div id="tableWrap">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="pair-end">{tpl.keyLabel}</th>
            {tpl.fields.map(f => <th key={f.key} colSpan={2} className="pair-end group">{f.label}</th>)}
            <th rowSpan={2}>{tpl.posLabel}</th>
            <th rowSpan={2} className="statcol">Status</th>
            <th rowSpan={2}>Different data</th>
            <th rowSpan={2}>Notes</th>
            <th rowSpan={2}>Source</th>
          </tr>
          <tr>
            {tpl.fields.map(f => [
              <th key={f.key + "-p"} className="sub">PDF</th>,
              <th key={f.key + "-e"} className="sub pair-end">Excel</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <Row key={i} tpl={tpl} r={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ tpl, r }){
  const cls = r.status === "MATCH" ? "st-match" : r.status === "DIFF" ? "st-mismatch" : "st-missing";
  const diffList = r.diffs.map(k => tpl.fields.find(f => f.key === k).label).join(", ");
  return (
    <tr className={cls}>
      <td className="pair-end">{keyDisplay(tpl, r.label || r.excel)}</td>
      {tpl.fields.map(f => {
        const pv = r.label ? r.label[f.key] : null;
        const ev = r.excel ? r.excel[f.key] : null;
        const d = (r.status === "DIFF" && r.diffs.includes(f.key)) ? " diff" : "";
        return [
          <td key={f.key + "-p"} className={d.trim()}>{pv !== null && pv !== "" ? pv : <Muted/>}</td>,
          <td key={f.key + "-e"} className={"pair-end" + d}>{ev !== null && ev !== "" ? ev : <Muted/>}</td>,
        ];
      })}
      <td>{r.label?.position || ""}</td>
      <td className="status"><span className="pill">{r.status}</span></td>
      <td className="difflist">{diffList}</td>
      <td>{r.notes.join("; ")}</td>
      <td className="muted">{r.label ? r.label.source : `${r.excel.source} row ${r.excel.rowNum}`}</td>
    </tr>
  );
}
