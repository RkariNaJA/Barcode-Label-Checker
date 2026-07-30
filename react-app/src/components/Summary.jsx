export default function Summary({ results }){
  const counts = {MATCH:0, DIFF:0, "NOT IN EXCEL":0, "NOT IN PDF":0};
  results.forEach(r => counts[r.status]++);
  return (
    <div id="summary">
      <div className="stat"><b>{results.length}</b><span>Total rows</span></div>
      <div className="stat ok"><b>{counts.MATCH}</b><span>Match</span></div>
      <div className="stat bad"><b>{counts.DIFF}</b><span>Diff</span></div>
      <div className="stat warn"><b>{counts["NOT IN EXCEL"]}</b><span>Not in Excel</span></div>
      <div className="stat warn"><b>{counts["NOT IN PDF"]}</b><span>Not in PDF</span></div>
    </div>
  );
}
