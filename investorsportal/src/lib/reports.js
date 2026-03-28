// ── src/lib/reports.js ── PDF & Excel report generation ────────────
// Pure functions — no React dependencies, no side effects except file download.

import { jsPDF } from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
const today = () => new Date().toISOString().split("T")[0];
const now = () => new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

function addHeader(doc, title, cdsNumber, subtitle) {
  doc.setFontSize(18);
  doc.setTextColor(0, 50, 100);
  doc.text("Investors Portal", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`CDS: ${cdsNumber || "N/A"}`, 14, 25);

  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(title, 14, 36);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 14, 42);
  }

  return subtitle ? 48 : 42;
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated ${now()} — Investors Portal`, 14, doc.internal.pageSize.height - 10);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 10, { align: "right" });
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 1. Portfolio Statement PDF ─────────────────────────────────────
export function generatePortfolioStatementPDF({ cdsNumber, portfolio, metrics, dividendSummary }) {
  const doc = new jsPDF();
  let y = addHeader(doc, "Portfolio Statement", cdsNumber, `As of ${today()}`);

  // Summary section
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const summaryData = [
    ["Total Holdings", `${metrics?.companyCount || portfolio.length} companies`],
    ["Market Value", `TZS ${fmt(metrics?.totalMarketValue || 0)}`],
    ["Cost Basis", `TZS ${fmt(metrics?.investedCapital || 0)}`],
    ["Unrealized G/L", `TZS ${fmt(metrics?.unrealizedGL || 0)}`],
  ];
  if (dividendSummary?.ytd_net > 0) {
    summaryData.push(["Dividend Income (YTD)", `TZS ${fmt(dividendSummary.ytd_net)}`]);
  }
  if (dividendSummary?.lifetime_net > 0) {
    summaryData.push(["Lifetime Dividends", `TZS ${fmt(dividendSummary.lifetime_net)}`]);
  }

  doc.autoTable({
    startY: y,
    head: [["Metric", "Value"]],
    body: summaryData,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 50, 100], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
    margin: { left: 14, right: 14 },
  });

  // Holdings table
  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(11);
  doc.text("Holdings", 14, y);
  y += 4;

  const holdingsBody = portfolio.map((co, i) => [
    i + 1,
    co.name,
    co.cds_price != null ? `TZS ${fmt(co.cds_price)}` : "Not priced",
    co.cds_previous_price != null ? `TZS ${fmt(co.cds_previous_price)}` : "—",
    co.cds_price != null && co.cds_previous_price != null
      ? `${((Number(co.cds_price) - Number(co.cds_previous_price)) / Number(co.cds_previous_price) * 100).toFixed(2)}%`
      : "—",
  ]);

  doc.autoTable({
    startY: y,
    head: [["#", "Company", "Current Price", "Previous Price", "Change %"]],
    body: holdingsBody,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [0, 132, 61], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 10 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`Portfolio_Statement_${cdsNumber}_${today()}.pdf`);
}

// ── 2. Transaction History PDF ─────────────────────────────────────
export function generateTransactionHistoryPDF({ cdsNumber, transactions, dateFrom, dateTo }) {
  const doc = new jsPDF({ orientation: "landscape" });
  const filtered = transactions.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  let y = addHeader(doc, "Transaction History", cdsNumber,
    `${dateFrom || "Start"} to ${dateTo || today()} — ${filtered.length} transactions`);

  const body = filtered.map((t, i) => [
    i + 1,
    t.date,
    t.company_name || "—",
    t.type,
    fmtInt(t.qty),
    fmt(t.price),
    fmt(t.total),
    fmt(t.fees),
    t.status,
    t.broker_name || "—",
  ]);

  doc.autoTable({
    startY: y,
    head: [["#", "Date", "Company", "Type", "Qty", "Price", "Total", "Fees", "Status", "Broker"]],
    body,
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [0, 50, 100], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 8 }, 4: { halign: "right" }, 5: { halign: "right" },
      6: { halign: "right" }, 7: { halign: "right" },
    },
    margin: { left: 10, right: 10 },
  });

  addFooter(doc);
  doc.save(`Transactions_${cdsNumber}_${dateFrom || "all"}_to_${dateTo || today()}.pdf`);
}

// ── 3. Gain/Loss Report PDF ────────────────────────────────────────
export function generateGainLossReportPDF({ cdsNumber, metrics, companyBreakdown }) {
  const doc = new jsPDF();
  let y = addHeader(doc, "Gain / Loss Report", cdsNumber, `As of ${today()}`);

  const summaryBody = [
    ["Unrealized G/L", `TZS ${fmt(metrics?.unrealizedGL || 0)}`],
    ["Unrealized Return", `${(metrics?.unrealizedRetPct || 0).toFixed(2)}%`],
    ["Realized G/L", `TZS ${fmt(metrics?.totalRealizedGL || 0)}`],
    ["Total Shares Held", fmtInt(metrics?.totalNetShares || 0)],
    ["Total Shares Sold", fmtInt(metrics?.totalSharesSold || 0)],
  ];

  doc.autoTable({
    startY: y,
    head: [["Metric", "Value"]],
    body: summaryBody,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 50, 100], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
    margin: { left: 14, right: 14 },
  });

  if (companyBreakdown?.length) {
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text("Breakdown by Company", 14, y);
    y += 4;

    doc.autoTable({
      startY: y,
      head: [["Company", "Shares", "Cost Basis", "Market Value", "G/L", "Return %"]],
      body: companyBreakdown.map(c => [
        c.name, fmtInt(c.shares), `TZS ${fmt(c.costBasis)}`, `TZS ${fmt(c.marketValue)}`,
        `TZS ${fmt(c.gainLoss)}`, `${c.returnPct.toFixed(2)}%`,
      ]),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [0, 132, 61], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`GainLoss_Report_${cdsNumber}_${today()}.pdf`);
}

// ── 4. Portfolio Statement Excel ───────────────────────────────────
export function generatePortfolioExcel({ cdsNumber, portfolio, metrics, dividendSummary }) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["Investors Portal — Portfolio Statement"],
    [`CDS: ${cdsNumber}`, `Date: ${today()}`],
    [],
    ["Metric", "Value"],
    ["Total Holdings", metrics?.companyCount || portfolio.length],
    ["Market Value (TZS)", metrics?.totalMarketValue || 0],
    ["Cost Basis (TZS)", metrics?.investedCapital || 0],
    ["Unrealized G/L (TZS)", metrics?.unrealizedGL || 0],
    ["Unrealized Return %", metrics?.unrealizedRetPct || 0],
  ];
  if (dividendSummary?.ytd_net > 0) {
    summaryData.push(["Dividend Income YTD (TZS)", dividendSummary.ytd_net]);
    summaryData.push(["Lifetime Dividends (TZS)", dividendSummary.lifetime_net]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"] = [{ wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");

  // Holdings sheet
  const holdingsData = [
    ["#", "Company", "Current Price", "Previous Price", "Change %", "Sector"],
    ...portfolio.map((co, i) => [
      i + 1,
      co.name,
      co.cds_price != null ? Number(co.cds_price) : null,
      co.cds_previous_price != null ? Number(co.cds_previous_price) : null,
      co.cds_price != null && co.cds_previous_price != null
        ? ((Number(co.cds_price) - Number(co.cds_previous_price)) / Number(co.cds_previous_price) * 100)
        : null,
      co.remarks || "",
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(holdingsData);
  ws2["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Holdings");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Portfolio_${cdsNumber}_${today()}.xlsx`);
}

