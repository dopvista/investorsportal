// ── src/lib/reports.js ── PDF & Excel report generation ────────────
// Pure functions — no React dependencies, no side effects except file download.

import { jsPDF } from "jspdf";
import { applyPlugin } from "jspdf-autotable";
applyPlugin(jsPDF);
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

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

// ── Shared v2 constants ──────────────────────────────────────────
const C = {
  green:    [0, 132, 61],
  navy:     [10, 37, 64],
  darkGray: [55, 55, 55],
  midGray:  [110, 110, 110],
  lightGray:[200, 200, 200],
};
const v2f = (n) => Math.round(Number(n || 0)).toLocaleString("en-US");
const v2fmtDate = (d) => { if (!d) return ""; const iso = d.substring(0, 10); const [y, m, dd] = iso.split("-"); return `${dd}-${m}-${y}`; };
const v2retFmt = (v) => { const n = Number(v || 0); return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; };
const v2fmtInt = (n) => { const v = Number(n || 0); return v === 0 ? "—" : Math.round(v).toLocaleString("en-US"); };

// ── Shared v2 PDF helpers ────────────────────────────────────────
function v2InitDoc() {
  const doc = new jsPDF({ format: "a4", orientation: "landscape" });
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const ml = 14, mr = 14;
  const cw = pw - ml - mr;
  return { doc, pw, ph, ml, mr, cw };
}

function v2DrawHeader(doc, logoData, reportName, { pw, ml, mr }) {
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pw, 22, "F");

  let headerTextX = ml;
  if (logoData) {
    const logoSize = 16; // slightly larger to account for shadow/border baked into image
    const logoX = ml + 1, logoY = 3;
    doc.addImage(logoData, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");
    headerTextX = ml + logoSize + 6;
  }

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Investors Portal", headerTextX, 10);

  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(160, 175, 195);
  doc.text("Manage Your Investments Digitally", headerTextX, 17);

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(reportName, pw - mr, 14, { align: "right" });
}

function v2DrawCdsBar(doc, { cdsNumber, cdsName, rightText, pw, ml, mr, cw }) {
  const y = 26, boxH = 10;
  doc.setFillColor(245, 247, 250);
  doc.rect(ml, y, cw, boxH, "F");
  doc.setDrawColor(...C.lightGray);
  doc.rect(ml, y, cw, boxH, "S");

  doc.setFontSize(10);
  const textY = y + boxH / 2 + 3.2 / 2;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.navy);
  doc.text(`${cdsNumber}${cdsName ? ` — ${cdsName}` : ""}`, ml + 4, textY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.midGray);
  doc.text(rightText, pw - mr - 4, textY, { align: "right" });
  return y + 14; // start Y for table
}

function v2DrawFooter(doc, { pw, ph, ml, mr }) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.lightGray);
    doc.line(ml, ph - 12, pw - mr, ph - 12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.midGray);
    doc.text("Investors Portal", ml, ph - 6);
    doc.text(`Page ${i} of ${pageCount}`, pw - mr, ph - 6, { align: "right" });
  }
}

// Common autoTable styles — returns fresh copy to avoid mutation by jspdf-autotable
function v2TableBase() {
  return {
    styles: {
      font: "helvetica", fontSize: 11, cellPadding: 2,
      lineColor: [220, 224, 228], lineWidth: 0.3,
      overflow: "nowrap", valign: "middle",
    },
    headStyles: {
      fillColor: [0, 132, 61], textColor: [255, 255, 255],
      fontStyle: "bold", halign: "center", overflow: "nowrap",
      cellPadding: 2.5,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { textColor: [55, 55, 55] },
  };
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

// ── 2. (old Transaction History PDF removed — replaced by v2 below)

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

// ── 6. Portfolio Statement v2 (Reports Module) ───────────────────────
// Renders logo with rounded corners, shadow, and border on canvas (for PDF & Excel)
export function loadStyledLogoBase64(src, size = 128) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const pad = 12; // padding for shadow
      const total = size + pad * 2;
      const canvas = document.createElement("canvas");
      canvas.width = total;
      canvas.height = total;
      const ctx = canvas.getContext("2d");
      const r = size * 0.22; // corner radius proportional to size
      const x = pad, y = pad;

      // Helper: rounded rect path
      const rrect = (cx, cy, w, h, cr) => {
        ctx.beginPath();
        ctx.moveTo(cx + cr, cy);
        ctx.lineTo(cx + w - cr, cy);
        ctx.quadraticCurveTo(cx + w, cy, cx + w, cy + cr);
        ctx.lineTo(cx + w, cy + h - cr);
        ctx.quadraticCurveTo(cx + w, cy + h, cx + w - cr, cy + h);
        ctx.lineTo(cx + cr, cy + h);
        ctx.quadraticCurveTo(cx, cy + h, cx, cy + h - cr);
        ctx.lineTo(cx, cy + cr);
        ctx.quadraticCurveTo(cx, cy, cx + cr, cy);
        ctx.closePath();
      };

      // Fill entire canvas with navy background (no transparency for Excel compatibility)
      ctx.fillStyle = "#0A2540";
      ctx.fillRect(0, 0, total, total);

      // Shadow layers
      for (let s = 3; s >= 1; s--) {
        ctx.save();
        ctx.globalAlpha = 0.04 * s;
        ctx.fillStyle = "#000";
        rrect(x - 2 + s * 1.2, y - 2 + s * 1.5, size + 4, size + 4, r + 1);
        ctx.fill();
        ctx.restore();
      }

      // White background
      ctx.fillStyle = "#fff";
      rrect(x - 2, y - 2, size + 4, size + 4, r + 1);
      ctx.fill();

      // Clip to rounded rect and draw image
      ctx.save();
      rrect(x, y, size, size, r);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();

      // Navy border (thick, masks square image corners)
      ctx.strokeStyle = "#0A2540";
      ctx.lineWidth = size * 0.09;
      rrect(x - 4, y - 4, size + 8, size + 8, r + 3);
      ctx.stroke();

      // Subtle off-white border on top
      ctx.strokeStyle = "#C8D2DC";
      ctx.lineWidth = 1.5;
      rrect(x - 3, y - 3, size + 6, size + 6, r + 2);
      ctx.stroke();

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function generatePortfolioStatementPDFv2({ cdsNumber, cdsName, asAtDate, positionType, holdings, logoUrl }) {
  const { doc, pw, ph, ml, mr, cw } = v2InitDoc();
  const logoData = logoUrl ? await loadStyledLogoBase64(logoUrl, 128) : null;

  v2DrawHeader(doc, logoData, "Portfolio Statement", { pw, ml, mr });

  const posLabel = positionType === "held" ? "Current Holdings" : positionType === "sold" ? "Sold Positions" : "All Positions";
  let y = v2DrawCdsBar(doc, { cdsNumber, cdsName, rightText: `${posLabel}  |  As at ${asAtDate}  |  Currency: TZS`, pw, ml, mr, cw });

  const f = v2f;
  const isSold = positionType === "sold";
  const glFmt = (v) => `${Number(v) >= 0 ? "+" : ""}${f(v)}`;
  const retFmt = (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;

  let tableHead, tableBody, glColIdx, retColIdx;

  if (isSold) {
    // Fully Sold: show bought/sold shares, cost, proceeds, realized G/L
    const totBought   = holdings.reduce((s, h) => s + Number(h.total_bought || 0), 0);
    const totSold     = holdings.reduce((s, h) => s + Number(h.total_sold || 0), 0);
    const totCost     = holdings.reduce((s, h) => s + Number(h.sold_cost || 0), 0);
    const totProceeds = holdings.reduce((s, h) => s + Number(h.sold_proceeds || 0), 0);
    const totGL       = holdings.reduce((s, h) => s + Number(h.realized_gl || 0), 0);
    const totRet      = totCost > 0 ? (totGL / totCost * 100) : 0;

    const totRemaining = holdings.reduce((s, h) => s + Number(h.shares_held || 0), 0);

    tableHead = [["#", "Company", "Bought", "Sold", "Cost Basis", "Sale Proceeds", "Realized Gain/Loss", "Return", "Balance"]];
    tableBody = holdings.map((h, i) => [
      i + 1,
      h.companyName || "—",
      fmtInt(h.total_bought),
      fmtInt(h.total_sold),
      f(h.sold_cost),
      f(h.sold_proceeds),
      glFmt(h.realized_gl),
      retFmt(h.realized_ret_pct),
      fmtInt(h.shares_held),
    ]);
    tableBody.push([
      "", "TOTAL",
      fmtInt(totBought), fmtInt(totSold),
      f(totCost), f(totProceeds),
      glFmt(totGL), retFmt(totRet), fmtInt(totRemaining),
    ]);
    glColIdx = 6;
    retColIdx = 7;
  } else if (positionType === "all") {
    // All Positions — two rows per company if both held and sold exist
    let totalHeldCost = 0, totalHeldMarket = 0, totalHeldGL = 0;
    let totalSoldCostAll = 0, totalSoldProc = 0, totalSoldGL = 0;
    let heldCount = 0, soldCount = 0;

    tableHead = [["#", "Company", "Status", "Shares", "Cost Basis", "Market Value", "Proceeds", "Gain/Loss", "Return"]];
    tableBody = [];
    let rowNum = 1;

    for (const h of holdings) {
      const hasHeld = h.shares_held > 0;
      const hasSold = h.total_sold > 0;

      if (hasHeld) {
        tableBody.push([
          rowNum, h.companyName || "—", "Held",
          fmtInt(h.shares_held), f(h.cost_basis), f(h.market_value), "—",
          glFmt(h.unrealized_gl), retFmt(h.return_pct),
        ]);
        totalHeldCost += Number(h.cost_basis || 0);
        totalHeldMarket += Number(h.market_value || 0);
        totalHeldGL += Number(h.unrealized_gl || 0);
        heldCount++;
      }
      if (hasSold) {
        tableBody.push([
          hasHeld ? "" : rowNum, hasHeld ? h.companyName : (h.companyName || "—"), "Sold",
          fmtInt(h.total_sold), f(h.sold_cost), "—", f(h.sold_proceeds),
          glFmt(h.realized_gl), retFmt(h.realized_ret_pct),
        ]);
        totalSoldCostAll += Number(h.sold_cost || 0);
        totalSoldProc += Number(h.sold_proceeds || 0);
        totalSoldGL += Number(h.realized_gl || 0);
        soldCount++;
      }
      rowNum++;
    }

    // Totals
    const grandCost = totalHeldCost + totalSoldCostAll;
    const grandGL = totalHeldGL + totalSoldGL;
    const grandRet = grandCost > 0 ? (grandGL / grandCost * 100) : 0;
    tableBody.push([
      "", "TOTAL", "",
      "—", f(grandCost), f(totalHeldMarket), f(totalSoldProc),
      glFmt(grandGL), retFmt(grandRet),
    ]);
    glColIdx = 7;
    retColIdx = 8;
  } else {
    // Current Holdings
    const totalCost   = holdings.reduce((s, h) => s + Number(h.cost_basis || 0), 0);
    const totalMarket = holdings.reduce((s, h) => s + Number(h.market_value || 0), 0);
    const totalGL     = holdings.reduce((s, h) => s + Number(h.unrealized_gl || 0), 0);
    const totalReturn = totalCost > 0 ? (totalGL / totalCost * 100) : 0;
    const totalShares = holdings.reduce((s, h) => s + Number(h.shares_held || 0), 0);

    tableHead = [["#", "Company", "Shares", "Average Cost", "Cost Basis", "Price", "Market Value", "Gain/Loss", "Return"]];
    tableBody = holdings.map((h, i) => [
      i + 1,
      h.companyName || "—",
      fmtInt(h.shares_held),
      f(h.avg_cost_per_share),
      f(h.cost_basis),
      h.current_price != null ? f(h.current_price) : "N/A",
      h.market_value != null ? f(h.market_value) : "N/A",
      glFmt(h.unrealized_gl),
      retFmt(h.return_pct),
    ]);
    tableBody.push([
      "", "TOTAL",
      fmtInt(totalShares), "—",
      f(totalCost), "—",
      f(totalMarket),
      glFmt(totalGL), retFmt(totalReturn),
    ]);
    glColIdx = 7;
    retColIdx = 8;
  }

  doc.autoTable({
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: "grid",
    ...v2TableBase(),
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: positionType === "all" ? 38 : 45 },
      2: positionType === "all" ? { halign: "center" } : { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      ...(tableHead[0].length > 8 ? { 8: { halign: "right" }, 9: { halign: "right" } } : {}),
    },
    tableWidth: cw,
    margin: { left: ml, right: mr },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [230, 236, 242];
        data.cell.styles.textColor = C.navy;
      }
      if (data.section === "body" && (data.column.index === glColIdx || data.column.index === retColIdx)) {
        const raw = data.cell.raw;
        if (typeof raw === "string" && raw.startsWith("+")) {
          data.cell.styles.textColor = C.green;
        } else if (typeof raw === "string" && raw.startsWith("-")) {
          data.cell.styles.textColor = [200, 50, 50];
        }
      }
    },
  });

  // ── Note below table for All Positions ─────────────────────
  if (positionType === "all") {
    const noteY = doc.lastAutoTable.finalY + 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...C.midGray);
    doc.text("* Totals include held (unrealized) and sold (realized) positions. Gain/Loss combines both unrealized and realized gains.", ml, noteY);
  }

  v2DrawFooter(doc, { pw, ph, ml, mr });
  doc.setProperties({ title: "Portfolio Statement", subject: `${cdsNumber} — ${asAtDate}` });
  const url = doc.output("bloburl", { filename: `Portfolio_Statement_${cdsNumber}_${asAtDate}.pdf` });
  window.open(url, "_blank");
}

