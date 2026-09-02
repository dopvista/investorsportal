# Design Brief — Property Rentals Module (Investors Portal)
> Paste this entire file into a Claude design session. It contains the context, brand rules,
> screen descriptions, data model, hard constraints, improvement goals, and the current working
> HTML/CSS/JS code at the bottom. Your job: produce a **better-designed** version.

---

## 1. The task (read first)
You are a **senior product/UI designer + front-end engineer**. Below is a working mockup of a
**property-rental management module** that lives inside an existing web app called *Investors
Portal*. **Redesign it to look more polished and professional while keeping the exact same
information architecture, screens, fields, and brand identity.**

**Deliver:** one self-contained `index.html` (inline CSS, vanilla JS, **no external libraries or
build step** — it must open by double-click). Keep it framework-agnostic; it will later be
re-implemented in React. Optionally include a **dark-mode** variant and a **mobile** layout.

Do **not** invent new features or remove any data. Improve *visual craft*: hierarchy, spacing
rhythm, typography, iconography, color usage, states, and responsiveness.

---

## 2. Product context
- **Investors Portal** is a Tanzanian investment-tracking PWA (DSE shares). We're adding a
  **Property Rentals** module so the owner tracks rental properties in the same app.
- **Audience:** the landlord/admin (internal, desktop-first but must work on mobile). No tenant
  logins.
- **Region:** Tanzania → currency is **TZS** (format `1,800,000`, no decimals in lists),
  timezone **EAT (UTC+3)**, dates like `20 Jul 2024`.
- **Reached via subdomain** `property.investorsportal.co.tz`, so the property module has its own
  "front door" but shares the app shell (navy sidebar, same branding).
- **Hierarchy:** Company → Property → Unit → Lease (tenant) → monthly rent charges → payments.
- **Maker-checker workflow:** financial records are created `pending` then `verified` (or
  `rejected`). Show this with status badges (Pending = amber, Verified = green, Rejected = red).

---

## 3. Brand & style system (keep these)
**Colors (CSS variables in the code):**
- Navy `#0A2540` (sidebar, primary buttons, headings) + navy2 `#0E2D4D`
- Gold `#D4AF37` (accent, "Portal" wordmark, primary CTA on light surfaces)
- Green `#00843D` (success / verified / paid / credit) — bg `#E6F4EC`
- Red `#B42318` (arrears / overdue / rejected) — bg `#FEECEB`
- Amber `#B25E09` (pending / partial / warning) — bg `#FDF3E7`
- Blue `#1D4ED8` (info / services / links) — bg `#E8EFFD`
- Neutrals: text `#0F172A`, muted `#64748B`, hairline `#E5E9F0`, page bg `#F4F6FA`, white.

**Conventions:** rounded cards (12–16px radius), 1px hairline borders, soft shadows, pill
status badges, tabular numerals for money (`font-variant-numeric: tabular-nums`), uppercase
micro-labels with letter-spacing. Font: system stack (`-apple-system, Segoe UI, Roboto…`).

**Things to elevate:** the mockup uses **emoji icons** (🏢 💵 ⚙️ etc.) and a faux logo — replace
with clean **inline SVG line icons** and tidy placeholder marks. Add proper **focus/hover/active**
states, empty states, and a **dark mode** (the real app supports light & dark).

---

## 4. Screens (what each must contain)
1. **App shell** — fixed navy sidebar: logo + "Investors Portal™", a small `property.*` context
   line, a "Property Rentals · Admin" badge, nav group **Property** (Dashboard, Properties &
   Units, Tenants, Collect Payments, Receivables, Expenditures, Reports), nav group **Settings**
   (Company Settings), and a user chip at the bottom. Header bar with page title + breadcrumb on
   the left, and on the right a **Company chip** (logo + company name + caret — always visible,
   like a bank-account switcher) and a **settings gear**.

2. **Dashboard** — 6 KPI cards (Rent Roll/mo, Collected, Arrears, Occupancy %, Expenses, Net
   Income) with colored trend tags; a **Units table** (unit · type · tenant · rent · status ·
   balance); an **Aged Receivables** panel (0–30 / 31–60 / 60+ buckets); a **Recent Payments**
   list with Pending/Verified badges.

3. **Properties & Units** — a **property header card** (Region, Location, Manager, Phone, Email +
   Edit) and a grid of **compact unit cards** (see §5 — this is the most important component).

