// ── src/pages/PropertyPage.jsx ────────────────────────────────────────────
// Property Rentals — native page, built in the app's own design system.
// Renders inside the existing shell (sidebar/topbar/theme). Uses useTheme()/C
// for every color so it is automatically on-brand and dark-mode correct, and
// reuses the shared ui.jsx components. UI-first: sample data is swapped for
// prop_* Supabase reads in the next step.
import { useState, useMemo } from "react";
import { useTheme, fmt, StatCard, SectionCard, Btn, ModalShell, FInput, FSelect } from "../components/ui";
import { Icon, IconBadge } from "../lib/icons";

/* ── sub-navigation within the Property tab ─────────────────────────────── */
const SECTIONS = [
  { id: "dashboard", label: "Dashboard",          icon: "home" },
  { id: "units",     label: "Properties & Units",  icon: "building" },
  { id: "ledger",    label: "Tenant Ledger",       icon: "fileText" },
  { id: "tenants",   label: "Tenants",             icon: "users" },
  { id: "expenses",  label: "Expenditures",        icon: "tag" },
  { id: "reports",   label: "Reports",             icon: "barChart" },
  { id: "company",   label: "Company",             icon: "briefcase" },
];

/* ── sample data (replaced by Supabase prop_* next) ─────────────────────── */
const UNITS = [
  { n: "Unit 1", ty: "Single",  rent: 900000,  who: "Sunday Mtaki",     stay: "23 mo", bal: 1800000,  st: "Arrears",    tone: "red",  feats: ["1 Bedroom","Lounge","Kitchen","Parking","Toilet","Bath"], svc: ["Metered water","Security guard","Garbage"] },
  { n: "Unit 2", ty: "Couples", rent: 900000,  who: "Muhamud Mukhsin",  stay: "23 mo", bal: 0,        st: "Current",    tone: "green", feats: ["1 Bedroom","Lounge","Kitchen","Parking","Toilet","Bath"], svc: ["Metered water","Security guard","WiFi ready"] },
  { n: "Unit 3", ty: "Family",  rent: 1200000, who: "Frederick Mbwana", stay: "5 mo",  bal: -2400000, st: "Paid ahead", tone: "green", feats: ["2 Bedroom","Lounge","Kitchen","Parking","2 Toilet","Bath"], svc: ["Metered water","Security guard","Garbage","Backup tank"] },
  { n: "Unit 4", ty: "Studio",  rent: 900000,  who: null,               stay: "—",     bal: 0,        st: "Vacant",     tone: "gray",  feats: ["1 Bedroom","Lounge","Kitchen","Parking","Toilet","Bath"], svc: ["Metered water","Security guard"] },
];
const LEDGER = [
  ["Jul 2024", 900000, "24 Jul · 900,000", "Paid (4d late)", "green", 0, ""],
  ["Aug 2024", 900000, "20 Aug · 900,000", "Paid on time", "green", 0, ""],
  ["Sep 2024", 900000, "22 Sep · 500,000", "Partial", "gold", 400000, "due"],
  ["Oct 2024", 900000, "—", "Missed", "red", 1300000, "due"],
  ["Nov 2024", 900000, "18 Nov · 2,500,000", "Lump (clears + advance)", "green", -300000, "cr"],
  ["Dec 2024", 900000, "28 Dec · 600,000", "Paid (late)", "green", 0, ""],
  ["Jan 2025", 900000, "20 Jan · 2,700,000", "3-month advance", "green", -1800000, "cr"],
  ["Feb 2025", 900000, "(prepaid)", "Paid in advance", "green", -900000, "cr"],
  ["Mar 2025", 900000, "(prepaid)", "Paid in advance", "green", 0, ""],
  ["Apr 2025", 900000, "20 Apr · 900,000", "Paid on time", "green", 0, ""],
  ["May 2025", 900000, "—", "Missed", "red", 900000, "due"],
  ["Jun 2025", 900000, "—", "Missed", "red", 1800000, "due"],
  ["Jul 2025", 900000, "25 Jul · 900,000", "Clears May (oldest)", "gold", 1800000, "due"],
  ["Aug 2025", 900000, "20 Aug · 1,800,000", "Clears Jun + Jul", "gold", 900000, "due"],
  ["Sep 2025", 900000, "19 Sep · 1,800,000", "Clears Aug + Sep", "green", 0, ""],
  ["Oct 2025", 900000, "—", "Missed", "red", 900000, "due"],
  ["Nov 2025", 900000, "20 Nov · 900,000", "Clears Oct", "red", 900000, "due"],
  ["Dec 2025", 900000, "20 Dec · 900,000", "Clears Nov", "red", 900000, "due"],
  ["Jan 2026", 900000, "—", "Missed", "red", 1800000, "due"],
  ["Feb 2026", 900000, "20 Feb · 900,000", "Clears Dec", "red", 1800000, "due"],
];
const ALLOC_QUEUE = [
  { lab: "Jan 2026", sub: "arrears", due: 900000 },
  { lab: "Feb 2026", sub: "arrears", due: 900000 },
  { lab: "Mar 2026", sub: "in advance", due: 900000 },
  { lab: "Apr 2026", sub: "in advance", due: 900000 },
];

