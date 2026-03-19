// ── src/components/ui.jsx (excerpt) ───────────────────────────────
// ... (inside PriceHistoryModal component)

import { useIsMobile } from "./useIsMobile"; // Ensure this hook is exported

export function PriceHistoryModal({ company, history, onClose }) {
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  if (!company) return null;

  const meaningful = history.filter(h => {
    const isInitial = !h.old_price || Number(h.old_price) === 0;
    if (isInitial) return true;
    return Number(h.change_amount) !== 0;
  });

  const now       = new Date();
  const thisMonth = meaningful.filter(h => {
    const d = new Date(h.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const monthLabel   = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const totalPages   = Math.ceil(thisMonth.length / PAGE_SIZE);
  const pagedHistory = thisMonth.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const PaginationBar = () => totalPages <= 1 ? null : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0 2px" }}>
      {/* ... same pagination buttons ... */}
    </div>
  );

  // Column widths based on screen size
  const colWidths = isMobile
    ? ["5%", "33%", "20%", "20%", "22%"]  // as before
    : ["5%", "28%", "15%", "15%", "20%", "17%"]; // desktop: extra column for "Changed By"

  return (
    <ModalShell
      title={company.name}
      subtitle="📈 Price history"
      headerRight={
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.green }}>TZS {fmt(company.price)}</div>
        </div>
      }
      onClose={onClose}
      maxWidth={isMobile ? 580 : 720} // slightly wider on desktop
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ fontSize: 12, color: C.gray400 }}>
            {thisMonth.length} update{thisMonth.length !== 1 ? "s" : ""} in {monthLabel}
            {thisMonth.length !== meaningful.length && (
              <span style={{ marginLeft: 6, color: C.gray400 }}>· {meaningful.length} total all-time</span>
            )}
          </div>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      }
    >
      {thisMonth.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: C.gray400 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          <div style={{ fontWeight: 600 }}>No price changes in {monthLabel}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {meaningful.length > 0 ? `${meaningful.length} update${meaningful.length !== 1 ? "s" : ""} exist in previous months` : "No price history recorded yet"}
          </div>
        </div>
      ) : (
        <>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: C.gray400 }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, thisMonth.length)} of {thisMonth.length}
              </div>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: colWidths[0] }} />
              <col style={{ width: colWidths[1] }} />
              <col style={{ width: colWidths[2] }} />
              <col style={{ width: colWidths[3] }} />
              <col style={{ width: colWidths[4] }} />
              {!isMobile && <col style={{ width: colWidths[5] }} />}
            </colgroup>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {["#", "Date & Time", "Old Price", "New Price", "Change", !isMobile && "Changed By"].filter(Boolean).map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      textAlign: ["Old Price", "New Price", "Change"].includes(h) ? "right" : "left",
                      color: C.gray400,
                      fontWeight: 700,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      borderBottom: `1px solid ${C.gray200}`,
                      borderTop: `1px solid ${C.gray200}`,
                      whiteSpace: "nowrap",
                      background: C.gray50,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map((h, i) => {
                const globalIdx    = (page - 1) * PAGE_SIZE + i;
                const isFirstEntry = !h.old_price || Number(h.old_price) === 0;
                const up = !isFirstEntry && h.change_amount >= 0;
                return (
                  <tr
                    key={h.id}
                    style={{ borderBottom: `1px solid ${C.gray100}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "10px 12px", color: C.gray400, fontWeight: 600 }}>{globalIdx + 1}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
                        {new Date(h.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                      <div style={{ fontSize: 11, color: C.gray400 }}>
                        {new Date(h.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: C.gray600 }}>
                      {isFirstEntry ? <span style={{ color: C.gray400 }}>—</span> : fmt(h.old_price)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.text }}>{fmt(h.new_price)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {isFirstEntry
                        ? <span style={{ fontSize: 11, color: C.gray400 }}>Initial</span>
                        : <span style={{
                            background: up ? C.greenBg : C.redBg,
                            color: up ? C.green : C.red,
                            padding: "3px 9px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}>
                            {up ? "▲" : "▼"} {Math.abs(Number(h.change_amount)).toLocaleString()}
                          </span>}
                    </td>
                    {!isMobile && (
                      <td style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>
                        {h.updated_by ? (
                          <span style={{ fontSize: 11, color: C.gray600, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 6, padding: "2px 8px" }}>
                            {h.updated_by}
                          </span>
                        ) : (
                          <span style={{ color: C.gray400 }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationBar />
        </>
      )}
    </ModalShell>
  );
}
