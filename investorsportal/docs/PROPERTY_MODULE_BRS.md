# Property Rentals Module — Business Requirement Specification (BRS)

**Status:** Draft v0.4 — core logic finalized (move-in due day, unit rent, accrued dues); competitive scan added
**Owner:** dopvista
**Module:** Property Rentals (inside Investors Portal)
**Front door:** `property.investorsportal.co.tz` (subdomain → same unified app)
**Last updated:** 2026-06-01

---

## 1. Purpose & Vision

Extend Investors Portal into a true **one-stop centre for all investments**, adding a
**Property Rentals** module so the owner can track rental properties, units, tenants,
leases, rent due dates, payments, partial payments, security deposits, and arrears —
all in the same app, with the same login, alongside the existing DSE/share-investment
features.

The first property is **Ilazo** (4 units). The system is designed from day one to hold
**many properties and many units**, so future properties drop in without rework.

---

## 2. Scope

### In scope (v1)
- **Company → Property → Unit** hierarchy (3 levels) with extensible unit amenities
- Tenants (contact + ID details)
- Leases (unit ↔ tenant, custom monthly due day, rent in advance, deposit)
- Automatic monthly rent charges (invoices) per lease
- Payments, including **partial payments** AND **multi-month lump sums covering a date range** (from→to), auto-spread across the months they cover
- **Security deposit** tracking (held → refunded/forfeited at lease end)
- **Owner operating expenses** (property- and unit-level: utilities, repairs, etc.) — *not* tenant billing
- Dues / arrears engine (who owes what, how overdue)
- Property dashboard widgets incl. **net income (rent − expenses)**
- Reports (rent roll, arrears, collections, expenses, net income, deposit register, tenant statement)
- Document storage (signed contract PDF, tenant ID) via Supabase Storage

### Out of scope (v1) — candidates for later
- Tenant self-service logins (confirmed **admin-only for now**)
- Tenant utility billing (water/electricity charged to tenant) — **rent only** confirmed
- **Tax classification** (taxable/non-taxable revenue, deductible/non-deductible expenses) — confirmed out
- Historical CSV import — confirmed out; **start fresh with current active tenants only**
- Automatic late-fee/penalty calculation
- Online/mobile-money rent collection integration
- SMS/email automated reminders (in-app reminders only in v1)
- Maintenance / work-order tracking (expenses are recorded, but no work-order workflow)
- Pro-rated first/last month rent (assume full months in v1)

> **Reference:** A 22-month export from the current landlord app
> (`property app/Dodoma_Contemporary_Appartments-…csv`, 20 rent payments + 1 expense,
> TZS 20.01M revenue, TZS 1.5M expense) was reviewed to ground these rules. It is **not**
> being imported; it informs the model (turnover per unit, lump-sum advance payments,
> property-level expenses, CRDB bank transfers).

---

## 3. Confirmed Business Rules

| Rule | Decision |
|---|---|
| **Architecture** | One app, one login, one Vercel project. `property.*` subdomain lands the user directly in the Property section. Built as a normal section first; subdomain flipped on as a final ~30-min step. |
| **Users** | Admin-only. No tenant logins in v1. Tenants are records, not users. |
| **Rent cycle** | **Due day per lease, defaulting to the move-in day.** Lease start = tenant's move-in date; the day-of-month of that date becomes the default due day (editable). e.g. move in **20 Jul 2024** → rent falls due the **20th** of each month. |
| **Unit rent** | **Each unit has its own monthly rent** (`prop_units.default_rent`). A lease copies it and may override for a specific tenant. |
| **Accrual** | **Charges accrue every month on the due day whether or not the tenant pays.** Unpaid charges become receivables/arrears — this is what "Manage Receivables" reports. |
| **Payment timing** | **In advance** — the charge for a month is due at the start of that month (on the due day). Payment *date* (when money arrives) is recorded separately and may be a few days later. |
| **Utilities** | Not tracked. Rent only (inclusive, or tenants pay providers directly). |
| **Partial payments** | Allowed. A month's charge can be settled over multiple payments; system tracks a running balance. |
| **Security deposit** | Tracked per lease: amount held at start, settled (refunded/forfeited) at lease end. **No fixed norm** — entered manually per lease, no default multiple. |
| **Hierarchy** | **3 levels: Company → Property → Unit.** e.g. company "Dodoma Contemporary Appartments" → property "Ilazo" → Units 1–4. |
| **Expenses** | **Tracked** (owner operating costs at company/property/unit level). Distinct from tenant utility billing (which is out). |
| **Tax classification** | **Not tracked** in v1. |
| **Historical import** | **None.** Start fresh; owner enters current active tenants/leases. |
| **Payment entry** | Supports a **coverage period (from→to)**; a lump sum auto-spreads across the months it covers. |
| **Lease term** | **Open-ended / rolling (month-to-month).** `end_date` optional; a lease runs until terminated. |
| **Access control** | **Full maker-checker**, mirroring transactions: Data Entrant records leases/payments → Verifier approves before they count. |
| **Late penalties** | Not auto-calculated in v1. |
| **Seed data** | None. Owner enters Ilazo, units, tenants and leases through the UI. |
| **Currency** | TZS (Tanzanian Shilling), consistent with the rest of the portal. |
| **Timezone** | Africa/Dar_es_Salaam (EAT, UTC+3) — reuse existing `todayInAppTz()` / `parseIsoDateInAppTz()` helpers for all date math. |

