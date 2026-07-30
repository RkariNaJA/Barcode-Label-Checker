export default function FileChips({ pdfFiles, excelFiles, onRemovePdf, onRemoveExcel, onClearAll }){
  const hasFiles = pdfFiles.length > 0 || excelFiles.length > 0;
  return (
    <div id="files">
      {pdfFiles.map((f, i) => (
        <Chip key={f.name + f.size} kind="pdf" name={f.name} onRemove={() => onRemovePdf(i)} />
      ))}
      {excelFiles.map((f, i) => (
        <Chip key={f.name + f.size} kind="xlsx" name={f.name} onRemove={() => onRemoveExcel(i)} />
      ))}
      {hasFiles && (
        <button type="button" id="clearAll" onClick={onClearAll}>Clear all — ล้างข้อมูล</button>
      )}
    </div>
  );
}

function Chip({ kind, name, onRemove }){
  return (
    <div className="chip">
      <span className={`kind ${kind}`}>{kind.toUpperCase()}</span>
      <span className="name" title={name}>{name}</span>
      <button type="button" title="Remove" onClick={onRemove}>✕</button>
    </div>
  );
}