// ── 7. Transaction History PDF (Reports Module) ─────────────────
export async function generateTransactionHistoryPDF({ cdsNumber, cdsName, dateFrom, dateTo, txnType, status, brokerName, transactions, logoUrl }) {
  const { doc, pw, ph, ml, mr, cw } = v2InitDoc();
  const f = v2f;
  const logoData = logoUrl ? await loadStyledLogoBase64(logoUrl, 128) : null;

  v2DrawHeader(doc, logoData, "Transaction History", { pw, ml, mr });

  const typeLabel = txnType === "Buy" ? "Purchases" : txnType === "Sell" ? "Sales" : "All Transactions";
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : "All";
  const periodLabel = (dateFrom || dateTo) ? `${v2fmtDate(dateFrom) || "Start"} to ${v2fmtDate(dateTo) || "Present"}` : null;
  const showBrokerCol = !brokerName;

  const rightParts = [typeLabel];
  if (brokerName) rightParts.push(brokerName);
  if (periodLabel) rightParts.push(periodLabel);
  rightParts.push(`Status: ${statusLabel}`);
  let y = v2DrawCdsBar(doc, { cdsNumber, cdsName, rightText: rightParts.join("  |  "), pw, ml, mr, cw });

  const fmtDateCell = (d) => { if (!d) return "—"; const [y, m, dd] = d.split("-"); return `${dd}-${m}-${y}`; };
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

  const headCols = ["#", "Date", "Company", "Type", "Quantity", "Price", "Fees", "Grand Total"];
  if (showBrokerCol) headCols.push("Broker");
  headCols.push("Status");
  const tableHead = [headCols];
  let buyQty = 0, buyFees = 0, buyGrand = 0;
  let sellQty = 0, sellFees = 0, sellGrand = 0;

  const tableBody = transactions.map((t, i) => {
    const qty = Number(t.qty || 0);
    const price = Number(t.price || 0);
    const total = Number(t.total || 0);
    const fees = Number(t.fees || 0);
    const grand = t.type === "Buy" ? total + fees : total - fees;
    if (t.type === "Sell") { sellQty += qty; sellFees += fees; sellGrand += grand; }
    else { buyQty += qty; buyFees += fees; buyGrand += grand; }
    const row = [
      i + 1,
      fmtDateCell(t.date),
      t.company_name || "—",
      t.type || "—",
      fmtInt(qty),
      f(price),
      f(fees),
      f(grand),
    ];
    if (showBrokerCol) row.push(t.broker_name || "—");
    row.push(capitalize(t.status));
    return row;
  });

  // Totals rows — separate for Buy and Sell
  const hasBuys = buyQty > 0;
  const hasSells = sellQty > 0;
  const totalRowIndices = [];

  const makeTotRow = (label, qty, fees, grand) => {
    const row = [label, "", "", "", fmtInt(qty), "—", f(fees), f(grand)];
    if (showBrokerCol) row.push("—");
    row.push("—");
    return row;
  };

  let sellTotalRowIdx = -1;
  if (hasBuys) {
    tableBody.push(makeTotRow(hasSells ? "TOTAL PURCHASES" : "TOTAL", buyQty, buyFees, buyGrand));
    totalRowIndices.push(tableBody.length - 1);
  }
  if (hasSells) {
    tableBody.push(makeTotRow(hasBuys ? "TOTAL SALES" : "TOTAL", sellQty, sellFees, sellGrand));
    sellTotalRowIdx = tableBody.length - 1;
    totalRowIndices.push(sellTotalRowIdx);
  }

  doc.autoTable({
    startY: y,
    margin: { left: ml, right: mr },
    head: tableHead,
    body: tableBody,
    tableWidth: cw,
    styles: {
      font: "helvetica", fontSize: 11, cellPadding: 2,
      lineColor: [220, 224, 228], lineWidth: 0.3,
      overflow: "linebreak", valign: "middle",
    },
    headStyles: {
      fillColor: C.green, textColor: [255, 255, 255],
      fontStyle: "bold", halign: "center", overflow: "nowrap",
    },
    columnStyles: showBrokerCol ? {
      0: { halign: "center", cellWidth: 10 },                // #
      1: { cellWidth: 24, overflow: "nowrap", halign: "center" }, // Date
      2: { cellWidth: 30 },                                   // Company
      3: { halign: "center", cellWidth: 14 },                 // Type
      4: { halign: "right", cellWidth: 20, overflow: "nowrap" },  // Quantity
      5: { halign: "right", cellWidth: 18, overflow: "nowrap" },  // Price
      6: { halign: "right", cellWidth: 30, overflow: "nowrap" },  // Fees
      7: { halign: "right", cellWidth: 38, overflow: "nowrap" },  // Grand Total
      8: { cellWidth: 65 },                                   // Broker
      9: { halign: "center", cellWidth: 20 },                 // Status
    } : {
      0: { halign: "center", cellWidth: 10 },                // #
      1: { cellWidth: 24, overflow: "nowrap", halign: "center" }, // Date
      2: { cellWidth: 65 },                                   // Company
      3: { halign: "center", cellWidth: 14 },                 // Type
      4: { halign: "right", cellWidth: 28, overflow: "nowrap" },  // Quantity
      5: { halign: "right", cellWidth: 28, overflow: "nowrap" },  // Price
      6: { halign: "right", cellWidth: 34, overflow: "nowrap" },  // Fees
      7: { halign: "right", cellWidth: 42, overflow: "nowrap" },  // Grand Total
      8: { halign: "center", cellWidth: 24 },                 // Status
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    bodyStyles: { textColor: C.darkGray },
    didParseCell(data) {
      const isTotalRow = totalRowIndices.includes(data.row.index);
      // Total row styling
      if (data.section === "body" && isTotalRow) {
        data.cell.styles.fillColor = [230, 236, 242];
        data.cell.styles.textColor = data.row.index === sellTotalRowIdx ? [200, 50, 50] : C.navy;
        data.cell.styles.fontStyle = "bold";
        // Merge first 3 columns for label
        if (data.column.index === 0) data.cell.colSpan = 3;
      }
      // Sell row — entire row in red
      if (data.section === "body" && !isTotalRow) {
        const typeCell = data.row.raw[3];
        if (typeCell === "Sell") data.cell.styles.textColor = [200, 50, 50];
      }
      // Grand Total column bold
      const grandTotalCol = 7;
      if (data.section === "body" && data.column.index === grandTotalCol && !isTotalRow) {
        data.cell.styles.fontStyle = "bold";
      }
      // Status column coloring
      const statusCol = showBrokerCol ? 9 : 8;
      if (data.section === "body" && data.column.index === statusCol && !isTotalRow) {
        const st = (data.cell.raw || "").toLowerCase();
        if (st === "confirmed") data.cell.styles.textColor = [30, 100, 180];
        else if (st === "rejected") data.cell.styles.textColor = [200, 50, 50];
        else if (st === "pending") data.cell.styles.textColor = [180, 130, 0];
      }
      // Dash cells — muted gray
      if (data.section === "body" && data.cell.raw === "—") {
        data.cell.styles.textColor = [153, 153, 153];
      }
    },
  });

  v2DrawFooter(doc, { pw, ph, ml, mr });
  doc.setProperties({ title: "Transaction History", subject: `${cdsNumber} — ${dateFrom || "all"} to ${dateTo || "all"}` });
  const url = doc.output("bloburl", { filename: `Transaction_History_${cdsNumber}_${dateFrom || "all"}_to_${dateTo || "all"}.pdf` });
  window.open(url, "_blank");
}

// ── 9. Gain/Loss Report PDF (Reports Module) ─────────────────────
export async function generateGainLossPDF({ cdsNumber, cdsName, asAtDate, glView = "company", holdings, sells, dateFrom, dateTo, brokerName, logoUrl }) {
  const { doc, pw, ph, ml, mr, cw } = v2InitDoc();
  const f = v2f;
  const retFmt = v2retFmt;
  const isByTxn = glView === "transaction";

  const logoData = logoUrl ? await loadStyledLogoBase64(logoUrl, 128) : null;
  v2DrawHeader(doc, logoData, "Gain/Loss Report (FIFO)", { pw, ml, mr });

  const viewLabel = isByTxn ? "By Transaction" : "By Company";
  let cdsBarRight = viewLabel;
  if (isByTxn && brokerName) cdsBarRight += `  |  ${brokerName}`;
  if (dateFrom || dateTo) cdsBarRight += `  |  ${v2fmtDate(dateFrom || "")} to ${v2fmtDate(dateTo || "")}`;
  let y = v2DrawCdsBar(doc, { cdsNumber, cdsName, rightText: cdsBarRight, pw, ml, mr, cw });

  let tableHead, tableBody, totalRowIdx, glColIdx, retColIdx, columnStyles;

  if (isByTxn) {
    // ── By Transaction view ──────────────────────────────────
    const fmtDateCell = (d) => { if (!d) return "—"; const [yr, m, dd] = d.split("-"); return `${dd}-${m}-${yr}`; };
    tableHead = [["#", "Date", "Company", "Qty Sold", "Sell Price", "Sell Fees", "FIFO Cost", "Proceeds", "Realized G/L", "Return"]];

    let totQty = 0, totFifoCost = 0, totProceeds = 0, totGL = 0;

    tableBody = sells.map((s, i) => {
      totQty += Number(s.qty || 0);
      totFifoCost += Number(s.fifoCost || 0);
      totProceeds += Number(s.proceeds || 0);
      totGL += Number(s.gl || 0);
      return [
        i + 1,
        fmtDateCell(s.date),
        s.companyName || "—",
        fmtInt(s.qty),
        f(s.sellPrice),
        f(s.sellFees),
        f(s.fifoCost),
        f(s.proceeds),
        f(s.gl),
        retFmt(s.retPct),
      ];
    });

    const totRet = totFifoCost > 0 ? (totGL / totFifoCost) * 100 : 0;
    tableBody.push([
      "", "TOTAL", "", fmtInt(totQty), "—", "—",
      f(totFifoCost), f(totProceeds), f(totGL), retFmt(totRet),
    ]);

    totalRowIdx = tableBody.length - 1;
    glColIdx = 8;
    retColIdx = 9;

    // 10 cols, cw=269: #10 + Date24 + Company40 + Qty20 + Price20 + Fees20 + FIFO30 + Proceeds30 + GL30 + Ret24 = 248 → +21 to Company
    // 10 cols, cw=269: #10 + Date24 + Company44 + Qty22 + Price24 + Fees22 + FIFO32 + Proceeds32 + GL32 + Ret27 = 269
    columnStyles = {
      0: { halign: "center", cellWidth: 10 },
      1: { halign: "center", cellWidth: 24 },
      2: { cellWidth: 44 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 22 },
      6: { halign: "right", cellWidth: 32 },
      7: { halign: "right", cellWidth: 32 },
      8: { halign: "right", cellWidth: 32 },
      9: { halign: "right", cellWidth: 27 },
    };
  } else {
    // ── By Company view ──────────────────────────────────────
    tableHead = [["#", "Company", "Bought", "Sold", "Balance", "Cost Basis", "Proceeds", "Realized G/L", "Return"]];

    let totBought = 0, totSold = 0, totHeld = 0, totCost = 0, totProceeds = 0, totGL = 0;

    tableBody = holdings.map((h, i) => {
      totBought += Number(h.total_bought || 0);
      totSold += Number(h.total_sold || 0);
      totHeld += Number(h.shares_held || 0);
      totCost += Number(h.sold_cost || 0);
      totProceeds += Number(h.sold_proceeds || 0);
      totGL += Number(h.realized_gl || 0);
      return [
        i + 1,
        h.companyName || "—",
        fmtInt(h.total_bought),
        fmtInt(h.total_sold),
        fmtInt(h.shares_held),
        f(h.sold_cost),
        f(h.sold_proceeds),
        f(h.realized_gl),
        retFmt(h.realized_ret_pct),
      ];
    });

    const totRet = totCost > 0 ? (totGL / totCost) * 100 : 0;
    tableBody.push([
      "", "TOTAL", fmtInt(totBought), fmtInt(totSold), fmtInt(totHeld),
      f(totCost), f(totProceeds), f(totGL), retFmt(totRet),
    ]);

    totalRowIdx = tableBody.length - 1;
    glColIdx = 7;
    retColIdx = 8;

    columnStyles = {
      0: { halign: "center", cellWidth: 10 },
      1: { cellWidth: 61 },
      2: { halign: "right", cellWidth: 24 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 34 },
      6: { halign: "right", cellWidth: 34 },
      7: { halign: "right", cellWidth: 34 },
      8: { halign: "right", cellWidth: 24 },
    };
  }

  doc.autoTable({
    startY: y,
    margin: { left: ml, right: mr },
    head: tableHead,
    body: tableBody,
    tableWidth: cw,
    ...v2TableBase(),
    columnStyles,
    didParseCell(data) {
      // Total row styling
      if (data.section === "body" && data.row.index === totalRowIdx) {
        data.cell.styles.fillColor = [230, 236, 242];
        data.cell.styles.textColor = C.navy;
        data.cell.styles.fontStyle = "bold";
      }
      // G/L column color coding
      if (data.section === "body" && data.column.index === glColIdx) {
        const num = Number(String(data.cell.raw).replace(/[^0-9.-]/g, ""));
        data.cell.styles.textColor = num >= 0 ? C.green : [200, 50, 50];
        if (data.row.index !== totalRowIdx) data.cell.styles.fontStyle = "bold";
      }
      // Return column color coding
      if (data.section === "body" && data.column.index === retColIdx) {
        const num = parseFloat(String(data.cell.raw));
        data.cell.styles.textColor = num >= 0 ? C.green : [200, 50, 50];
      }
      // Dash cells — muted gray
      if (data.section === "body" && data.cell.raw === "—") {
        data.cell.styles.textColor = [153, 153, 153];
      }
    },
  });

  v2DrawFooter(doc, { pw, ph, ml, mr });

  const dateLabel = `${dateFrom || ""}_to_${dateTo || ""}`;
  doc.setProperties({ title: "Gain/Loss Report (FIFO)", subject: `${cdsNumber} — ${dateFrom} to ${dateTo}` });
  const blobUrl = doc.output("bloburl", { filename: `Gain_Loss_${cdsNumber}_${dateLabel}.pdf` });
  window.open(blobUrl, "_blank");
}

// ── 8. Portfolio Statement Excel v2 (Reports Module) ──────────────
export async function generatePortfolioStatementExcelv2({ cdsNumber, cdsName, asAtDate, positionType, holdings, logoUrl }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Portfolio Statement");
  const f = (n) => Math.round(Number(n || 0));
  const retFmt = (v) => { const n = Number(v || 0); return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; };
  const posLabel = positionType === "held" ? "Current Holdings" : positionType === "sold" ? "Sold Positions" : "All Positions";

  const isSold = positionType === "sold";
  const isAll = positionType === "all";
  const colCount = 9;
  const splitCol = 5; // E = col 5 in ExcelJS (1-based)

  // ── Colors ──────────────────────────────────────────────────
  const navy = "0A2540";
  const green = "00843D";
  const greenFont = "00843D";
  const redFont = "C83232";
  const lightBg = "F8FAFC";
  const totalBg = "E6ECF2";
  const thinBorder = { style: "thin", color: { argb: "FFDCE0E4" } };
  const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  // ── Column widths ──────────────────────────────────────────
  ws.columns = [
    { width: 6 },   // A: # (also Logo in header)
    { width: 20 },  // B: Company
    { width: 14 },  // C
    { width: 14 },  // D
    { width: 18 },  // E: Cost Basis
    { width: 18 },  // F
    { width: 18 },  // G
    { width: 18 },  // H: Gain/Loss
    { width: 13 },  // I: Return
  ];

  // ── Helper: fill all cells in a row range with navy bg ─────
  const fillNavy = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };
    }
  };
  const fillCds = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      cell.border = border;
    }
  };

  // ── Row 1: Title bar ───────────────────────────────────────
  const row1 = ws.getRow(1);
  row1.height = 28;
  fillNavy(row1);

  // Merge A1:A2 for logo
  ws.mergeCells(1, 1, 2, 1); // A1:A2
  row1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };

  // Logo — fit within A1:A2
  if (logoUrl) {
    try {
      const logoBase64 = await loadStyledLogoBase64(logoUrl, 128);
      if (!logoBase64) throw new Error("Logo failed to load");
      const base64Data = logoBase64.split(",")[1];
      const imgId = wb.addImage({ base64: base64Data, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0.2, row: 0.05 }, ext: { width: 40, height: 40 } });
    } catch (e) { /* skip logo on error */ }
  }

  // Title in B1:D1
  const titleCell = row1.getCell(2);
  titleCell.value = "Investors Portal";
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(1, 2, 1, splitCol - 1); // B1:D1

  // Report name in E1:I2
  const reportCell = row1.getCell(splitCol);
  reportCell.value = "Portfolio Statement";
  reportCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
  reportCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(1, splitCol, 2, colCount); // E1:I2

  // ── Row 2: Motto ───────────────────────────────────────────
  const row2 = ws.getRow(2);
  row2.height = 20;
  fillNavy(row2);
  const mottoCell = row2.getCell(2);
  mottoCell.value = "Manage Your Investments Digitally";
  mottoCell.font = { italic: true, color: { argb: "FFA0AFC3" }, size: 10 };
  mottoCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(2, 2, 2, splitCol - 1); // B2:D2

  // ── Row 3: Separator ───────────────────────────────────────
  ws.getRow(3).height = 6;

  // ── Row 4: CDS details bar ─────────────────────────────────
  const row4 = ws.getRow(4);
  row4.height = 22;
  fillCds(row4);
  const cdsLeft = row4.getCell(1);
  cdsLeft.value = `${cdsNumber}${cdsName ? ` — ${cdsName}` : ""}`;
  cdsLeft.font = { bold: true, color: { argb: `FF${navy}` }, size: 10 };
  cdsLeft.alignment = { vertical: "middle" };
  ws.mergeCells(4, 1, 4, splitCol - 1); // A4:D4

  const cdsRight = row4.getCell(splitCol);
  cdsRight.value = `${posLabel}  |  As at ${asAtDate}  |  Currency: TZS`;
  cdsRight.font = { bold: true, color: { argb: "FF6E6E6E" }, size: 10 };
  cdsRight.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(4, splitCol, 4, colCount); // E4:I4

  // ── Row 5: Separator ───────────────────────────────────────
  ws.getRow(5).height = 6;

  // ── Row 6: Table headers ───────────────────────────────────
  let headers;
  if (isSold) {
    headers = ["#", "Company", "Bought", "Sold", "Cost Basis", "Sale Proceeds", "Realized Gain/Loss", "Return", "Balance"];
  } else if (isAll) {
    headers = ["#", "Company", "Status", "Shares", "Cost Basis", "Market Value", "Proceeds", "Gain/Loss", "Return"];
  } else {
    headers = ["#", "Company", "Shares", "Average Cost", "Cost Basis", "Price", "Market Value", "Gain/Loss", "Return"];
  }
  const dataCol = 1; // data starts at column A

  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(dataCol + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${green}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });

  // ── Style helpers for data rows ────────────────────────────
  const applyText = (cell, isAlt) => {
    cell.font = { size: 11, color: { argb: "FF373737" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? `FF${lightBg}` : "FFFFFFFF" } };
    cell.border = border;
    cell.alignment = { vertical: "middle" };
  };
  const applyDash = (cell, isAlt) => {
    cell.font = { size: 11, color: { argb: "FF999999" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? `FF${lightBg}` : "FFFFFFFF" } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  };
  const applyTotalDash = (cell) => {
    cell.font = { bold: true, size: 11, color: { argb: "FF999999" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${totalBg}` } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  };
  const applyNum = (cell, isAlt) => {
    cell.font = { size: 11, color: { argb: "FF373737" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? `FF${lightBg}` : "FFFFFFFF" } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.numFmt = "#,##0";
  };
  const applyCenter = (cell, isAlt) => {
    cell.font = { size: 11, color: { argb: "FF373737" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? `FF${lightBg}` : "FFFFFFFF" } };
    cell.border = border;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };
  const applyGL = (cell, val, isAlt) => {
    const clr = Number(val) >= 0 ? greenFont : redFont;
    cell.font = { size: 11, color: { argb: `FF${clr}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? `FF${lightBg}` : "FFFFFFFF" } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.numFmt = "#,##0";
  };
  const applyRet = (cell, val, isAlt) => {
    const clr = Number(val) >= 0 ? greenFont : redFont;
    cell.font = { size: 11, color: { argb: `FF${clr}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? `FF${lightBg}` : "FFFFFFFF" } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  };
  const applyTotal = (cell) => {
    cell.font = { bold: true, size: 11, color: { argb: `FF${navy}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${totalBg}` } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.numFmt = "#,##0";
  };
  const applyTotalText = (cell) => {
    cell.font = { bold: true, size: 11, color: { argb: `FF${navy}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${totalBg}` } };
    cell.border = border;
    cell.alignment = { vertical: "middle" };
  };
  const applyTotalGL = (cell, val) => {
    const clr = Number(val) >= 0 ? greenFont : redFont;
    cell.font = { bold: true, size: 11, color: { argb: `FF${clr}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${totalBg}` } };
    cell.border = border;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.numFmt = "#,##0";
  };

  // ── Data rows ──────────────────────────────────────────────
  let r = 7; // start row for data

  if (isSold) {
    holdings.forEach((h, i) => {
      const isAlt = i % 2 === 0;
      const row = ws.getRow(r++);
      const c = (n) => row.getCell(n);
      c(1).value = i + 1; applyCenter(c(1), isAlt);
      c(2).value = h.companyName || "—"; applyText(c(2), isAlt);
      c(3).value = f(h.total_bought); applyNum(c(3), isAlt);
      c(4).value = f(h.total_sold); applyNum(c(4), isAlt);
      c(5).value = f(h.sold_cost); applyNum(c(5), isAlt);
      c(6).value = f(h.sold_proceeds); applyNum(c(6), isAlt);
      c(7).value = f(h.realized_gl); applyGL(c(7), h.realized_gl, isAlt);
      c(8).value = retFmt(h.realized_ret_pct); applyRet(c(8), h.realized_ret_pct, isAlt);
      c(9).value = f(h.shares_held); applyNum(c(9), isAlt);
    });
    // Totals
    const totBought = holdings.reduce((s, h) => s + Number(h.total_bought || 0), 0);
    const totSold = holdings.reduce((s, h) => s + Number(h.total_sold || 0), 0);
    const totCost = holdings.reduce((s, h) => s + Number(h.sold_cost || 0), 0);
    const totProceeds = holdings.reduce((s, h) => s + Number(h.sold_proceeds || 0), 0);
    const totGL = holdings.reduce((s, h) => s + Number(h.realized_gl || 0), 0);
    const totRet = totCost > 0 ? (totGL / totCost * 100) : 0;
    const totBalance = holdings.reduce((s, h) => s + Number(h.shares_held || 0), 0);
    const tr = ws.getRow(r++);
    const tc = (n) => tr.getCell(n);
    tc(1).value = ""; applyTotal(tc(1));
    tc(2).value = "TOTAL"; applyTotalText(tc(2));
    tc(3).value = f(totBought); applyTotal(tc(3));
    tc(4).value = f(totSold); applyTotal(tc(4));
    tc(5).value = f(totCost); applyTotal(tc(5));
    tc(6).value = f(totProceeds); applyTotal(tc(6));
    tc(7).value = f(totGL); applyTotalGL(tc(7), totGL);
    tc(8).value = retFmt(totRet); applyTotalGL(tc(8), totRet);
    tc(9).value = f(totBalance); applyTotal(tc(9));

  } else if (isAll) {
    let rowNum = 1;
    let altIdx = 0;
    for (const h of holdings) {
      const hasHeld = h.shares_held > 0;
      const hasSold = h.total_sold > 0;
      if (hasHeld) {
        const isAlt = altIdx % 2 === 0;
        const row = ws.getRow(r++);
        const c = (n) => row.getCell(n);
        c(1).value = rowNum; applyCenter(c(1), isAlt);
        c(2).value = h.companyName || "—"; applyText(c(2), isAlt);
        c(3).value = "Held"; applyCenter(c(3), isAlt);
        c(4).value = f(h.shares_held); applyNum(c(4), isAlt);
        c(5).value = f(h.cost_basis); applyNum(c(5), isAlt);
        c(6).value = f(h.market_value); applyNum(c(6), isAlt);
        c(7).value = "—"; applyDash(c(7), isAlt);
        c(8).value = f(h.unrealized_gl); applyGL(c(8), h.unrealized_gl, isAlt);
        c(9).value = retFmt(h.return_pct); applyRet(c(9), h.return_pct, isAlt);
        altIdx++;
      }
      if (hasSold) {
        const isAlt = altIdx % 2 === 0;
        const row = ws.getRow(r++);
        const c = (n) => row.getCell(n);
        c(1).value = hasHeld ? "" : rowNum; applyCenter(c(1), isAlt);
        c(2).value = hasHeld ? h.companyName : (h.companyName || "—"); applyText(c(2), isAlt);
        c(3).value = "Sold"; applyCenter(c(3), isAlt);
        c(4).value = f(h.total_sold); applyNum(c(4), isAlt);
        c(5).value = f(h.sold_cost); applyNum(c(5), isAlt);
        c(6).value = "—"; applyDash(c(6), isAlt);
        c(7).value = f(h.sold_proceeds); applyNum(c(7), isAlt);
        c(8).value = f(h.realized_gl); applyGL(c(8), h.realized_gl, isAlt);
        c(9).value = retFmt(h.realized_ret_pct); applyRet(c(9), h.realized_ret_pct, isAlt);
        altIdx++;
      }
      rowNum++;
    }
    // Totals
    const totalHeldCost = holdings.reduce((s, h) => s + (h.shares_held > 0 ? Number(h.cost_basis || 0) : 0), 0);
    const totalSoldCost = holdings.reduce((s, h) => s + Number(h.sold_cost || 0), 0);
    const totalHeldMarket = holdings.reduce((s, h) => s + Number(h.market_value || 0), 0);
    const totalSoldProc = holdings.reduce((s, h) => s + Number(h.sold_proceeds || 0), 0);
    const totalHeldGL = holdings.reduce((s, h) => s + Number(h.unrealized_gl || 0), 0);
    const totalSoldGL = holdings.reduce((s, h) => s + Number(h.realized_gl || 0), 0);
    const grandCost = totalHeldCost + totalSoldCost;
    const grandGL = totalHeldGL + totalSoldGL;
    const grandRet = grandCost > 0 ? (grandGL / grandCost * 100) : 0;
    const tr = ws.getRow(r++);
    const tc = (n) => tr.getCell(n);
    tc(1).value = ""; applyTotal(tc(1));
    tc(2).value = "TOTAL"; applyTotalText(tc(2));
    tc(3).value = ""; applyTotal(tc(3));
    tc(4).value = "—"; applyTotalDash(tc(4));
    tc(5).value = f(grandCost); applyTotal(tc(5));
    tc(6).value = f(totalHeldMarket); applyTotal(tc(6));
    tc(7).value = f(totalSoldProc); applyTotal(tc(7));
    tc(8).value = f(grandGL); applyTotalGL(tc(8), grandGL);
    tc(9).value = retFmt(grandRet); applyTotalGL(tc(9), grandRet);

  } else {
    // Current Holdings
    holdings.forEach((h, i) => {
      const isAlt = i % 2 === 0;
      const row = ws.getRow(r++);
      const c = (n) => row.getCell(n);
      c(1).value = i + 1; applyCenter(c(1), isAlt);
      c(2).value = h.companyName || "—"; applyText(c(2), isAlt);
      c(3).value = f(h.shares_held); applyNum(c(3), isAlt);
      c(4).value = f(h.avg_cost_per_share); applyNum(c(4), isAlt);
      c(5).value = f(h.cost_basis); applyNum(c(5), isAlt);
      c(6).value = h.current_price != null ? f(h.current_price) : "N/A"; applyNum(c(6), isAlt);
      c(7).value = h.market_value != null ? f(h.market_value) : "N/A"; applyNum(c(7), isAlt);
      c(8).value = f(h.unrealized_gl); applyGL(c(8), h.unrealized_gl, isAlt);
      c(9).value = retFmt(h.return_pct); applyRet(c(9), h.return_pct, isAlt);
    });
    // Totals
    const totalCost = holdings.reduce((s, h) => s + Number(h.cost_basis || 0), 0);
    const totalMarket = holdings.reduce((s, h) => s + Number(h.market_value || 0), 0);
    const totalGL = holdings.reduce((s, h) => s + Number(h.unrealized_gl || 0), 0);
    const totalReturn = totalCost > 0 ? (totalGL / totalCost * 100) : 0;
    const totalShares = holdings.reduce((s, h) => s + Number(h.shares_held || 0), 0);
    const tr = ws.getRow(r++);
    const tc = (n) => tr.getCell(n);
    tc(1).value = ""; applyTotal(tc(1));
    tc(2).value = "TOTAL"; applyTotalText(tc(2));
    tc(3).value = f(totalShares); applyTotal(tc(3));
    tc(4).value = "—"; applyTotalDash(tc(4));
    tc(5).value = f(totalCost); applyTotal(tc(5));
    tc(6).value = "—"; applyTotalDash(tc(6));
    tc(7).value = f(totalMarket); applyTotal(tc(7));
    tc(8).value = f(totalGL); applyTotalGL(tc(8), totalGL);
    tc(9).value = retFmt(totalReturn); applyTotalGL(tc(9), totalReturn);
  }

  // ── Note for All Positions ──────────────────────────────────
  if (isAll) {
    r++; // blank row
    const noteRow = ws.getRow(r);
    noteRow.getCell(1).value = "* Totals include held (unrealized) and sold (realized) positions. Gain/Loss combines both.";
    noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6E6E6E" } };
    ws.mergeCells(r, 1, r, colCount);
  }

  // ── Print setup ─────────────────────────────────────────────
  const lastRow = isAll ? r : r - 1;
  ws.pageSetup = {
    paperSize: 9,           // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 100,
    printArea: `A1:I${lastRow}`,
    margins: {
      left: 1.8 / 2.54,     // 1.8cm → inches
      right: 1.8 / 2.54,
      top: 1.9 / 2.54,
      bottom: 1.9 / 2.54,
      header: 0.8 / 2.54,
      footer: 0.8 / 2.54,
    },
    horizontalCentered: true,
  };
  ws.headerFooter = {
    oddFooter: "&LInvestors Portal&RPage &P of &N",
  };

  // ── Write & download ───────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Portfolio_Statement_${cdsNumber}_${asAtDate}.xlsx`
  );
}

// ── 5. Transaction History Excel v2 (Reports Module) ──────────────
export async function generateTransactionHistoryExcel({ cdsNumber, cdsName, dateFrom, dateTo, txnType, status, brokerName, transactions, logoUrl }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Transaction History");
  const f = (n) => Math.round(Number(n || 0));
  const fmtDateCell = (d) => { if (!d) return "—"; const [y, m, dd] = d.split("-"); return `${dd}-${m}-${y}`; };
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

  const showBrokerCol = !brokerName;
  const colCount = showBrokerCol ? 10 : 9;
  const splitCol = 5; // E
  const lastColLetter = showBrokerCol ? "J" : "I";

  const typeLabel = txnType === "Buy" ? "Purchases" : txnType === "Sell" ? "Sales" : "All Transactions";
  const statusLabel = status ? capitalize(status) : "All";
  const fmtBarDate = (d) => { if (!d) return null; const [y, m, dd] = d.split("-"); return `${dd}-${m}-${y}`; };
  const periodLabel = (dateFrom || dateTo) ? `${fmtBarDate(dateFrom) || "Start"} to ${fmtBarDate(dateTo) || "Present"}` : null;

  // ── Colors ──────────────────────────────────────────────────
  const navy = "0A2540";
  const green = "00843D";
  const redFont = "C83232";
  const sellRed = "C83232";
  const lightBg = "F8FAFC";
  const totalBg = "E6ECF2";
  const thinBorder = { style: "thin", color: { argb: "FFDCE0E4" } };
  const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  // ── Column widths ──────────────────────────────────────────
  if (showBrokerCol) {
    ws.columns = [
      { width: 6 },   // A: #
      { width: 14 },  // B: Date
      { width: 16 },  // C: Company
      { width: 8 },   // D: Type
      { width: 12 },  // E: Quantity
      { width: 12 },  // F: Price
      { width: 14 },  // G: Fees
      { width: 16 },  // H: Grand Total
      { width: 28 },  // I: Broker
      { width: 12 },  // J: Status
    ];
  } else {
    ws.columns = [
      { width: 6 },   // A: #
      { width: 14 },  // B: Date
      { width: 22 },  // C: Company
      { width: 8 },   // D: Type
      { width: 14 },  // E: Quantity
      { width: 14 },  // F: Price
      { width: 16 },  // G: Fees
      { width: 18 },  // H: Grand Total
      { width: 12 },  // I: Status
    ];
  }

  // ── Helpers ─────────────────────────────────────────────────
  const fillNavy = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };
    }
  };
  const fillCds = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      cell.border = border;
    }
  };

  // ── Row 1: Title bar ───────────────────────────────────────
  const row1 = ws.getRow(1);
  row1.height = 28;
  fillNavy(row1);
  ws.mergeCells(1, 1, 2, 1); // A1:A2 for logo
  row1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };

  if (logoUrl) {
    try {
      const logoBase64 = await loadStyledLogoBase64(logoUrl, 128);
      if (!logoBase64) throw new Error("Logo failed to load");
      const base64Data = logoBase64.split(",")[1];
      const imgId = wb.addImage({ base64: base64Data, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0.2, row: 0.05 }, ext: { width: 40, height: 40 } });
    } catch (e) { /* skip logo on error */ }
  }

  // Title in B1:D1
  const titleCell = row1.getCell(2);
  titleCell.value = "Investors Portal";
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(1, 2, 1, splitCol - 1);

  // Report name in E1:last col row 2
  const reportCell = row1.getCell(splitCol);
  reportCell.value = "Transaction History";
  reportCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
  reportCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(1, splitCol, 2, colCount);

  // ── Row 2: Motto ───────────────────────────────────────────
  const row2 = ws.getRow(2);
  row2.height = 20;
  fillNavy(row2);
  const mottoCell = row2.getCell(2);
  mottoCell.value = "Manage Your Investments Digitally";
  mottoCell.font = { italic: true, color: { argb: "FFA0AFC3" }, size: 10 };
  mottoCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(2, 2, 2, splitCol - 1);

  // ── Row 3: Separator ───────────────────────────────────────
  ws.getRow(3).height = 6;

  // ── Row 4: CDS details bar ─────────────────────────────────
  const row4 = ws.getRow(4);
  row4.height = 22;
  fillCds(row4);
  const cdsLeft = row4.getCell(1);
  cdsLeft.value = `${cdsNumber}${cdsName ? ` — ${cdsName}` : ""}`;
  cdsLeft.font = { bold: true, color: { argb: `FF${navy}` }, size: 10 };
  cdsLeft.alignment = { vertical: "middle" };
  ws.mergeCells(4, 1, 4, splitCol - 1);

  const rightParts = [typeLabel];
  if (brokerName) rightParts.push(brokerName);
  if (periodLabel) rightParts.push(periodLabel);
  rightParts.push(`Status: ${statusLabel}`);
  const cdsRight = row4.getCell(splitCol);
  cdsRight.value = rightParts.join("  |  ");
  cdsRight.font = { bold: true, color: { argb: "FF6E6E6E" }, size: 10 };
  cdsRight.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(4, splitCol, 4, colCount);

  // ── Row 5: Separator ───────────────────────────────────────
  ws.getRow(5).height = 6;

  // ── Row 6: Table headers ───────────────────────────────────
  const headers = ["#", "Date", "Company", "Type", "Quantity", "Price", "Fees", "Grand Total"];
  if (showBrokerCol) headers.push("Broker");
  headers.push("Status");

  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(1 + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${green}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });

  // ── Style helpers ──────────────────────────────────────────
  const applyCell = (cell, { isAlt = false, isSell = false, halign = "left", bold = false, isTotalRow = false, isSellTotal = false } = {}) => {
    const bgColor = isTotalRow ? totalBg : (isAlt ? lightBg : "FFFFFF");
    const txtColor = isTotalRow ? (isSellTotal ? sellRed : navy) : (isSell ? sellRed : "373737");
    cell.font = { size: 11, color: { argb: `FF${txtColor}` }, bold: bold || isTotalRow };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgColor}` } };
    cell.border = border;
    cell.alignment = { horizontal: halign, vertical: "middle" };
  };
  const applyNum = (cell, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.numFmt = "#,##0";
  };
  const applyDash = (cell, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.font = { ...cell.font, color: { argb: "FF999999" } };
  };
  const applyStatus = (cell, statusVal, opts = {}) => {
    applyCell(cell, { ...opts, halign: "center" });
    const st = (statusVal || "").toLowerCase();
    if (st === "confirmed") cell.font = { ...cell.font, color: { argb: "FF1E64B4" } };
    else if (st === "rejected") cell.font = { ...cell.font, color: { argb: `FF${sellRed}` } };
    else if (st === "pending") cell.font = { ...cell.font, color: { argb: "FFB48200" } };
    // verified keeps normal row color
  };

  // ── Data rows ──────────────────────────────────────────────
  let r = 7;
  let buyQty = 0, buyFees = 0, buyGrand = 0;
  let sellQty = 0, sellFees = 0, sellGrand = 0;

  transactions.forEach((t, i) => {
    const isAlt = i % 2 === 0;
    const isSell = t.type === "Sell";
    const qty = Number(t.qty || 0);
    const price = Number(t.price || 0);
    const fees = Number(t.fees || 0);
    const total = Number(t.total || 0);
    const grand = isSell ? total - fees : total + fees;
    if (isSell) { sellQty += qty; sellFees += fees; sellGrand += grand; }
    else { buyQty += qty; buyFees += fees; buyGrand += grand; }

    const row = ws.getRow(r++);
    const c = (n) => row.getCell(n);
    let col = 1;

    c(col).value = i + 1; applyCell(c(col), { isAlt, isSell, halign: "center" }); col++;
    c(col).value = fmtDateCell(t.date); applyCell(c(col), { isAlt, isSell, halign: "center" }); col++;
    c(col).value = t.company_name || "—"; applyCell(c(col), { isAlt, isSell }); col++;
    c(col).value = t.type || "—"; applyCell(c(col), { isAlt, isSell, halign: "center" }); col++;
    c(col).value = f(qty); applyNum(c(col), { isAlt, isSell }); col++;
    c(col).value = f(price); applyNum(c(col), { isAlt, isSell }); col++;
    c(col).value = f(fees); applyNum(c(col), { isAlt, isSell }); col++;
    c(col).value = f(grand); applyNum(c(col), { isAlt, isSell, bold: true }); col++;
    if (showBrokerCol) { c(col).value = t.broker_name || "—"; applyCell(c(col), { isAlt, isSell }); col++; }
    c(col).value = capitalize(t.status); applyStatus(c(col), t.status, { isAlt, isSell });
  });

  // ── Total rows ─────────────────────────────────────────────
  const hasBuys = buyQty > 0;
  const hasSells = sellQty > 0;

  const writeTotalRow = (label, qty, fees, grand, isSellTotal = false) => {
    const row = ws.getRow(r++);
    const c = (n) => row.getCell(n);
    let col = 1;
    // Merge first 3 columns for label
    c(col).value = label; applyCell(c(col), { isTotalRow: true, isSellTotal });
    c(col).alignment = { vertical: "middle" };
    col++;
    c(col).value = ""; applyCell(c(col), { isTotalRow: true, isSellTotal }); col++;
    c(col).value = ""; applyCell(c(col), { isTotalRow: true, isSellTotal }); col++;
    ws.mergeCells(r - 1, 1, r - 1, 3);
    c(col).value = ""; applyCell(c(col), { isTotalRow: true, isSellTotal, halign: "center" }); col++;
    c(col).value = f(qty); applyNum(c(col), { isTotalRow: true, isSellTotal }); col++;
    c(col).value = "—"; applyDash(c(col), { isTotalRow: true, isSellTotal }); col++;
    c(col).value = f(fees); applyNum(c(col), { isTotalRow: true, isSellTotal }); col++;
    c(col).value = f(grand); applyNum(c(col), { isTotalRow: true, isSellTotal }); col++;
    if (showBrokerCol) { c(col).value = "—"; applyDash(c(col), { isTotalRow: true, isSellTotal }); col++; }
    c(col).value = "—"; applyDash(c(col), { isTotalRow: true, isSellTotal });
  };

  if (hasBuys) writeTotalRow(hasSells ? "TOTAL PURCHASES" : "TOTAL", buyQty, buyFees, buyGrand, false);
  if (hasSells) writeTotalRow(hasBuys ? "TOTAL SALES" : "TOTAL", sellQty, sellFees, sellGrand, true);

  // ── Print setup ─────────────────────────────────────────────
  const lastRow = r - 1;
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 100,
    printArea: `A1:${lastColLetter}${lastRow}`,
    margins: {
      left: 1.8 / 2.54,
      right: 1.8 / 2.54,
      top: 1.9 / 2.54,
      bottom: 1.9 / 2.54,
      header: 0.8 / 2.54,
      footer: 0.8 / 2.54,
    },
    horizontalCentered: true,
  };
  ws.headerFooter = {
    oddFooter: "&LInvestors Portal&RPage &P of &N",
  };

  // ── Write & download ───────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Transaction_History_${cdsNumber}_${dateFrom || "all"}_to_${dateTo || "all"}.xlsx`
  );
}

