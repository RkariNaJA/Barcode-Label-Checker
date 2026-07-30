export default function FilterBar({ filters, setFilters, options, onDownloadXlsx, onDownloadCsv }){
  const set = patch => setFilters(f => ({...f, ...patch}));
  return (
    <div id="toolbar">
      <input type="search" placeholder="Filter SKU…" aria-label="Filter by SKU"
        value={filters.sku} onChange={e => set({sku: e.target.value})} />
      <FilterSelect label="Orli" values={options.orli} value={filters.orli} onChange={v => set({orli: v})} />
      <FilterSelect label="Size" values={options.size} value={filters.size} onChange={v => set({size: v})} />
      <FilterSelect label="PO" values={options.po} value={filters.po} onChange={v => set({po: v})} />
      <label className="toggle">
        <input type="checkbox" checked={filters.onlyProblems}
          onChange={e => set({onlyProblems: e.target.checked, onlyMatches: false})} /> Show only problems
      </label>
      <label className="toggle">
        <input type="checkbox" checked={filters.onlyMatches}
          onChange={e => set({onlyMatches: e.target.checked, onlyProblems: false})} /> Show only matches
      </label>
      <span className="grow"></span>
      <button className="action primary" type="button" onClick={onDownloadXlsx}>Download .xlsx</button>
      <button className="action" type="button" onClick={onDownloadCsv}>Download .csv</button>
    </div>
  );
}

function FilterSelect({ label, values, value, onChange }){
  return (
    <select aria-label={`Filter by ${label}`} value={values.includes(value) ? value : ""}
      onChange={e => onChange(e.target.value)}>
      <option value="">{label}: all</option>
      {values.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}
