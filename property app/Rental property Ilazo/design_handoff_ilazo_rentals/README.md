# Handoff: Ilazo Rentals — mobile rent-management app

## Overview
A simple, mobile-first app for a private landlord to manage a small rental property (**Dodoma Contemporary Appartments**, block **Ilazo**, Dodoma, Tanzania — 3 units). The owner uses it to see who has paid vs. who owes, record rent payments, register/replace tenants, and generate per-tenant statements and receipts. Currency is **Tanzanian Shilling (TZS)**; rent is a flat **300,000 TZS / month / unit** and tenants typically pay in **multi-month lump sums** (e.g. 900,000 = 3 months).

This is **Phase 1 (mobile only)**. The agreed plan is to finish mobile, then **extend to a web app** sharing the same domain model.

## About the Design Files
`Ilazo Rentals.dc.html` is a **design reference / interactive prototype built in HTML** (a single self-contained page using a small in-house reactive runtime). It is **not production code to ship as-is**. The task is to **recreate this design in a real codebase** — pick an appropriate stack (e.g. React Native / Expo or Flutter for mobile, plus a backend + database), reproduce the UI faithfully, and wire it to persistent storage. All data in the prototype is in-memory seed data; nothing persists on reload.

`source_transactions.csv` is the owner's **real transaction history** (May 2024 → 2026) that the prototype's seed data was derived from. Use it to seed/validate the real database.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, layout, copy, and interactions are all intentional and should be recreated pixel-closely. The one exception: tenant/next-of-kin **phone numbers are placeholders** (no real numbers were provided).

---

## The domain model (READ THIS FIRST — it is the heart of the app)

The core concept is **tenure continuity / rolling lease coverage**. Rent is charged monthly; payments buy whole months of coverage forward from where the previous coverage ended. The app must always be able to answer: *how much is owed right now, and through what date is this tenant paid up?*

### Entities
- **Unit** — `{ id, name, type, rent (=300000), tenant (current tenant name), phone, leaseStart (ISO), nextDue (ISO), kin:{ name, phone, rel } }`
  - `type` ∈ `Single | Couples | Family` (descriptive only).
  - `leaseStart` = current tenant's tenure start date.
  - `nextDue` = the **start date of the first month not yet paid for** (the rolling coverage pointer). "Covered through" = `nextDue − 1 day`.
- **Transaction (txn)** — `{ date, tenant, unit (id or ''), amount, method, covers, type }`
  - `type` ∈ `rent | expense`. Expenses have `unit:''` (e.g. the Oct 2024 plumbing repair).
  - `method` ∈ `Bank transfer (CRDB) | Cash | Mobile money`.
  - `covers` in seed data is a human label; the app **recomputes** canonical coverage labels from amounts + tenure (see below).
- **Kin (next of kin)** — `{ name, phone, rel }` attached to a unit's current tenant.
- **Company** — `{ name, short, address, tin, phone, email, ... }` (editable on Company Profile).

### Key rules & formulas (these must be reimplemented exactly)
- **Months a payment covers** = `round(amount / 300000)`.
- **Recording a payment** advances the unit's `nextDue` forward by that many months: `nextDue = addMonths(nextDue, months)`. Never touch `leaseStart`.
- **Months due right now** (`monthsDue`): count of month-periods whose start date is `<= today`, starting at `nextDue` — i.e. `k` such that `addMonths(nextDue, k) <= today`. **Amount due = monthsDue × rent.**
- **Status**: `due > 0` → *Arrears* (red `#BE4B33`); `due == 0` → *Current/Paid up* (green `#10715A`). (A "paid ahead / credit" amber state `#B07417` also exists for statements.)
- **Coverage labels** are derived by walking each tenant's payments oldest→newest from `leaseStart`, allocating each payment's months forward and labelling it e.g. `"3 Months · 20 Feb – 21 May 2025"`. Split into `months` + `date range` for display (see `computeCovers`, `coverLabel`, `splitCover` in the prototype).
- **Statement reconciliation** (must always balance): **Rent charged (months occupied) = Paid + Outstanding**. For a specific year it's scoped to that calendar year with an opening/closing carry: closing balance at 31 Dec = `monthsElapsed(leaseStart, asOf) × rent − received-through-asOf`. Former tenants cap "occupied" at their move-out (coverage end), not today.
- **"Today"** must be the real current date (the prototype uses a `NOW` value; the "as of" label on Home reflects it).

### Registering a new tenant / tenant handover
When a new tenant is registered on a unit: set `tenant`, `phone`, `kin`, `leaseStart = start`, `nextDue = start` (fresh rolling lease from the tenure start date). The **previous occupant automatically becomes a "Former tenant"** — they are no longer any unit's current tenant, but **all their transactions stay in the ledger** so their receipts/statements remain accessible. "Former vs current" is derived: a tenant is *current* iff they equal a unit's `tenant` field; otherwise *past*.