// ── 10. Gain/Loss Excel (Reports Module) ────────────────────────
export async function generateGainLossExcel({ cdsNumber, cdsName, glView = "company", holdings, sells, dateFrom, dateTo, brokerName, logoUrl }) {
  const wb = new ExcelJS.Workbook();
  const isByTxn = glView === "transaction";
  const ws = wb.addWorksheet(isByTxn ? "By Transaction" : "By Company");
  const f = (n) => Math.round(Number(n || 0));
  const fmtInt = (n) => { const v = Number(n || 0); return v === 0 ? "—" : Math.round(v).toLocaleString("en-US"); };
  const retFmt = (v) => { const n = Number(v || 0); return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; };
  const fmtBarDate = (d) => { if (!d) return null; const [y, m, dd] = d.split("-"); return `${dd}-${m}-${y}`; };
  const fmtDateCell = (d) => { if (!d) return "—"; const [y, m, dd] = d.split("-"); return `${dd}-${m}-${y}`; };

  const colCount = isByTxn ? 10 : 9;
  const splitCol = 5;
  const lastColLetter = isByTxn ? "J" : "I";

  // ── Colors ──────────────────────────────────────────────────
  const navy = "0A2540";
  const green = "00843D";
  const greenFont = "00843D";
  const redFont = "C83232";
  const lightBg = "F8FAFC";
  const totalBg = "E6ECF2";
  const thinBorder = { style: "thin", color: { argb: "FFDCE0E4" } };
  const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  // ── Column widths ──────────────────────────────────────────
  if (isByTxn) {
    ws.columns = [
      { width: 6 },   // A: #
      { width: 14 },  // B: Date
      { width: 20 },  // C: Company
      { width: 12 },  // D: Qty Sold
      { width: 14 },  // E: Sell Price
      { width: 12 },  // F: Sell Fees
      { width: 16 },  // G: FIFO Cost
      { width: 16 },  // H: Proceeds
      { width: 16 },  // I: Realized G/L
      { width: 14 },  // J: Return
    ];
  } else {
    ws.columns = [
      { width: 6 },   // A: #
      { width: 24 },  // B: Company
      { width: 12 },  // C: Bought
      { width: 12 },  // D: Sold
      { width: 12 },  // E: Balance
      { width: 16 },  // F: Cost Basis
      { width: 16 },  // G: Proceeds
      { width: 16 },  // H: Realized G/L
      { width: 14 },  // I: Return
    ];
  }

  // ── Helpers ─────────────────────────────────────────────────
  const fillNavy = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };
    }
  };
  const fillCds = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      cell.border = border;
    }
  };

  // ── Row 1: Title bar ───────────────────────────────────────
  const row1 = ws.getRow(1);
  row1.height = 28;
  fillNavy(row1);
  ws.mergeCells(1, 1, 2, 1); // A1:A2 for logo
  row1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };

  if (logoUrl) {
    try {
      const logoBase64 = await loadStyledLogoBase64(logoUrl, 128);
      if (!logoBase64) throw new Error("Logo failed to load");
      const base64Data = logoBase64.split(",")[1];
      const imgId = wb.addImage({ base64: base64Data, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0.2, row: 0.05 }, ext: { width: 40, height: 40 } });
    } catch (e) { /* skip logo on error */ }
  }

  const titleCell = row1.getCell(2);
  titleCell.value = "Investors Portal";
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(1, 2, 1, splitCol - 1);

  const reportCell = row1.getCell(splitCol);
  reportCell.value = "Gain/Loss Report (FIFO)";
  reportCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
  reportCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(1, splitCol, 2, colCount);

  // ── Row 2: Motto ───────────────────────────────────────────
  const row2 = ws.getRow(2);
  row2.height = 20;
  fillNavy(row2);
  const mottoCell = row2.getCell(2);
  mottoCell.value = "Manage Your Investments Digitally";
  mottoCell.font = { italic: true, color: { argb: "FFA0AFC3" }, size: 10 };
  mottoCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(2, 2, 2, splitCol - 1);

  // ── Row 3: Separator ───────────────────────────────────────
  ws.getRow(3).height = 6;

  // ── Row 4: CDS details bar ─────────────────────────────────
  const row4 = ws.getRow(4);
  row4.height = 22;
  fillCds(row4);
  const cdsLeft = row4.getCell(1);
  cdsLeft.value = `${cdsNumber}${cdsName ? ` — ${cdsName}` : ""}`;
  cdsLeft.font = { bold: true, color: { argb: `FF${navy}` }, size: 10 };
  cdsLeft.alignment = { vertical: "middle" };
  ws.mergeCells(4, 1, 4, splitCol - 1);

  const viewLabel = isByTxn ? "By Transaction" : "By Company";
  const rightParts = [viewLabel];
  if (isByTxn && brokerName) rightParts.push(brokerName);
  const periodLabel = (dateFrom || dateTo) ? `${fmtBarDate(dateFrom) || "Start"} to ${fmtBarDate(dateTo) || "Present"}` : null;
  if (periodLabel) rightParts.push(periodLabel);
  const cdsRight = row4.getCell(splitCol);
  cdsRight.value = rightParts.join("  |  ");
  cdsRight.font = { bold: true, color: { argb: "FF6E6E6E" }, size: 10 };
  cdsRight.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(4, splitCol, 4, colCount);

  // ── Row 5: Separator ───────────────────────────────────────
  ws.getRow(5).height = 6;

  // ── Row 6: Table headers ───────────────────────────────────
  const headers = isByTxn
    ? ["#", "Date", "Company", "Qty Sold", "Sell Price", "Sell Fees", "FIFO Cost", "Proceeds", "Realized G/L", "Return"]
    : ["#", "Company", "Bought", "Sold", "Balance", "Cost Basis", "Proceeds", "Realized G/L", "Return"];

  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(1 + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${green}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });

  // ── Style helpers ──────────────────────────────────────────
  const applyCell = (cell, { isAlt = false, halign = "left", bold = false, isTotalRow = false } = {}) => {
    const bgColor = isTotalRow ? totalBg : (isAlt ? lightBg : "FFFFFF");
    const txtColor = isTotalRow ? navy : "373737";
    cell.font = { size: 11, color: { argb: `FF${txtColor}` }, bold: bold || isTotalRow };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgColor}` } };
    cell.border = border;
    cell.alignment = { horizontal: halign, vertical: "middle" };
  };
  const applyNum = (cell, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.numFmt = "#,##0";
  };
  const applyDash = (cell, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.font = { ...cell.font, color: { argb: "FF999999" } };
  };
  const applyGL = (cell, value, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right", bold: !opts.isTotalRow });
    cell.numFmt = "#,##0";
    cell.font = { ...cell.font, color: { argb: `FF${value >= 0 ? greenFont : redFont}` } };
  };
  const applyRet = (cell, value, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.font = { ...cell.font, color: { argb: `FF${value >= 0 ? greenFont : redFont}` } };
  };

  // ── Data rows ──────────────────────────────────────────────
  let r = 7;
  const glColIdx = isByTxn ? 9 : 8;  // 1-based column index
  const retColIdx = isByTxn ? 10 : 9;

  if (isByTxn) {
    let totQty = 0, totFifoCost = 0, totProceeds = 0, totGL = 0;

    sells.forEach((s, i) => {
      const isAlt = i % 2 === 0;
      const qty = Number(s.qty || 0);
      const fifoCost = Number(s.fifoCost || 0);
      const proceeds = Number(s.proceeds || 0);
      const gl = Number(s.gl || 0);
      totQty += qty; totFifoCost += fifoCost; totProceeds += proceeds; totGL += gl;

      const row = ws.getRow(r++);
      const c = (n) => row.getCell(n);
      c(1).value = i + 1; applyCell(c(1), { isAlt, halign: "center" });
      c(2).value = fmtDateCell(s.date); applyCell(c(2), { isAlt, halign: "center" });
      c(3).value = s.companyName || "—"; applyCell(c(3), { isAlt });
      c(4).value = fmtInt(qty); applyNum(c(4), { isAlt });
      c(5).value = f(s.sellPrice); applyNum(c(5), { isAlt });
      c(6).value = f(s.sellFees); applyNum(c(6), { isAlt });
      c(7).value = f(fifoCost); applyNum(c(7), { isAlt });
      c(8).value = f(proceeds); applyNum(c(8), { isAlt });
      c(9).value = f(gl); applyGL(c(9), gl, { isAlt });
      c(10).value = retFmt(s.retPct); applyRet(c(10), s.retPct, { isAlt });
    });

    // Total row
    const totRet = totFifoCost > 0 ? (totGL / totFifoCost) * 100 : 0;
    const row = ws.getRow(r++);
    const c = (n) => row.getCell(n);
    ws.mergeCells(r - 1, 1, r - 1, 3);
    c(1).value = "TOTAL"; applyCell(c(1), { isTotalRow: true, halign: "center" });
    c(4).value = fmtInt(totQty); applyNum(c(4), { isTotalRow: true });
    c(5).value = "—"; applyDash(c(5), { isTotalRow: true });
    c(6).value = "—"; applyDash(c(6), { isTotalRow: true });
    c(7).value = f(totFifoCost); applyNum(c(7), { isTotalRow: true });
    c(8).value = f(totProceeds); applyNum(c(8), { isTotalRow: true });
    c(9).value = f(totGL); applyGL(c(9), totGL, { isTotalRow: true });
    c(10).value = retFmt(totRet); applyRet(c(10), totRet, { isTotalRow: true });
  } else {
    let totBought = 0, totSold = 0, totHeld = 0, totCost = 0, totProceeds = 0, totGL = 0;

    holdings.forEach((h, i) => {
      const isAlt = i % 2 === 0;
      const bought = Number(h.total_bought || 0);
      const sold = Number(h.total_sold || 0);
      const held = Number(h.shares_held || 0);
      const cost = Number(h.sold_cost || 0);
      const proc = Number(h.sold_proceeds || 0);
      const gl = Number(h.realized_gl || 0);
      totBought += bought; totSold += sold; totHeld += held;
      totCost += cost; totProceeds += proc; totGL += gl;

      const row = ws.getRow(r++);
      const c = (n) => row.getCell(n);
      c(1).value = i + 1; applyCell(c(1), { isAlt, halign: "center" });
      c(2).value = h.companyName || "—"; applyCell(c(2), { isAlt });
      c(3).value = fmtInt(bought); applyNum(c(3), { isAlt });
      c(4).value = fmtInt(sold); applyNum(c(4), { isAlt });
      c(5).value = fmtInt(held); applyNum(c(5), { isAlt });
      c(6).value = f(cost); applyNum(c(6), { isAlt });
      c(7).value = f(proc); applyNum(c(7), { isAlt });
      c(8).value = f(gl); applyGL(c(8), gl, { isAlt });
      c(9).value = retFmt(h.realized_ret_pct); applyRet(c(9), h.realized_ret_pct, { isAlt });
    });

    // Total row
    const totRet = totCost > 0 ? (totGL / totCost) * 100 : 0;
    const row = ws.getRow(r++);
    const c = (n) => row.getCell(n);
    ws.mergeCells(r - 1, 1, r - 1, 2);
    c(1).value = "TOTAL"; applyCell(c(1), { isTotalRow: true, halign: "center" });
    c(3).value = fmtInt(totBought); applyNum(c(3), { isTotalRow: true });
    c(4).value = fmtInt(totSold); applyNum(c(4), { isTotalRow: true });
    c(5).value = fmtInt(totHeld); applyNum(c(5), { isTotalRow: true });
    c(6).value = f(totCost); applyNum(c(6), { isTotalRow: true });
    c(7).value = f(totProceeds); applyNum(c(7), { isTotalRow: true });
    c(8).value = f(totGL); applyGL(c(8), totGL, { isTotalRow: true });
    c(9).value = retFmt(totRet); applyRet(c(9), totRet, { isTotalRow: true });
  }

  // ── Print setup ─────────────────────────────────────────────
  const lastRow = r - 1;
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 100,
    printArea: `A1:${lastColLetter}${lastRow}`,
    margins: {
      left: 1.8 / 2.54,
      right: 1.8 / 2.54,
      top: 1.9 / 2.54,
      bottom: 1.9 / 2.54,
      header: 0.8 / 2.54,
      footer: 0.8 / 2.54,
    },
    horizontalCentered: true,
  };
  ws.headerFooter = {
    oddFooter: "&LInvestors Portal&RPage &P of &N",
  };

  // ── Write & download ───────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Gain_Loss_${cdsNumber}_${dateFrom || "all"}_to_${dateTo || "all"}.xlsx`
  );
}

