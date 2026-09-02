# Kickoff prompt for Claude Code — Ilazo Rentals

Copy everything below the line into Claude Code, from the root of the repo where you want the app built. The handoff bundle (this folder) should be present so Claude Code can read the referenced files.

---

You are helping me build **Ilazo Rentals**, a mobile-first rent-management app for a private landlord who owns one small property (**Dodoma Contemporary Appartments**, block **Ilazo**, Dodoma, Tanzania — 3 units). Currency is Tanzanian Shilling (TZS). This is Phase 1 (mobile); a web app will follow later sharing the same domain model, so keep business logic in a reusable, platform-agnostic layer.

## Start by reading the handoff
Before writing any code, read these files in the handoff folder and treat them as the source of truth:
- `README.md` — the full functional + layout + design-token spec. Read it completely.
- `Ilazo Rentals.dc.html` — an interactive HTML **design reference** (all screens + working logic). It is a prototype, NOT code to copy. Open/inspect it to see exact layout, copy, colors, and behavior.
- `source_transactions.csv` — the owner's real transaction history; use it to seed and validate the database.
- `screens/*.png` — reference screenshots of every screen.

The HTML prototype uses an in-house reactive runtime; do not port that. Recreate the designs in a real stack.

## What to build
Recreate the eight screens/flows documented in the README **at high fidelity** (final colors, type, spacing, copy, interactions): Home, Units list, Unit Details, Tenant Details, Tenants hub, Statements & Receipts, the Record-payment sheet, and the New/Edit-tenant sheet. Match the screenshots closely.

## The most important part: the tenure/coverage engine
The heart of the app is **rolling lease coverage** — rent accrues monthly (flat 300,000 TZS/unit/month), and payments (usually multi-month lump sums) buy whole months of coverage forward. Implement this as a well-tested, pure module BEFORE building UI. It must reproduce the README's formulas exactly:
- months a payment covers = round(amount / 300000)
- recording a payment advances the unit's `nextDue` by that many months (never change `leaseStart`)
- monthsDue(nextDue) = count of month-periods whose start ≤ today; amount due = monthsDue × rent
- status: due>0 Arrears, due==0 Current
- coverage labels derived by walking each tenant's payments oldest→newest from leaseStart
- statement reconciliation always balances: Rent charged (months occupied) = Paid + Outstanding, with per-year opening/closing carry and former-tenant cap at move-out
- "today" = the real current date

Write unit tests that validate this engine against `source_transactions.csv` (e.g. as of the CSV's latest date, the three current tenants' balances and covered-through dates match the prototype).

## Tech stack
If this repo already has a mobile framework/design system, use it and follow its established patterns. If it's empty, propose a stack before building — my default preference is **React Native + Expo + TypeScript** with a lightweight local store now and a pluggable persistence layer (so a real backend/DB and the future web app can share the `core/` logic). Ask me if unsure.

## Architecture guidance
- `core/` (platform-agnostic, no UI): domain types (Unit, Transaction, Kin, Company), the coverage/statement engine, formatters, and the seed loader — fully unit-tested. This is what the web app will reuse.
- `app/` (UI): screens, navigation, components, styled per the README's design tokens.
- Persisted source of truth = units + transactions + company; everything else (balances, coverage, statements, active/former classification) is derived on read.

## Data model (see README for full detail)
- Unit: `{ id, name, type: 'Single'|'Couples'|'Family', rent, tenant, phone, leaseStart, nextDue, kin:{name,phone,rel} }`
- Transaction: `{ date, tenant, unit, amount, method, covers, type: 'rent'|'expense' }`
- Registering a new tenant on a unit resets leaseStart/nextDue to the tenure start and moves the previous occupant to "Former" (keep all their transactions).

## Design tokens (see README for the complete list)
Fonts: Space Grotesk (headings/figures) + Plus Jakarta Sans (body); Material Symbols Rounded icons. Warm cream background `#F6F1E9`; primary green `#10715A` (gradients `#12805F→#0B5B45`, `#15886B→#0A5741`); ink `#17241F`; arrears red `#BE4B33`; credit amber `#B07417`. Cards 20–28px radius, soft shadows. Min tap target 40px+.

## A note on the attached design system
My design project also has a separate "Design System" that the prototype predates and does not use. If this codebase already embodies that system, prefer its tokens/components and treat this handoff as the functional/layout spec. Otherwise use the tokens above.

## Suggested order of work
1. Confirm stack; scaffold `core/` + `app/`.
2. Build & unit-test the coverage/statement engine against the CSV.
3. Data layer + seed from CSV.
4. Screens in order: Home → Units → Unit Details → Tenant Details → Record-payment sheet → New/Edit tenant → Statements/Receipts → Company profile.
5. Wire persistence; single-owner auth.
6. Polish to match screenshots; then we plan the web app on the same `core/`.

Please start by reading the handoff files and proposing (a) the stack and (b) a short implementation plan. Do not skip the engine tests.
