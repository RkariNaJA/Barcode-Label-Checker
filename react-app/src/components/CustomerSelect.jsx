export default function CustomerSelect({ onSelect }){
  return (
    <section id="custScreen">
      <h2>Select customer — เลือก Mode ก่อนเริ่มตรวจสอบ</h2>
      <div className="custGrid">
        <button className="custCard" type="button" onClick={() => onSelect("babolat")}>
          <span className="custName">BABOLAT</span>
          <span className="custDesc">Hang-tag barcode labels (NW…WE… proof sheets)<br/>Match by <b>SKU</b> — EAN, designation, color, size, PO…</span>
        </button>
        <button className="custCard" type="button" onClick={() => onSelect("ucc")}>
          <span className="custName">UCC</span>
          <span className="custDesc">Carton / shipping labels (one label per page, 128C barcode)<br/>Match by <b>Parcel number</b> — SKU, EAN, Qty/Box, ETD…</span>
        </button>
      </div>
    </section>
  );
}