// ── 11. Dividend Income PDF (Reports Module) ────────────────────
export async function generateDividendIncomePDF({ cdsNumber, cdsName, divView = "company", dividends, byCompany, dateFrom, dateTo, status, companyPriceMap = {}, logoUrl }) {
  const { doc, pw, ph, ml, mr, cw } = v2InitDoc();
  const f = v2f;
  const isByTxn = divView === "transaction";

  const logoData = logoUrl ? await loadStyledLogoBase64(logoUrl, 128) : null;
  v2DrawHeader(doc, logoData, "Dividend Income", { pw, ml, mr });

  const viewLabel = isByTxn ? "By Transaction" : "By Company";
  let cdsBarRight = viewLabel;
  if (status && status !== "All") cdsBarRight += `  |  ${status === "ex_date_passed" ? "Ex-Date Passed" : status.charAt(0).toUpperCase() + status.slice(1)}`;
  if (dateFrom || dateTo) cdsBarRight += `  |  ${v2fmtDate(dateFrom || "")} to ${v2fmtDate(dateTo || "")}`;
  let y = v2DrawCdsBar(doc, { cdsNumber, cdsName, rightText: cdsBarRight, pw, ml, mr, cw });

  let tableHead, tableBody, totalRowIdx, columnStyles;

  if (isByTxn) {
    // ── By Transaction view ──────────────────────────────────
    const fmtDateCell = (d) => { if (!d) return "—"; const iso = d.substring(0, 10); const [yr, m, dd] = iso.split("-"); return `${dd}-${m}-${yr}`; };
    tableHead = [["#", "Date", "Company", "Type", "Per Share", "Shares", "Gross Amt", "Tax", "Net Amt", "Status", "Yield"]];

    let totGross = 0, totTax = 0, totNet = 0;

    tableBody = dividends.map((d, i) => {
      const gross = Number(d.total_amount || 0);
      const tax = Number(d.withholding_tax || 0);
      const net = Number(d.net_amount || 0) || (gross - tax);
      totGross += gross;
      totTax += tax;
      totNet += net;
      const typeLabel = d.dividend_type ? d.dividend_type.charAt(0).toUpperCase() + d.dividend_type.slice(1) : "—";
      const storedPrice = Number(d.market_price_at_payment || 0);
      const fallbackPrice = storedPrice > 0 ? 0 : Number(companyPriceMap[d.company_id] || 0);
      const mktPrice = storedPrice > 0 ? storedPrice : fallbackPrice;
      const isApprox = storedPrice === 0 && fallbackPrice > 0;
      const dps = Number(d.dividend_per_share || 0);
      const yieldLabel = d.status === "paid" && mktPrice > 0 && dps > 0 ? `${isApprox ? "~" : ""}${((dps / mktPrice) * 100).toFixed(1)}%` : "—";
      return [
        i + 1,
        fmtDateCell(d.payment_date || d.declaration_date),
        d.company_name || "—",
        typeLabel,
        f(d.dividend_per_share),
        v2fmtInt(d.shares_held),
        f(gross),
        f(tax),
        f(net),
        d.status === "ex_date_passed" ? "Ex-Date" : d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : "—",
        yieldLabel,
      ];
    });

    tableBody.push([
      "", "TOTAL", "", "", "—", "—",
      f(totGross), f(totTax), f(totNet), "—", "—",
    ]);

    totalRowIdx = tableBody.length - 1;

    // 11 cols, cw=269: #10 + Date24 + Company44 + Type14 + PerShare24 + Shares20 + Gross32 + Tax28 + Net32 + Status20 + Yield21 = 269
    columnStyles = {
      0:  { halign: "center", cellWidth: 10 },
      1:  { halign: "center", cellWidth: 24 },
      2:  { cellWidth: 44 },
      3:  { halign: "center", cellWidth: 14 },
      4:  { halign: "right",  cellWidth: 24 },
      5:  { halign: "right",  cellWidth: 20 },
      6:  { halign: "right",  cellWidth: 32 },
      7:  { halign: "right",  cellWidth: 28 },
      8:  { halign: "right",  cellWidth: 32 },
      9:  { halign: "center", cellWidth: 20 },
      10: { halign: "right",  cellWidth: 21 },
    };
  } else {
    // ── By Company view ──────────────────────────────────────
    tableHead = [["#", "Company", "Dividends", "Gross Amount", "Tax", "Net Amount", "Avg DPS", "Last Payment"]];

    let totCount = 0, totGross = 0, totTax = 0, totNet = 0;

    tableBody = byCompany.map((d, i) => {
      const count = Number(d.dividend_count || 0);
      const gross = Number(d.total_gross || 0);
      const tax = Number(d.total_tax || 0);
      const net = Number(d.total_net || 0);
      totCount += count;
      totGross += gross;
      totTax += tax;
      totNet += net;
      return [
        i + 1,
        d.company_name || "—",
        count,
        f(gross),
        f(tax),
        f(net),
        f(d.avg_dps),
        d.last_payment_date ? v2fmtDate(d.last_payment_date) : "—",
      ];
    });

    tableBody.push([
      "", "TOTAL", totCount, f(totGross), f(totTax), f(totNet), "—", "—",
    ]);

    totalRowIdx = tableBody.length - 1;

    // 8 cols, cw=269: #10 + Company60 + Divs20 + Gross40 + Tax36 + Net40 + AvgDPS30 + LastPay33 = 269
    columnStyles = {
      0: { halign: "center", cellWidth: 10 },
      1: { cellWidth: 60 },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "right", cellWidth: 40 },
      4: { halign: "right", cellWidth: 36 },
      5: { halign: "right", cellWidth: 40 },
      6: { halign: "right", cellWidth: 30 },
      7: { halign: "center", cellWidth: 33 },
    };
  }

  doc.autoTable({
    startY: y,
    margin: { left: ml, right: mr },
    head: tableHead,
    body: tableBody,
    tableWidth: cw,
    ...v2TableBase(),
    columnStyles,
    didParseCell(data) {
      // Total row styling
      if (data.section === "body" && data.row.index === totalRowIdx) {
        data.cell.styles.fillColor = [230, 236, 242];
        data.cell.styles.textColor = C.navy;
        data.cell.styles.fontStyle = "bold";
      }
      // Tax column — red
      const taxCol = isByTxn ? 7 : 4;
      if (data.section === "body" && data.column.index === taxCol) {
        const num = Number(String(data.cell.raw).replace(/[^0-9.-]/g, ""));
        if (num > 0) data.cell.styles.textColor = [200, 50, 50];
      }
      // Net column — green (bold)
      const netCol = isByTxn ? 8 : 5;
      if (data.section === "body" && data.column.index === netCol) {
        const num = Number(String(data.cell.raw).replace(/[^0-9.-]/g, ""));
        if (num > 0) data.cell.styles.textColor = C.green;
        if (data.row.index !== totalRowIdx) data.cell.styles.fontStyle = "bold";
      }
      // Status column colors (By Transaction only)
      if (isByTxn && data.section === "body" && data.column.index === 9 && data.row.index !== totalRowIdx) {
        const val = String(data.cell.raw);
        if (val === "Confirmed" || val === "Ex-Date") data.cell.styles.textColor = [30, 100, 180];
        else if (val === "Rejected") data.cell.styles.textColor = [200, 50, 50];
        else if (val === "Pending" || val === "Declared") data.cell.styles.textColor = [180, 130, 0];
        else if (val === "Paid") data.cell.styles.textColor = C.green;
      }
      // Yield column — green (By Transaction only)
      if (isByTxn && data.section === "body" && data.column.index === 10 && data.row.index !== totalRowIdx) {
        const val = String(data.cell.raw);
        if (val !== "—") data.cell.styles.textColor = C.green;
      }
      // Dash cells — muted gray
      if (data.section === "body" && data.cell.raw === "—") {
        data.cell.styles.textColor = [153, 153, 153];
      }
    },
  });

  v2DrawFooter(doc, { pw, ph, ml, mr });

  const dateLabel = dateFrom || dateTo ? `${dateFrom || "all"}_to_${dateTo || "all"}` : "all";
  doc.setProperties({ title: "Dividend Income", subject: `${cdsNumber} — Dividend Income` });
  const blobUrl = doc.output("bloburl", { filename: `Dividend_Income_${cdsNumber}_${dateLabel}.pdf` });
  window.open(blobUrl, "_blank");
}