---

## 4. Roles & Access — Maker-Checker (CONFIRMED)

Reuse the existing role system **and the existing maker-checker workflow** used for
transactions. Money-affecting records (leases and payments) are created in a `pending`
state and only count once verified.

| Role | Property access |
|---|---|
| **SA** Super Admin | Full: manage everything; can create and verify (override) |
| **AD** Admin | Full management; can verify |
| **DE** Data Entrant | Create/record properties, units, tenants, leases, payments — submitted as `pending` |
| **VR** Verifier | Review & verify/reject pending leases and payments |
| **RO** Read Only | View dashboards & reports only |

**Maker-checker rules:**
- **Payments** carry `status` = `pending` → `verified` / `rejected`, plus
  `recorded_by` and `verified_by`/`verified_at`. **Only `verified` payments reduce a
  tenant's balance / count toward collections.** Pending payments show as "awaiting
  verification."
- **Leases** likewise carry a verification state; an unverified lease does not yet
  generate billable invoices (or generates them flagged pending until the lease is
  verified — see §6).
- SA/AD can both create and verify. A Verifier cannot verify their own entry where the
  existing transaction workflow forbids self-verification (mirror that constraint).

---

## 5. Data Model (proposed)

All tables namespaced with `prop_` to keep them clearly separate from the investment
tables. All protected by Supabase RLS (authenticated admins only).

### 5.0 `prop_companies` (owner/company — top level; editable via **Company Settings**)
The company **profile** is set in a Company Settings screen reached from the **right of the
header**; the **company name shows permanently in the header** (the property-side analogue
of the CDS chip on the investment side).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | shown in header, e.g. "Dodoma Contemporary Appartments" |
| address | text | optional |
| phone | text | optional |
| email | text | optional |
| logo_path | text | company logo (Storage), optional |
| notes | text | optional |
| is_active | bool | |
| created_at / updated_at | timestamptz | |

### 5.1 `prop_properties`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → prop_companies | the owning company |
| name | text | e.g. "Ilazo" |
| region | text | optional (e.g. Dodoma) |
| location | text | optional (specific area/street) |
| manager | text | optional (property manager name) |
| phone | text | optional |
| email | text | optional |
| description | text | optional |
| is_active | bool | hide retired properties |
| created_at / updated_at | timestamptz | |

### 5.2 `prop_units`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| property_id | uuid FK → prop_properties | |
| name / label | text | e.g. "Unit 1" |
| unit_type | enum | `single` / `studio` / `couples` / `roommates` / `family` |
| bedrooms | int | optional structured count |
| amenities | jsonb | **general features** chips, e.g. `["1 bedroom","lounge","kitchen","parking","toilet","bath"]` |
| services | jsonb | **other services** (e.g. water, security, garbage, wifi) — hidden on the card until expanded |
| default_rent | numeric | suggested rent (a lease can override) |
| status | derived | `vacant` / `occupied` (from active lease) — not stored |
| notes | text | |
| created_at / updated_at | timestamptz | |

