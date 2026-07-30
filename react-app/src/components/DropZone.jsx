import { useRef, useState } from "react";

export default function DropZone({ onFiles }){
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const browse = () => inputRef.current?.click();

  return (
    <div id="drop" role="button" tabIndex={0} aria-label="Drop files or click to browse"
      className={over ? "over" : ""}
      onClick={browse}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") browse(); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragEnter={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={e => { e.preventDefault(); setOver(false); }}
      onDrop={e => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M12 18v-6"/>
        <path d="m9 15 3 3 3-3"/>
      </svg>
      <p className="big">Drop the label PDF(s) and the EAN Excel file(s) here</p>
      <p className="hint">or click to browse — ลากไฟล์ PDF และ Excel มาวางที่นี่ (ได้หลายไฟล์ทั้ง PDF และ Excel)</p>
      <input id="fileInput" ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv"
        onChange={e => { onFiles([...e.target.files]); e.target.value = ""; }} />
    </div>
  );
}