// ── 12. Dividend Income Excel (Reports Module) ──────────────────
export async function generateDividendIncomeExcel({ cdsNumber, cdsName, divView = "company", dividends, byCompany, dateFrom, dateTo, status, companyPriceMap = {}, logoUrl }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dividend Income");
  const f = (n) => Math.round(Number(n || 0));
  const fmtBarDate = (d) => d ? v2fmtDate(d) : "";
  const fmtDateCell = (d) => { if (!d) return "—"; const iso = d.substring(0, 10); const [yr, m, dd] = iso.split("-"); return `${dd}-${m}-${yr}`; };
  const isByTxn = divView === "transaction";

  const colCount = isByTxn ? 11 : 8;
  const splitCol = isByTxn ? 5 : 4;
  const lastColLetter = isByTxn ? "K" : String.fromCharCode(64 + colCount);

  // ── Colors ──────────────────────────────────────────────────
  const navy = "0A2540";
  const green = "00843D";
  const redFont = "C83232";
  const lightBg = "F8FAFC";
  const totalBg = "E6ECF2";
  const thinBorder = { style: "thin", color: { argb: "FFDCE0E4" } };
  const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  // ── Column widths ──────────────────────────────────────────
  if (isByTxn) {
    ws.columns = [
      { width: 6 },   // A: #
      { width: 14 },  // B: Date
      { width: 22 },  // C: Company
      { width: 12 },  // D: Type
      { width: 12 },  // E: Per Share
      { width: 10 },  // F: Shares
      { width: 14 },  // G: Gross Amt
      { width: 12 },  // H: Tax
      { width: 14 },  // I: Net Amt
      { width: 10 },  // J: Status
      { width: 10 },  // K: Yield
    ];
  } else {
    ws.columns = [
      { width: 6 },   // A: #
      { width: 26 },  // B: Company
      { width: 12 },  // C: Dividends
      { width: 18 },  // D: Gross Amount
      { width: 16 },  // E: Tax
      { width: 18 },  // F: Net Amount
      { width: 14 },  // G: Avg DPS
      { width: 16 },  // H: Last Payment
    ];
  }

  // ── Helper: fill all cells in row with navy bg ─────────────
  const fillNavy = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };
    }
  };
  const fillCds = (row) => {
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (!cell.value) cell.value = "";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      cell.border = border;
    }
  };

  // ── Row 1: Title bar ───────────────────────────────────────
  const row1 = ws.getRow(1);
  row1.height = 28;
  fillNavy(row1);
  ws.mergeCells(1, 1, 2, 1); // A1:A2 for logo
  row1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };

  if (logoUrl) {
    try {
      const logoBase64 = await loadStyledLogoBase64(logoUrl, 128);
      if (!logoBase64) throw new Error("Logo failed to load");
      const base64Data = logoBase64.split(",")[1];
      const imgId = wb.addImage({ base64: base64Data, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0.2, row: 0.05 }, ext: { width: 40, height: 40 } });
    } catch (e) { /* skip logo on error */ }
  }

  const titleCell = row1.getCell(2);
  titleCell.value = "Investors Portal";
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(1, 2, 1, splitCol - 1);

  const reportCell = row1.getCell(splitCol);
  reportCell.value = "Dividend Income";
  reportCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
  reportCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(1, splitCol, 2, colCount);

  // ── Row 2: Motto ───────────────────────────────────────────
  const row2 = ws.getRow(2);
  row2.height = 20;
  fillNavy(row2);
  const mottoCell = row2.getCell(2);
  mottoCell.value = "Manage Your Investments Digitally";
  mottoCell.font = { italic: true, color: { argb: "FFA0AFC3" }, size: 10 };
  mottoCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.mergeCells(2, 2, 2, splitCol - 1);

  // ── Row 3: Separator ───────────────────────────────────────
  ws.getRow(3).height = 6;

  // ── Row 4: CDS details bar ─────────────────────────────────
  const row4 = ws.getRow(4);
  row4.height = 22;
  fillCds(row4);
  const cdsLeft = row4.getCell(1);
  cdsLeft.value = `${cdsNumber}${cdsName ? ` — ${cdsName}` : ""}`;
  cdsLeft.font = { bold: true, color: { argb: `FF${navy}` }, size: 10 };
  cdsLeft.alignment = { vertical: "middle" };
  ws.mergeCells(4, 1, 4, splitCol - 1);

  const viewLabel = isByTxn ? "By Transaction" : "By Company";
  const rightParts = [viewLabel];
  if (isByTxn && status && status !== "All") rightParts.push(status === "ex_date_passed" ? "Ex-Date Passed" : status.charAt(0).toUpperCase() + status.slice(1));
  const periodLabel = (dateFrom || dateTo) ? `${fmtBarDate(dateFrom) || "Start"} to ${fmtBarDate(dateTo) || "Present"}` : null;
  if (periodLabel) rightParts.push(periodLabel);
  const cdsRight = row4.getCell(splitCol);
  cdsRight.value = rightParts.join("  |  ");
  cdsRight.font = { bold: true, color: { argb: "FF6E6E6E" }, size: 10 };
  cdsRight.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(4, splitCol, 4, colCount);

  // ── Row 5: Separator ───────────────────────────────────────
  ws.getRow(5).height = 6;

  // ── Row 6: Table headers ───────────────────────────────────
  const headers = isByTxn
    ? ["#", "Date", "Company", "Type", "Per Share", "Shares", "Gross Amt", "Tax", "Net Amt", "Status", "Yield"]
    : ["#", "Company", "Dividends", "Gross Amount", "Tax", "Net Amount", "Avg DPS", "Last Payment"];

  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(1 + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${green}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });

  // ── Style helpers ──────────────────────────────────────────
  const applyCell = (cell, { isAlt = false, halign = "left", bold = false, isTotalRow = false } = {}) => {
    const bgColor = isTotalRow ? totalBg : (isAlt ? lightBg : "FFFFFF");
    const txtColor = isTotalRow ? navy : "373737";
    cell.font = { size: 11, color: { argb: `FF${txtColor}` }, bold: bold || isTotalRow };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgColor}` } };
    cell.border = border;
    cell.alignment = { horizontal: halign, vertical: "middle" };
  };
  const applyNum = (cell, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.numFmt = "#,##0";
  };
  const applyDash = (cell, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.font = { ...cell.font, color: { argb: "FF999999" } };
  };
  const applyTax = (cell, value, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right" });
    cell.numFmt = "#,##0";
    if (value > 0) cell.font = { ...cell.font, color: { argb: `FF${redFont}` } };
  };
  const applyNet = (cell, value, opts = {}) => {
    applyCell(cell, { ...opts, halign: "right", bold: !opts.isTotalRow });
    cell.numFmt = "#,##0";
    if (value > 0) cell.font = { ...cell.font, color: { argb: `FF${green}` } };
  };
  const applyStatus = (cell, status, opts = {}) => {
    applyCell(cell, { ...opts, halign: "center" });
    if (status === "Paid") cell.font = { ...cell.font, color: { argb: `FF${green}` } };
    else if (status === "Declared" || status === "Ex-Date") cell.font = { ...cell.font, color: { argb: "FF1E64B4" } };
    else if (status === "Pending") cell.font = { ...cell.font, color: { argb: "FFB48200" } };
  };

  // ── Data rows ──────────────────────────────────────────────
  let r = 7;

  if (isByTxn) {
    let totGross = 0, totTax = 0, totNet = 0;

    dividends.forEach((d, i) => {
      const isAlt = i % 2 === 0;
      const gross = Number(d.total_amount || 0);
      const tax = Number(d.withholding_tax || 0);
      const net = Number(d.net_amount || 0) || (gross - tax);
      totGross += gross; totTax += tax; totNet += net;

      const row = ws.getRow(r++);
      const c = (n) => row.getCell(n);
      const statusLabel = d.status === "ex_date_passed" ? "Ex-Date" : d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : "—";
      const typeLabel = d.dividend_type ? d.dividend_type.charAt(0).toUpperCase() + d.dividend_type.slice(1) : "—";
      const storedPriceX = Number(d.market_price_at_payment || 0);
      const fallbackPriceX = storedPriceX > 0 ? 0 : Number(companyPriceMap[d.company_id] || 0);
      const mktPriceX = storedPriceX > 0 ? storedPriceX : fallbackPriceX;
      const isApproxX = storedPriceX === 0 && fallbackPriceX > 0;
      const dps = Number(d.dividend_per_share || 0);
      const yieldLabel = d.status === "paid" && mktPriceX > 0 && dps > 0 ? `${isApproxX ? "~" : ""}${((dps / mktPriceX) * 100).toFixed(1)}%` : "—";
      c(1).value = i + 1; applyCell(c(1), { isAlt, halign: "center" });
      c(2).value = fmtDateCell(d.payment_date || d.declaration_date); applyCell(c(2), { isAlt, halign: "center" });
      c(3).value = d.company_name || "—"; applyCell(c(3), { isAlt });
      c(4).value = typeLabel; applyCell(c(4), { isAlt, halign: "center" });
      c(5).value = f(d.dividend_per_share); applyNum(c(5), { isAlt });
      c(6).value = f(d.shares_held); applyNum(c(6), { isAlt });
      c(7).value = f(gross); applyNum(c(7), { isAlt });
      c(8).value = f(tax); applyTax(c(8), tax, { isAlt });
      c(9).value = f(net); applyNet(c(9), net, { isAlt });
      c(10).value = statusLabel; applyStatus(c(10), statusLabel, { isAlt });
      c(11).value = yieldLabel; applyCell(c(11), { isAlt, halign: "right" });
      if (yieldLabel !== "—") c(11).font = { ...c(11).font, color: { argb: `FF${green}` }, bold: true };
    });

    // Total row
    const row = ws.getRow(r++);
    const c = (n) => row.getCell(n);
    ws.mergeCells(r - 1, 1, r - 1, 4);
    c(1).value = "TOTAL"; applyCell(c(1), { isTotalRow: true, halign: "center" });
    c(5).value = "—"; applyDash(c(5), { isTotalRow: true });
    c(6).value = "—"; applyDash(c(6), { isTotalRow: true });
    c(7).value = f(totGross); applyNum(c(7), { isTotalRow: true });
    c(8).value = f(totTax); applyTax(c(8), totTax, { isTotalRow: true });
    c(9).value = f(totNet); applyNet(c(9), totNet, { isTotalRow: true });
    c(10).value = "—"; applyDash(c(10), { isTotalRow: true });
    c(11).value = "—"; applyDash(c(11), { isTotalRow: true });
  } else {
    let totCount = 0, totGross = 0, totTax = 0, totNet = 0;

    byCompany.forEach((d, i) => {
      const isAlt = i % 2 === 0;
      const count = Number(d.dividend_count || 0);
      const gross = Number(d.total_gross || 0);
      const tax = Number(d.total_tax || 0);
      const net = Number(d.total_net || 0);
      totCount += count; totGross += gross; totTax += tax; totNet += net;

      const row = ws.getRow(r++);
      const c = (n) => row.getCell(n);
      c(1).value = i + 1; applyCell(c(1), { isAlt, halign: "center" });
      c(2).value = d.company_name || "—"; applyCell(c(2), { isAlt });
      c(3).value = count; applyCell(c(3), { isAlt, halign: "center" });
      c(4).value = f(gross); applyNum(c(4), { isAlt });
      c(5).value = f(tax); applyTax(c(5), tax, { isAlt });
      c(6).value = f(net); applyNet(c(6), net, { isAlt });
      c(7).value = f(d.avg_dps); applyNum(c(7), { isAlt });
      c(8).value = d.last_payment_date ? fmtDateCell(d.last_payment_date) : "—"; applyCell(c(8), { isAlt, halign: "center" });
    });

    // Total row
    const row = ws.getRow(r++);
    const c = (n) => row.getCell(n);
    ws.mergeCells(r - 1, 1, r - 1, 2);
    c(1).value = "TOTAL"; applyCell(c(1), { isTotalRow: true, halign: "center" });
    c(3).value = totCount; applyCell(c(3), { isTotalRow: true, halign: "center" });
    c(4).value = f(totGross); applyNum(c(4), { isTotalRow: true });
    c(5).value = f(totTax); applyTax(c(5), totTax, { isTotalRow: true });
    c(6).value = f(totNet); applyNet(c(6), totNet, { isTotalRow: true });
    c(7).value = "—"; applyDash(c(7), { isTotalRow: true });
    c(8).value = "—"; applyDash(c(8), { isTotalRow: true });
  }

  // ── Print setup ─────────────────────────────────────────────
  const lastRow = r - 1;
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 100,
    printArea: `A1:${lastColLetter}${lastRow}`,
    margins: {
      left: 1.8 / 2.54,
      right: 1.8 / 2.54,
      top: 1.9 / 2.54,
      bottom: 1.9 / 2.54,
      header: 0.8 / 2.54,
      footer: 0.8 / 2.54,
    },
    horizontalCentered: true,
  };
  ws.headerFooter = {
    oddFooter: "&LInvestors Portal&RPage &P of &N",
  };

  // ── Write & download ───────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Dividend_Income_${cdsNumber}_${dateFrom || "all"}_to_${dateTo || "all"}.xlsx`
  );
}