**Unit card (collapsed) shows:** unit name · rent · current tenant · **months stayed** ·
balance · status. **Click to expand** → unit type, general features, other services.

### 5.3 `prop_tenants`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| full_name | text | **required** |
| phone | text | **required** (primary) |
| alt_phone | text | optional alternate/mobile |
| email | text | optional |
| id_type | enum | `nida` / `driving_licence` / `passport` / `voter_id` / `other` |
| id_number | text | optional |
| id_doc_path | text | Storage ref to ID scan/photo, optional |
| photo_path | text | Storage ref to tenant photo, optional |
| occupation | text | optional |
| employer | text | optional |
| home_address | text | optional (permanent/home address) |
| nok_name | text | next-of-kin name, optional |
| nok_phone | text | next-of-kin phone, optional |
| nok_relationship | text | next-of-kin relationship, optional |
| status | enum | `active` / `inactive` |
| notes | text | optional |
| recorded_by | uuid → auth user | audit |
| created_at / updated_at | timestamptz | |

### 5.4 `prop_leases`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| unit_id | uuid FK → prop_units | |
| tenant_id | uuid FK → prop_tenants | |
| start_date | date | contract sign/commence date |
| end_date | date | contract end (nullable = open-ended) |
| monthly_rent | numeric | the agreed rent |
| due_day | int (1–31) | **custom due day** for this lease |
| deposit_amount | numeric | security deposit held |
| deposit_status | enum | `held` / `refunded` / `forfeited` / `partial` |
| deposit_settled_amount | numeric | what was returned/kept at end |
| deposit_settled_date | date | |
| contract_doc_path | text | signed PDF in Storage |
| status | enum | `active` / `ended` / `terminated` |
| verify_status | enum | `pending` / `verified` / `rejected` (maker-checker) |
| recorded_by | uuid → auth user | maker |
| verified_by / verified_at | uuid / ts | checker |
| notes | text | |
| created_at / updated_at | timestamptz | |

> **Note:** `end_date` is nullable — leases are **open-ended / month-to-month** by
> default and simply run until `status` becomes `ended`/`terminated`.

### 5.5 `prop_invoices` (monthly rent charges)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lease_id | uuid FK → prop_leases | |
| period_month | date | first day of the month being charged (e.g. 2026-06-01) |
| due_date | date | computed from lease `due_day` within `period_month` |
| amount | numeric | = lease.monthly_rent at time of generation |
| amount_paid | numeric | running total allocated (maintained by payments) |
| status | enum | `unpaid` / `partial` / `paid` (overdue is derived: unpaid/partial AND due_date < today) |
| created_at / updated_at | timestamptz | |
| UNIQUE(lease_id, period_month) | | idempotent generation |

### 5.6 `prop_payments`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lease_id | uuid FK → prop_leases | |
| invoice_id | uuid FK → prop_invoices | the month this payment settles (nullable when it spans several months — see allocation) |
| amount | numeric | total paid in this transaction |
| paid_date | date | when the money was received |
| period_from | date | start of coverage period (for lump sums) |
| period_to | date | end of coverage period; engine spreads `amount` across covered months |
| method | enum | cash / bank / mobile-money / other |
| reference | text | receipt no., txn ref |
| status | enum | `pending` / `verified` / `rejected` — **only `verified` counts** |
| recorded_by | uuid → auth user | maker (audit) |
| verified_by / verified_at | uuid / ts | checker (maker-checker) |
| reject_reason | text | when rejected |
| notes | text | |
| created_at | timestamptz | |

### 5.7 `prop_expenses` (owner operating costs)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → prop_companies | always set |
| property_id | uuid FK → prop_properties | nullable (company-wide expense) |
| unit_id | uuid FK → prop_units | nullable (property- or company-level expense) |
| expense_date | date | |
| category | text | e.g. utilities, repairs, plumbing, security |
| amount | numeric | |
| payee | text | e.g. "Athuman Fundi Bomba" |
| method | enum | cash / bank / mobile-money / other |
| reference | text | |
| status | enum | `pending` / `verified` / `rejected` (maker-checker) |
| recorded_by / verified_by / verified_at | uuid / ts | |
| notes | text | e.g. "plumbing repair + 4000 L Sintank" |
| created_at / updated_at | timestamptz | |