---

## Screens / Views

Bottom nav has 4 tabs: **Home · Units · Tenants · More**, plus a central **＋ (Record payment)** FAB. Two detail screens (Unit Details, Tenant Details) and several bottom-sheets sit on top.

### 1. Home
- **Header**: company short name · property, "Good morning", avatar.
- **Swipeable hero (horizontal pager, snap, 2 dots)**:
  - Card A — **Outstanding rent** (green gradient `#12805F→#0B5B45`): big total, "across N tenants · as of <today>", plus Rent roll/mo + Occupancy stat tiles.
  - Card B — **Net income · lifetime** (dark `#2A3F36→#17241F`): net total, Collected (mint `#8FE3C4`) + Expenses (coral `#F0A897`).
- **Record a payment** dark button.
- **Needs attention**: list of tenants with `due > 0` — avatar, name, unit, months-behind, amount due, "Collect ›".
- **Your units**: compact list, tap → Unit Details.

### 2. Units (list)
- Header "Units", **New** (person_add) button → New Tenant sheet.
- **Portfolio summary strip**: 3 stat cards — Occupied (e.g. 3/3), Roll/mo, Arrears total.
- **Unit cards** (one per unit): apartment icon, name, type · rent/mo, status pill; tenant row (avatar, name, covered-through, balance); **lease-coverage progress bar**; status line ("2 months overdue" / "Paid up · on track") + "Details ›". Tap → Unit Details.

### 3. Unit Details (unit-focused)
- Back arrow, "UNIT DETAILS" eyebrow.
- **Green hero card** (`#15886B→#0A5741`): unit name + status pill + edit icon; **"CURRENT TENANT"** label; tenant avatar + name (tappable → **View tenant details ›**) with call/chat icons; divider; **Amount due now** (big) + white **Record** button.
- **Lease timeline** card: Started → progress bar → Covered to; rent/mo; status chip.
- **This unit** card: **Total generated (lifetime)**, plus Payments count / Occupied since / Rent tiles.
- **Tenants of this unit**: every tenant who ever occupied it (current + past), each with period, months, total paid, and a "History ›" affordance → opens that tenant's payment-history sheet. (Their totals reconcile to the unit total.)

### 4. Tenant Details (tenant-focused — separate page from Unit Details)
Reached via "View tenant details ›" on the Unit hero; back returns to Unit Details.
- Header eyebrow "TENANT DETAILS".
- **Tenant card**: large avatar, name, `unit · type · since`, status pill; Call / Message / Edit actions.
- **Amount due** green strip + **Record** button.
- **Lease timeline** card (same as unit page).
- **Next of kin** card: name + relation badge + phone + call button.
- **Total Payments** card: **this tenant's** total + count; tap to expand that tenant's payment history inline (date, months, range, +amount). Payments are scoped to the individual tenant, not the whole unit.

### 5. Tenants (management hub)
- Header "Tenants", "N active · M former", **New** button.
- Sections **Current tenants** / **Former tenants**; tap → opens the relevant tenant/unit detail. Editing a tenant (name/phone/kin) is via the **Edit Tenant** sheet; renames also propagate to that tenant's historical transactions.

### 6. More
- Company card, and menu rows: **Company profile**, **Statements & receipts**, Settings, Sign out, etc.

### 7. Company Profile
Editable company fields (name, short name, address, TIN, phone, email) used on statements/receipts.

### 8. Statements & Receipts
- Tabs **Receipts** / **Statements**, with a **funnel filter** on the same row.
- **Year filter** defaults to the **current year**; options: All years + each calendar year. The filter drives **both** tabs.
- **Receipts**: generated per rent payment — `RCP-00N`, tenant, unit, method, amount, "For period" (months on one line, date range on the next — must not wrap), Export PDF / Share.
- **Statements**: lists **every eligible tenant for the selected scope** (current = *Active*, previous = *Past*). Generating one produces the 3-way reconciliation (Rent charged / Paid / Outstanding, as landscape full-width rows) plus a payment list; for a specific year it's a proper annual statement with opening/closing carry and a "Year YYYY" badge. Former tenants cap at their move-out date.

### Bottom-sheets
- **Record payment**: tenant/unit select, amount (with quick chips 300k/600k/900k/1.2M), date, method; **live preview** of "covers N months" and the resulting new balance; Save.
- **New tenant**: unit select (warns which current tenant moves to Former), name, phone, tenure start, next-of-kin (name/phone/relation); Register.
- **Edit tenant**: name, phone, next-of-kin; Save (lease dates & balances untouched).
- **Tenant payment history**: opened from a unit's tenant list.

---