/* ── tone → themed colors (from the app's C palette only) ───────────────── */
function tones(C) {
  return {
    green: { c: C.green, bg: C.greenBg, bd: C.green + "33" },
    red:   { c: C.red,   bg: C.redBg,   bd: C.red + "33" },
    gold:  { c: C.gold,  bg: C.gold + "1A", bd: C.gold + "44" },
    navy:  { c: C.navy === "#0B1F3A" ? C.navy : C.gold, bg: C.navy + "12", bd: C.navy + "22" },
    gray:  { c: C.gray500, bg: C.gray100, bd: C.gray200 },
  };
}
function Badge({ tone = "gray", icon, children }) {
  const { C } = useTheme();
  const t = tones(C)[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
      padding: "3px 9px", borderRadius: 20, color: t.c, background: t.bg, border: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>
      {icon && <Icon name={icon} size={11} stroke={t.c} sw={2.4} />}{children}
    </span>
  );
}

/* ── Unit card (native, compact, expandable) ───────────────────────────── */
function UnitCard({ u }) {
  const { C, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const t = tones(C)[u.tone];
  const balColor = u.bal > 0 ? C.red : (u.bal < 0 ? C.green : C.gray500);
  const balText  = u.bal > 0 ? fmt(u.bal) : (u.bal < 0 ? fmt(-u.bal) + " cr" : "0 · current");
  const vacant   = !u.who;
  return (
    <div style={{ background: C.white, border: `1px solid ${vacant ? C.gray400 + "66" : C.gray200}`,
      borderStyle: vacant ? "dashed" : "solid", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "12px 13px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <IconBadge name="building" color={vacant ? C.gray400 : C.navy} size={32} radius={9} isDark={isDark} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: vacant ? C.gray500 : C.text, lineHeight: 1.1 }}>{u.n}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{u.ty}{vacant ? " · vacant" : " unit"}</div>
          </div>
        </div>
        <Badge tone={u.tone} icon={u.tone === "red" ? "alertTriangle" : (u.tone === "green" ? "check" : undefined)}>{u.st}</Badge>
      </div>
      {/* rent */}
      <div style={{ padding: "11px 13px 10px", display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: vacant ? C.gray500 : C.text, fontVariantNumeric: "tabular-nums" }}>{fmt(u.rent)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.gray400 }}>TZS / mo</span>
      </div>
      {/* rows */}
      <div style={{ padding: "0 13px 8px", borderTop: `1px solid ${C.gray100}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 12 }}>
          <span style={{ color: C.gray500, fontSize: 10.5, fontWeight: 700 }}>Tenant</span>
          {vacant ? <span style={{ color: C.gray400 }}>— vacant —</span> : (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: C.text, minWidth: 0 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.navy + "18", color: C.navy === "#0B1F3A" ? C.navy : C.gold, fontSize: 9, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {u.who.split(" ").map(w => w[0]).slice(0, 2).join("")}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 96 }}>{u.who}</span>
              {u.stay !== "—" && <span style={{ fontSize: 9, fontWeight: 800, color: C.gray500, background: C.gray100, border: `1px solid ${C.gray200}`, padding: "1px 6px", borderRadius: 20 }}>{u.stay}</span>}
            </span>
          )}
        </div>
        {vacant ? (
          <div style={{ padding: "4px 0 10px" }}>
            <Btn variant="secondary" icon={<Icon name="plus" size={13} stroke={C.green} />} style={{ width: "100%", justifyContent: "center" }}>Assign Tenant / Lease</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 12, borderTop: `1px dashed ${C.gray100}` }}>
            <span style={{ color: C.gray500, fontSize: 10.5, fontWeight: 700 }}>Balance</span>
            <span style={{ fontWeight: 800, color: balColor, fontVariantNumeric: "tabular-nums" }}>{balText}</span>
          </div>
        )}
      </div>
      {/* expand footer */}
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 13px", background: C.gray50, borderTop: `1px solid ${C.gray100}`, cursor: "pointer", marginTop: "auto", userSelect: "none" }}>
        <span style={{ fontSize: 10, color: C.gray500, fontWeight: 600 }}>Type · features · services</span>
        <span style={{ fontSize: 10.5, color: C.green, fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
          {open ? "Hide" : "Details"}<Icon name="chevronDown" size={13} stroke={C.green} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </span>
      </div>
      {open && (
        <div style={{ padding: "11px 13px 13px", borderTop: `1px solid ${C.gray100}`, background: C.white }}>
          <Chips C={C} label="Unit type" items={[u.ty]} />
          <Chips C={C} label="General features" items={u.feats} />
          <Chips C={C} label="Other services" items={u.svc} accent />
        </div>
      )}
    </div>
  );
}
function Chips({ C, label, items, accent }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {items.map((it, i) => (
          <span key={i} style={{ fontSize: 10.5, fontWeight: 600,
            color: accent ? (C.navy === "#0B1F3A" ? C.navy : C.gold) : C.gray800,
            background: accent ? C.navy + "12" : C.gray50,
            border: `1px solid ${accent ? C.navy + "22" : C.gray200}`,
            padding: "3px 8px", borderRadius: 7 }}>{it}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Dashboard section ─────────────────────────────────────────────────── */
function DashboardView({ onPay }) {
  const { C, isDark } = useTheme();
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 12, marginBottom: 18 }}>
        <StatCard label="Rent Roll / mo"   value={fmt(3000000)}  sub="3 occupied"  color={C.navy}  icon={<Icon name="wallet" size={17} stroke={C.navy} />} />
        <StatCard label="Collected (Jun)"  value={fmt(2100000)}  sub="70% of roll" color={C.green} icon={<Icon name="dollarSign" size={17} stroke={C.green} />} />
        <StatCard label="Arrears"          value={fmt(1800000)}  sub="1 tenant"    color={C.red}   icon={<Icon name="alertTriangle" size={17} stroke={C.red} />} />
        <StatCard label="Occupancy"        value="75%"           sub="1 vacant"    color={C.gold}  icon={<Icon name="building" size={17} stroke={C.gold} />} />
        <StatCard label="Expenses (YTD)"   value={fmt(1500000)}  sub="1 item"      color={C.gold}  icon={<Icon name="tag" size={17} stroke={C.gold} />} />
        <StatCard label="Net Income (YTD)" value={fmt(18510000)} sub="rent − exp"  color={C.green} icon={<Icon name="trendingUp" size={17} stroke={C.green} />} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16, alignItems: "start" }} className="prop-grid2">
        <SectionCard title="Units at Ilazo" subtitle="3 / 4 occupied">
          <Table C={C}
            head={["Unit", "Tenant", "Rent", "Status", "Balance"]}
            align={[0, 0, 1, 0, 1]}
            rows={UNITS.map(u => [
              <span><b>{u.n}</b> <span style={{ color: C.gray400, fontSize: 11 }}>· {u.ty}</span></span>,
              u.who || <span style={{ color: C.gray400 }}>— vacant —</span>,
              fmt(u.rent),
              <Badge tone={u.tone}>{u.st}</Badge>,
              <span style={{ fontWeight: 700, color: u.bal > 0 ? C.red : (u.bal < 0 ? C.green : C.text) }}>{u.bal > 0 ? fmt(u.bal) : (u.bal < 0 ? fmt(-u.bal) + " cr" : "0")}</span>,
            ])}
          />
        </SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionCard title="Receivables — Aged">
            <Table C={C}
              head={["Tenant · Period", "Bucket", "Due"]}
              align={[0, 0, 1]}
              rows={[
                [<span><b>Sunday Mtaki</b><br /><span style={{ color: C.gray400, fontSize: 11 }}>Jan 2026 · Unit 1</span></span>, <Badge tone="gold">31–60d</Badge>, <b>{fmt(900000)}</b>],
                [<span><b>Sunday Mtaki</b><br /><span style={{ color: C.gray400, fontSize: 11 }}>Feb 2026 · Unit 1</span></span>, <Badge tone="red">0–30d</Badge>, <b>{fmt(900000)}</b>],
                [<b>Total arrears</b>, "", <b style={{ color: C.red }}>{fmt(1800000)}</b>],
              ]}
            />
          </SectionCard>
          <SectionCard title="Recent Payments">
            <Table C={C}
              head={["Payment", "Amount", ""]}
              align={[0, 1, 1]}
              rows={[
                [<span><b>Muhamud Mukhsin</b><br /><span style={{ color: C.gray400, fontSize: 11 }}>20 Jun · Bank · Unit 2</span></span>, <b>{fmt(900000)}</b>, <Badge tone="green" icon="checkCircle">Verified</Badge>],
                [<span><b>Frederick Mbwana</b><br /><span style={{ color: C.gray400, fontSize: 11 }}>08 Jun · Bank · 4 months</span></span>, <b>{fmt(1200000)}</b>, <Badge tone="gold" icon="clock">Pending</Badge>],
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}

/* ── reusable themed table ─────────────────────────────────────────────── */
function Table({ C, head, rows, align = [] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>{head.map((h, i) => (
            <th key={i} style={{ textAlign: align[i] === 1 ? "right" : "left", color: C.gray500, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", padding: "9px 16px", background: C.gray50, borderBottom: `1px solid ${C.gray200}` }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((cell, ci) => (
              <td key={ci} style={{ textAlign: align[ci] === 1 ? "right" : "left", padding: "10px 16px", borderBottom: ri === rows.length - 1 ? "none" : `1px solid ${C.gray100}`, color: C.text, fontVariantNumeric: "tabular-nums", verticalAlign: "middle" }}>{cell}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Properties & Units section ────────────────────────────────────────── */
function UnitsView() {
  const { C } = useTheme();
  const field = (label, value) => (
    <div>
      <div style={{ fontSize: 9.5, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 3 }}>{value}</div>
    </div>
  );
  return (
    <>
      {/* property header card */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 16, alignItems: "center" }} className="prop-phead">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${C.navy},${C.navyLight})`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="building" size={22} stroke={C.gold} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Ilazo</div>
            <div style={{ fontSize: 11.5, color: C.gray400, marginTop: 2 }}>4 units · 3 occupied · 1 vacant</div>
          </div>
        </div>
        {field("Region", "Dodoma")}
        {field("Manager", "Mike Luzigah")}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {field("Phone", "+255 712 000 000")}
          <Btn variant="secondary" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 12 }}>Edit property</Btn>
        </div>
      </div>
      {/* unit grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
        {UNITS.map((u, i) => <UnitCard key={i} u={u} />)}
      </div>
    </>
  );
}

/* ── Tenant Ledger section ─────────────────────────────────────────────── */
function LedgerView({ onPay }) {
  const { C } = useTheme();
  const recon = (label, value, sub, color) => (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 10.5, color: C.gray500, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: color || C.text, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.gray400, marginTop: 3, fontWeight: 600 }}>{sub}</div>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Sunday Mtaki — Unit 1 Ledger</div>
          <div style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Lease from 20 Jul 2024 · Rent 900,000/mo · Due 20th · Paid in advance</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" icon={<Icon name="fileText" size={14} stroke={C.gray800} />}>Statement PDF</Btn>
          <Btn variant="navy" icon={<Icon name="plus" size={14} stroke="#fff" />} onClick={onPay}>Collect Payment</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 16 }}>
        {recon("Total charged · 20 mo", fmt(18000000), "Jul 2024 → Feb 2026")}
        {recon("Total received", fmt(16200000), "90% of charges", C.green)}
        {recon("Outstanding", fmt(1800000), "2 months in arrears", C.red)}
      </div>
      <SectionCard title="Monthly Ledger" subtitle="FIFO allocation · rent paid in advance">
        <Table C={C}
          head={["Month (due 20th)", "Charged", "Payment received", "Status", "Balance"]}
          align={[0, 1, 0, 0, 1]}
          rows={LEDGER.map(r => {
            const balTxt = r[6] === "due" ? <span style={{ color: C.red, fontWeight: 700 }}>{fmt(r[5])}</span>
              : r[6] === "cr" ? <span style={{ color: C.green, fontWeight: 700 }}>{fmt(-r[5])} cr</span>
              : <span>{fmt(r[5])}</span>;
            return [<b>{r[0]}</b>, fmt(r[1]), r[2] === "—" ? <span style={{ color: C.gray400 }}>—</span> : r[2], <Badge tone={r[4]}>{r[3]}</Badge>, balTxt];
          })}
        />
      </SectionCard>
    </>
  );
}

/* ── Collect Payment modal (uses ModalShell) ───────────────────────────── */
function CollectPaymentModal({ onClose, showToast }) {
  const { C } = useTheme();
  const [amount, setAmount] = useState("2,700,000");
  const amt = parseInt((amount || "").replace(/[^0-9]/g, ""), 10) || 0;

  const alloc = useMemo(() => {
    let remaining = amt;
    return ALLOC_QUEUE.map(q => {
      const applied = Math.min(remaining, q.due); remaining -= applied;
      return { ...q, applied, status: applied >= q.due ? "settled" : (applied > 0 ? "partial" : "—") };
    });
  }, [amt]);
  const arrears = 1800000;
  const newBal = amt >= arrears
    ? { txt: amt - arrears > 0 ? fmt(amt - arrears) + " cr" : "0", color: C.green, note: amt - arrears > 0 ? "in credit / advance" : "cleared — current" }
    : { txt: fmt(arrears - amt) + " due", color: C.red, note: "still in arrears" };

  return (
    <ModalShell
      title="Collect Payment"
      subtitle="Maker → Verifier · saved as Pending until verified"
      onClose={onClose}
      maxWidth={540}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={<Icon name="check" size={14} stroke="#fff" />} onClick={() => { showToast?.("Payment submitted for verification (demo).", "success"); onClose(); }}>Submit for verification</Btn>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FSelect label="Tenant / Lease">
          <option>Sunday Mtaki — Unit 1 (Ilazo)</option>
          <option>Muhamud Mukhsin — Unit 2</option>
          <option>Frederick Mbwana — Unit 3</option>
        </FSelect>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FInput label="Amount (TZS)" value={amount} onChange={e => setAmount(e.target.value)} />
          <FInput label="Paid date" type="date" defaultValue="2026-06-20" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FInput label="Covers from" type="date" defaultValue="2026-01-20" />
          <FInput label="Covers to" type="date" defaultValue="2026-03-19" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FSelect label="Method"><option>Bank transfer (CRDB)</option><option>Cash</option><option>Mobile money</option></FSelect>
          <FInput label="Reference" placeholder="receipt / txn no." />
        </div>
        {/* allocation preview */}
        <div style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="trendingUp" size={14} stroke={C.gold} />Auto-allocation preview · FIFO, oldest first
          </div>
          {alloc.map((q, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12 }}>
              <span style={{ color: C.gray500 }}>{q.lab} <span style={{ fontSize: 10, color: C.gray400 }}>({q.sub})</span></span>
              <span style={{ fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                {fmt(q.applied)}
                {q.applied > 0 && <Badge tone={q.status === "settled" ? "green" : "gold"}>{q.status}</Badge>}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px dashed ${C.gray200}`, marginTop: 6, paddingTop: 9, fontSize: 12.5 }}>
            <span style={{ fontWeight: 800, color: C.text }}>New balance</span>
            <span style={{ fontWeight: 800, color: newBal.color }}>{newBal.txt} <span style={{ fontWeight: 600, fontSize: 10, color: C.gray400 }}>{newBal.note}</span></span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ── empty/coming-soon placeholder ─────────────────────────────────────── */
function Placeholder({ icon, title, note }) {
  const { C, isDark } = useTheme();
  return (
    <div style={{ background: C.white, border: `1px dashed ${C.gray200}`, borderRadius: 12, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", marginBottom: 12 }}><IconBadge name={icon} color={C.navy} size={48} radius={14} isDark={isDark} /></div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.gray400, marginTop: 4, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>{note}</div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function PropertyPage({ role, showToast }) {
  const { C } = useTheme();
  const [section, setSection] = useState("dashboard");
  const [payOpen, setPayOpen] = useState(false);
  const openPay = () => setPayOpen(true);

  return (
    <div style={{ padding: "18px 22px 28px", maxWidth: 1280, margin: "0 auto" }}>
      <style>{`
        @media (max-width: 900px){
          .prop-grid2{grid-template-columns:1fr !important}
          .prop-phead{grid-template-columns:1fr 1fr !important}
        }
        .prop-subnav::-webkit-scrollbar{height:4px}
        .prop-subnav::-webkit-scrollbar-thumb{background:${C.gray200};border-radius:10px}
      `}</style>

      {/* sub-nav + primary action */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="prop-subnav" style={{ display: "flex", gap: 3, background: C.gray100, padding: 4, borderRadius: 11, border: `1px solid ${C.gray200}`, overflowX: "auto", maxWidth: "100%" }}>
          {SECTIONS.map(s => {
            const on = section === s.id;
            return (
              <button key={s.id} onClick={() => setSection(s.id)} style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8,
                fontSize: 12.5, fontWeight: on ? 800 : 600, fontFamily: "inherit", whiteSpace: "nowrap",
                color: on ? C.navy : C.gray500, background: on ? C.white : "transparent",
                border: "none", cursor: "pointer", boxShadow: on ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.14s",
              }}>
                <Icon name={s.icon} size={14} stroke={on ? C.navy : C.gray500} sw={2.2} />{s.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" icon={<Icon name="plus" size={14} stroke="#fff" />} onClick={openPay}>Collect Payment</Btn>
      </div>

      {/* sections */}
      {section === "dashboard" && <DashboardView onPay={openPay} />}
      {section === "units"     && <UnitsView />}
      {section === "ledger"    && <LedgerView onPay={openPay} />}
      {section === "tenants"   && <Placeholder icon="users" title="Tenants" note="Register and manage tenants — contacts, IDs, next-of-kin. Wiring to the database is the next step." />}
      {section === "expenses"  && <Placeholder icon="tag" title="Expenditures" note="Record property operating expenses (utilities, repairs) with maker-checker. Coming next." />}
      {section === "reports"   && <Placeholder icon="barChart" title="Reports" note="Rent roll, arrears, collections, expenses and tenant statements — using the shared report engine." />}
      {section === "company"   && <Placeholder icon="briefcase" title="Company Settings" note="Set company name, address, phone, email and logo. The name shows in the header. Coming next." />}

      {payOpen && <CollectPaymentModal onClose={() => setPayOpen(false)} showToast={showToast} />}
    </div>
  );
}