> Net income = Σ verified rent payments − Σ verified expenses, per property/period.

### 5.8 `prop_documents` (optional generic attachments)
| Field | Type | Notes |
|---|---|---|
| id, owner_type, owner_id, file_path, label, uploaded_by, created_at | | attach files to property/unit/tenant/lease |

---

## 6. Core Engine — Dues / Arrears Logic

Because rent is **paid in advance** with a **custom due day per lease**:

1. **Invoice generation (idempotent).** For each `active` lease, generate one
   `prop_invoices` row per month from `start_date` through the current month
   (plus an optional 1-month look-ahead so "due soon" shows up).
   - `period_month` = first of the month.
   - `due_date` = `due_day` of that month (clamped to the month's last day if `due_day` > days-in-month, e.g. day 31 in February).
   - Generation is **idempotent** via `UNIQUE(lease_id, period_month)` — safe to run repeatedly.
   - **Mechanism (Open Q-2):** run on Property page load (upsert), and/or a daily Vercel Cron (UTC) hitting a Supabase RPC. Recommend: on-load upsert for v1 simplicity, add cron later.

   - Only **verified** leases (`verify_status = verified`) generate billable invoices.
     A pending lease can be drafted but its invoices stay flagged until the lease is verified.

2. **Payment allocation.** A payment reduces its invoice's balance.
   **Only `verified` payments are counted** (`status = verified`); pending/rejected
   payments never reduce a balance.
   `amount_paid = Σ verified payments for invoice`; status:
   - `paid` when `amount_paid >= amount`
   - `partial` when `0 < amount_paid < amount`
   - `unpaid` when `amount_paid = 0`
   - Advance payments simply settle future-month invoices.
   - **Lump-sum / coverage-period allocation:** when a payment has `period_from`/`period_to`
     (e.g. "Four Months Rent", "20/02/2025 – 21/05/2025"), the engine spreads `amount`
     across each monthly invoice in that range — fully settling earlier months and leaving
     any remainder as a partial/credit on the last. This mirrors how rent is actually paid
     (2–4 months at once), seen throughout the reviewed export.

3. **Arrears (what a tenant owes now)** =
   `Σ (amount − amount_paid)` over invoices where `due_date <= today` and status ≠ `paid`.
   - **Days overdue** = today − oldest unpaid `due_date`.

4. **Upcoming** = invoices with `due_date > today` not yet fully paid.

5. **Credit balance** (optional) = overpayment beyond current invoices → carried forward.

All date comparisons use the app's EAT helpers, never raw UTC.

### 6.1 Worked example (the canonical scenario)
- Tenant A moves into **Unit 1 on 20 Jul 2024**. Unit 1's rent = **TZS 900,000/month**.
- Lease: `start_date = 2024-07-20`, `due_day = 20`, `monthly_rent = 900,000`.
- On **20 Jul 2024** a charge of 900,000 is raised (due that day).
- Tenant pays **900,000 on 24 Jul 2024** → payment recorded with `paid_date = 2024-07-24`,
  allocated to the July charge → July is **paid** (it was 4 days late, but no penalty in v1).
- On **20 Aug 2024** the next 900,000 charge is raised automatically. If unpaid by today,
  it shows in **Receivables** as overdue with days-overdue counted from 20 Aug.
- Balance owed at any moment = Σ raised charges − Σ verified payments.

---

## 7. Functional Requirements (screens)

**v1 menu (owner's words) → screen mapping:**

| Menu item | Screen(s) |
|---|---|
| Register Company | 7.2 Companies |
| Register Property | 7.2 Properties |
| Register Unit | 7.2 Units (with own monthly rent) |
| Register Tenants | 7.3 Tenants + 7.4 Leases |
| Collect Payments | 7.5 Payments |
| Manage Receivables | 7.1 Dashboard arrears + Arrears/Aged-Receivables report |
| Manage Expenditures | 7.6 Expenses |
| Produce Reports | 7.7 Reports |

### 7.1 Property Dashboard (landing for `property.*`)
- KPI cards: total monthly rent roll, collected this month, outstanding arrears, occupancy %, **expenses this period**, **net income (rent − expenses)**.
- Lists: recent payments, units currently vacant, top arrears, recent expenses.
- Filterable by company / property.

### 7.2 Properties & Units
- List properties → drill into a property → list of units with status (vacant/occupied), current tenant, rent, balance.
- Add/edit property; add/edit unit with amenities checklist (+ free-add custom amenity).

### 7.3 Tenants
- List/search tenants; add/edit; view tenant profile with current & past leases, full payment history, statement export.

### 7.4 Leases
- Create lease: pick vacant unit + tenant, set start/end, rent, **due day**, deposit.
- Lease detail: schedule of monthly invoices, paid/partial/unpaid status, balance, deposit status, contract document.
- End/terminate lease → settle deposit (refund/forfeit), unit returns to vacant.

### 7.5 Payments
- Record payment against a lease (supports partial, advance, and **multi-month coverage period from→to**).
- Auto-generate a simple receipt for each verified payment (reuse existing PDF report engine / report specs).
- Payment history with filters (company, property, unit, tenant, date range, method, verification status).

### 7.6 Expenses
- Record an owner expense at company / property / unit level: date, category, amount, payee, method, notes.
- Maker-checker: pending → verified; only verified expenses hit net income.
- Expense list with filters (company, property, unit, category, date range).

### 7.7 Reports (reuse existing PDF/Excel report template & specs)
- **Rent Roll** — all units, tenant, rent, status, balance.
- **Arrears Report** — who owes, amount, days overdue.
- **Collections Report** — payments in a period, by method/property.
- **Expenses Report** — expenses by category/property/period.
- **Net Income Report** — rent collected − expenses, per property/period.
- **Vacancy Report** — vacant units & vacancy duration.
- **Deposit Register** — deposits held/refunded/forfeited.
- **Tenant Statement** — per-tenant ledger (charges vs payments) PDF.

### 7.8 Reminders (in-app, v1)
- Badges/highlights for: rent due soon, overdue. (Email/SMS later.)

---

## 8. Non-Functional / Technical Approach

- **Frontend:** new lazy page(s) under `investorsportal/src/pages/property/…`, registered as a `property` tab in `App.jsx` `NAV` (+ bottom nav on mobile), reusing `ui.jsx` components, theme, icons, report engine, and the EAT date helpers. Mirrors existing page patterns (Dividends/Transactions) for consistency.
- **Subdomain routing:** detect `window.location.hostname.startsWith("property.")` at boot → default `tab` to the property dashboard and optionally constrain the visible nav to the property section. Main domain keeps full portal.
- **Backend:** new `prop_*` Supabase tables + RLS + a few RPCs (invoice generation, arrears summary, nav counts). Migrations via Supabase MCP / migration files.
- **Storage:** Supabase Storage bucket `property-docs` for contracts/IDs.
- **Deploy budget:** all work batched; single deploy when the module is feature-complete (Hobby plan = 100/month, push only when ready).
- **Money handling:** integer-safe TZS math, consistent with existing financial-safety hardening.

---

## 9. Subdomain Setup (final step)

1. Add `property.investorsportal.co.tz` to the Vercel project (CNAME / Vercel DNS).
2. Add the subdomain to **Supabase Auth** allowed redirect URLs.
3. Add the subdomain to **Google OAuth** authorized origins/redirects.
4. App detects hostname → lands on Property dashboard.
5. Verify login + deep-link on the subdomain.

---

## 10. Open Questions

### Resolved
- **Q-1 Permissions:** ✅ Full maker-checker (DE records → VR verifies), like transactions.
- **Q-3 Lease term:** ✅ Open-ended / rolling; `end_date` optional.
- **Q-5 Seed data:** ✅ None — owner enters everything via the UI.
- **Q-7 Deposit:** ✅ No fixed norm — entered manually per lease.
- **Q-8 Expenses:** ✅ In scope — owner operating expenses at company/property/unit level.
- **Q-9 Tax classification:** ✅ Out of scope for v1.
- **Q-10 Historical import:** ✅ Out — start fresh with current active tenants only.
- **Q-11 Hierarchy:** ✅ 3 levels — Company → Property → Unit.

### Remaining (proceeding on recommended defaults unless you say otherwise)
- **Q-2 Invoice generation:** **Default → on page-load idempotent upsert** for v1; add a
  daily Vercel Cron later if you want fully hands-off generation.
- **Q-4 Receipts:** **Default → yes**, auto-generate a printable receipt per *verified*
  payment, reusing the existing PDF report template.
- **Q-6 Amenities:** **Default starter list →** bedroom, lounge, kitchen, parking, toilet,
  bath (each unit can add custom amenities). Tell me if you want more in the default set.

---

## 11. Proposed Delivery Phases

1. **Phase 0 — Approve BRS** (this doc) + answer open questions. ✅ **DONE**
2. **Phase 1 — Data layer:** ✅ **DONE (2026-06-01)** — Supabase project `isfhvxyltwlswctcfcku`. 9 `prop_*` tables + enums + indexes + `updated_at` triggers; RLS on all (reference = SA/AD/DE write + all-roles read; leases/payments/expenses = 3-state maker-checker `pending→verified/rejected`; invoices read-only); `prop_generate_invoices()` SECURITY DEFINER generator; `property-docs` Storage bucket + policies; advisor-hardened. Maker-checker simplified to 3 states (vs transactions' 4) per "keep it simple."
3. **Phase 2 — Core UI:** Property tab + dashboard + Companies/Properties/Units + Tenants + Leases CRUD.
4. **Phase 3 — Money:** invoice generation engine, payments (partial + coverage-period lump sums), deposits, expenses, arrears, net income.
5. **Phase 4 — Reports & reminders:** PDF/Excel reports (incl. expenses & net income), in-app reminders, receipts.
6. **Phase 5 — Subdomain:** DNS + OAuth/Supabase config, verify, ship.

Each phase is reviewable; only Phase 5 consumes a production deploy.

---

## 12. Competitive / Inspiration Scan (web research, Jun 2026)

Researched comparable apps to borrow proven patterns. Two reference classes matter:

### A. Simple single-landlord apps (our closest analog)
- **Landlordy** — phone-first, minimal setup. Per-tenant **balance + payment history**,
  log payment in 2 taps, photo receipts, email/share invoices & receipts, reminders for
  outstanding payments and **lease renewals**, instant per-property income/expense reports.
  *Borrow:* the lean "tenant card → balance → log payment" flow; renewal reminders.
- **Landlord Studio** — almost certainly the app the owner exports from (the CSV's
  taxable/deductible columns are its IRS Schedule E format). Income/expense down to **unit
  level**, custom expense categories, receipt smart-scan, built-in late fees & receipts.
  *Borrow:* unit-level income+expense model (already in our design); expense categories.

### B. East-Africa apps (region fit — TZS, M-Pesa, SMS)
- **Nyumba Zetu / Bomahut / SILQU / EazzyRent (KE/TZ)** — automated **invoicing per charge
  type**, **M-Pesa + bank** reconciliation, **arrears/collection dashboards**, **SMS &
  WhatsApp** reminders, **tenant statements**, occupancy analytics.
  *Borrow (later phases):* M-Pesa/Tigo-Pesa reconciliation, SMS rent reminders, WhatsApp
  statements — high value in Tanzania, deferred past v1.

### Cross-app standard patterns to adopt
- **Tenant ledger** = the single source of truth per tenant (charges, payments, deposits,
  balance, receipt numbers). Our `prop_invoices` + `prop_payments` + tenant statement = this.
- **Rent Roll** report — all units, tenant, lease dates, rent, occupancy, total income.
- **Aged Receivables / Delinquency** report — arrears bucketed by how overdue (0–30/30–60/60+).
- **Automated reminders** — upcoming due, late, partial. (In-app v1; SMS later.)
- **Receipts & invoices** shareable to tenant/accountant.

### Deferred ideas worth a roadmap slot (not v1)
M-Pesa/Tigo-Pesa online collection, SMS/WhatsApp reminders & statements, tenant self-service
portal, receipt smart-scan (OCR), maintenance/work-order tracking, late-fee automation,
bank-feed reconciliation, lease-renewal reminders.

> **Net positioning:** v1 = a clean, region-aware **single-landlord ledger** (Landlordy-simple)
> that already does what the owner's current export shows (unit-level income + expenses) **plus**
> the dues/arrears engine those simple apps and the current tool lack — then grow toward the
> East-Africa feature set (M-Pesa, SMS) on the roadmap.
