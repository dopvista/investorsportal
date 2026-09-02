# Ilazo Rentals

Mobile-first rent-management app for **Dodoma Contemporary Appartments** (block Ilazo, Dodoma — 3 units, TZS).
One codebase, runs natively on **both Android and iPhone** (Expo managed workflow + React Native + TypeScript).

Built from the design handoff in `../Rental property Ilazo/design_handoff_ilazo_rentals/` — the HTML prototype,
README spec, screenshots and `source_transactions.csv` are the source of truth.

## Architecture

```
core/    Platform-agnostic domain logic — NO React Native imports.
         types · date math · money · coverage engine · statements/receipts · seed data.
         This layer is what the future web app will reuse verbatim.
store/   Persisted state (zustand + injectable storage adapter).
         Source of truth = { units, txns, company }; everything else derived on read.
src/     UI: theme tokens, components, navigation (React Navigation), 8 screens, bottom sheets.
```

### The coverage engine (core/engine.ts)

Rolling lease coverage, exactly per the handoff spec:

- months a payment covers = `round(amount / 300,000)`
- recording a payment advances the unit's `nextDue` by that many months (never touches `leaseStart`)
- `monthsDue(nextDue, today)` = count of month-periods whose start ≤ today; amount due = monthsDue × rent
- status: due > 0 → Arrears · covered > 1 month ahead → Paid ahead · else Up to date
- coverage labels derived by walking each tenant's payments oldest → newest from `leaseStart`
- statements always balance: Rent charged (months occupied) = Paid + Outstanding, with per-year
  opening/closing carry; former tenants cap at move-out
- "today" is the real current date (refreshed on app foreground)

## Tests

```
npm test          # 65 tests: date math, engine vs source_transactions.csv, statements, store persistence
npx tsc --noEmit  # strict type check
```

The engine is validated against the owner's real transaction history: replaying the 21 CSV transactions
reproduces the exact coverage pointers (Ilazo 1 → 24 Jun 2026, Ilazo 2 → 20 May 2026, Ilazo 3 → 8 May 2026),
lifetime totals (20,010,000 collected / 1,500,000 expenses), and the per-year statement carry.

## Run it (development)

```
npm install
npx expo start
```

- **Real devices:** install **Expo Go** (App Store / Play Store), scan the QR code — works for both platforms.
- **Android emulator:** press `a` (requires Android Studio emulator running).
- **iOS simulator:** press `i` (requires macOS; on Windows use Expo Go or an EAS build).

## Installable builds (EAS — iOS builds run in Expo's cloud, no Mac required)

```
npm install -g eas-cli
eas login
eas build -p android --profile preview   # installable .apk
eas build -p ios --profile preview       # internal iOS build (needs Apple Developer account)
eas build -p all --profile production    # store builds (.aab + App Store)
eas submit -p android / -p ios           # store submission
```

## Data & persistence

- Seeded on first launch from the real ledger (May 2024 → Mar 2026). Tenant/kin phone numbers are placeholders.
- All changes (payments, tenant registration/edits, company profile) persist locally via AsyncStorage
  and survive app restarts. The storage layer is a small injected adapter (`store/createStore.ts`),
  so a real backend can replace it without touching UI or engine code.

## Screens

Home · Units · Unit Details · Tenant Details · Tenants hub · More · Company Profile ·
Statements & Receipts (year-filtered), plus bottom sheets: Record payment (live coverage preview),
New tenant (handover to Former), Edit tenant, Tenant payment history, Receipt, Statement, Year filter.