## Interactions & Behavior
- Tab switches and detail navigation are instant (state-driven `screen` value; no real routing in the prototype — use the codebase's router).
- Sheets animate up (`translateY 105%→0`, cubic-bezier(.22,1,.36,1), ~320ms) over a dim/blur backdrop; tap backdrop or ✕ to close.
- Cards/rows fade+rise on mount (~300ms).
- Hero pager: horizontal scroll-snap; active dot widens (7px→18px) and darkens.
- Toasts: dark pill, bottom-center, auto-dismiss ~2.2–3s.
- **Recording a payment** updates: unit `nextDue`, the ledger, all derived balances/statuses, Home outstanding & attention list — everywhere, live.

## State Management
Central store holding: `units[]`, `txns[]`, `company`, current `screen` + `selUnit`, filter `fy` (year), and transient sheet/form state. Derived-on-read (don't persist): amount due, monthsDue, coverage labels, statement reconciliation, totals, active/former classification. In production, `units` + `txns` + `company` are the persisted source of truth (DB); everything else is computed.

## Design Tokens
**Fonts** (Google): **Space Grotesk** (headings, numbers/figures), **Plus Jakarta Sans** (body/UI). Icons: **Material Symbols Rounded**.

**Colors**
- App background: `#F6F1E9` (warm cream); desk/gradient `#E7E0D3 / #F2ECE1 / #E1D9CA`.
- Ink / text: `#17241F` (primary), `#6E7B74` / `#8A968E` / `#9AA79F` (muted).
- Primary green: `#10715A`; gradients `#12805F→#0B5B45` and `#15886B→#0A5741`; mint accent `#8FE3C4`.
- Dark card: `#17241F`, `#2A3F36`.
- Arrears/negative red: `#BE4B33` (bg `#F8E5DF`).
- Current/positive green pill bg: `#E4EFEA`.
- Credit/ahead amber: `#B07417` (bg `#FBEFD9`); coral `#F0A897`.
- Card surface `#fff`; hairlines `#F0EBE1 / #F3EEE4 / #ECE6DB`; input border `#E1D9CA`.

**Radii**: cards 20–28px; pills/chips 999px; icon tiles 11–17px; phone screen 39px. **Shadows**: soft `0 10px 22px rgba(20,40,32,.05)` for cards; colored `0 14–18px 28–36px rgba(<green>,.26–.30)` for hero/gradient cards. **Type sizes**: hero figures 30–35px, section numbers 24–28px, titles 20–24px, body 12.5–14.5px, labels/eyebrows 10–12px (uppercase, letter-spacing ~.03–.05em). Min tap target ~40px+.

## Assets
None external beyond Google Fonts (Space Grotesk, Plus Jakarta Sans, Material Symbols Rounded). No raster images or custom SVGs — all UI is CSS + icon font. If your codebase has an icon set, map the Material Symbol names used (home, apartment, groups, account_balance_wallet, add, add_card, person_add, edit, call, chat, event_repeat, receipt_long, insights, filter_alt, diversity_1, south_west, expand_more/less, chevron_right, check_circle, error, close, picture_as_pdf).

## A note on the attached "Design System"
A project design system is now attached but this prototype was built **before** it and does not use it. If you want the production build to conform to that design system, treat this handoff as the **functional + layout spec** and re-skin using the design system's tokens/components. Otherwise the tokens above are self-sufficient.

## Suggested build plan
1. Stand up data layer: `units`, `transactions`, `company` tables; seed from `source_transactions.csv`.
2. Implement the coverage engine (monthsDue, dueOf, computeCovers, statement reconciliation) with unit tests — this is the riskiest logic.
3. Build screens in the order: Home → Units → Unit Details → Tenant Details → Record-payment sheet → New/Edit tenant → Statements/Receipts → Company profile.
4. Wire real persistence; add auth for the single owner.
5. Then extend the same model/services to the planned **web app**.

## Files
- `Ilazo Rentals.dc.html` — the full interactive design reference (all screens + logic).
- `source_transactions.csv` — real transaction history used to seed/validate data.
- `screens/` — high-res reference screenshots of each screen:
  - `01-home.png` — Home (swipeable hero, Needs attention, units)
  - `02-units.png` — Units list (portfolio strip + unit cards)
  - `03-unit-details.png` — Unit Details (green hero, lease timeline, This unit, tenants of this unit)
  - `04-tenant-details.png` — Tenant Details (separate page: tenant card, due, lease, next of kin, total payments)
  - `05-tenants.png` — Tenants management hub (active / former)
  - `06-statements.png` — Statements & receipts (year-filtered per-tenant statements)
  - `07-record-payment.png` — Record payment bottom-sheet (live coverage preview)
  - `08-new-tenant.png` — Register new tenant bottom-sheet (with next of kin)