// ── 5. Transaction History Excel ───────────────────────────────────
export function generateTransactionExcel({ cdsNumber, transactions, dateFrom, dateTo }) {
  const wb = XLSX.utils.book_new();
  const filtered = transactions.filter(t => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });

  const data = [
    ["Investors Portal — Transaction History"],
    [`CDS: ${cdsNumber}`, `Period: ${dateFrom || "Start"} to ${dateTo || today()}`, `Total: ${filtered.length} transactions`],
    [],
    ["#", "Date", "Company", "Type", "Quantity", "Price", "Total (TZS)", "Fees (TZS)", "Grand Total", "Status", "Broker", "Control #", "Remarks"],
    ...filtered.map((t, i) => [
      i + 1,
      t.date,
      t.company_name || "",
      t.type,
      Number(t.qty || 0),
      Number(t.price || 0),
      Number(t.total || 0),
      Number(t.fees || 0),
      t.type === "Buy" ? Number(t.total || 0) + Number(t.fees || 0) : Number(t.total || 0) - Number(t.fees || 0),
      t.status,
      t.broker_name || "",
      t.control_number || "",
      t.remarks || "",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 5 }, { wch: 12 }, { wch: 18 }, { wch: 6 }, { wch: 10 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
    { wch: 15 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Transactions_${cdsNumber}_${dateFrom || "all"}_to_${dateTo || today()}.xlsx`);
}