4. **Tenant Ledger** — a reconciliation strip (Total charged / Received / Outstanding) and a
   **monthly ledger table** (Month · Charged · Payment received · Status · Balance) showing the
   full payment story (on-time, late, partial, missed, lump-sum, advance, FIFO allocation). Color
   balances: red = owed, green = credit.

5. **Company Settings** — logo upload card + profile form (name, phone, email, address, notes).
   The company **name appears permanently in the header**.

6. **Collect Payment modal** — tenant/lease, amount, paid date, **coverage period (from→to)**,
   method, reference, and a **live FIFO auto-allocation preview** (a lump sum settling several
   months), footer "Submit for verification".

---

## 5. The hero component — compact Unit Card (must preserve ALL of this)
Each unit card, **collapsed**, must clearly show, in a tight, well-organised layout:
- **Unit name** + **unit type** (`Single · Studio · Couples · Roommates · Family`)
- **Status badge** (Occupied / Arrears / Paid ahead / Vacant) — color-coded
- **Monthly rent** (TZS)
- **Current tenant** (avatar + name) with a small **"months stayed"** pill (e.g. `23 mo`)
- **Balance** (color-coded: red owed / green credit / 0 current)
- A **"Details ▾"** toggle that expands **in place** to reveal **Unit type**, **General features**
  (chips: 1 Bedroom, Lounge, Kitchen, Parking, Toilet, Bath…) and **Other services** (chips:
  Metered water, Security guard, Garbage, WiFi…).
- **Vacant** units show a dashed card with a **"+ Assign Tenant / Lease"** action instead of a
  tenant/balance.

Constraint: **keep it compact** (4 cards per row on desktop) but **do not drop any field**.
Make it feel premium — strong number for rent, calm secondary rows, crisp chips on expand.

---

## 6. Data model (so the design reflects real fields)
- **Company:** name, address, phone, email, logo, notes.
- **Property:** name, region, location, manager, phone, email.
- **Unit:** name, unit_type (Single/Studio/Couples/Roommates/Family), monthly rent, general
  features [], other services [], status (vacant/occupied, derived).
- **Tenant:** full name, phone, alt phone, email, ID type (NIDA/Driving Licence/Passport/Voter
  ID), ID number + ID document, photo, occupation, employer, home address, next-of-kin
  (name/phone/relationship), notes.
- **Lease:** unit, tenant, start date (= move-in; due day defaults to that day-of-month), monthly
  rent, due day, deposit, status, verify status (pending/verified/rejected).
- **Invoice (auto monthly charge):** period month, due date, amount, amount paid, status
  (unpaid/partial/paid).
- **Payment:** amount, paid date, coverage period (from→to), method (cash/bank/mobile money),
  reference, verify status. Lump sums auto-allocate FIFO across months.
- **Expense:** company/property/unit, date, category, amount, payee, method, verify status.

---

## 7. Hard constraints (don't break)
- Keep the **navy/gold/green** identity and the **company chip in the header**.
- Keep the **compact unit card** with every field + expandable details.
- Keep **unit types** exactly: Single, Studio, Couples, Roommates, Family.
- Keep **status color semantics** (green paid/verified, red arrears/rejected, amber pending/partial).
- Keep **TZS** number formatting and **EAT** date style.
- **No external CSS/JS frameworks**, no fonts beyond the system stack, single file.

---

## 8. What "better" means (improvement goals)
1. Replace emoji with **inline SVG line icons**; design a clean logo/company mark.
2. Tighten the **spacing scale** and **type scale** for clearer hierarchy.
3. Make the **unit cards** feel premium and scannable; nicer expand animation.
4. Polished **empty/vacant** and **loading** states.
5. **Responsive**: graceful reflow to tablet (2-up cards) and mobile (1-up, sidebar → bottom nav).
6. Add a proper **dark mode** using the same tokens.
7. Accessible: AA contrast, visible focus rings, hit areas ≥ 40px, semantic markup.
8. Subtle micro-interactions (hover lift, badge emphasis) — tasteful, not flashy.

---

## 9. Current working code (redesign this)
The file below is the live mockup. Use it as the functional + content baseline.

```html
<!-- ===== paste of investorsportal/docs/property-mockup.html ===== -->
<!-- (full current code follows) -->
```

> **Note:** the complete, current source is in the companion file **`property-mockup.html`**.
> Paste its full contents into the code block above (or attach the file) when you hand this to the
> designer — it's kept in a separate file to stay in sync with the live preview.
