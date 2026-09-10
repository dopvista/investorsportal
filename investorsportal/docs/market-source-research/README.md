# Selected source: DSE investor market-watch snapshot

Decision made 11 September 2026, approximately 02:28 EAT.

Use the market-watch snapshot behind the new official DSE investor web app as the
primary source for last-traded prices. Retain the existing dse.co.tz closing-price
feed for daily history, official closes, and explicitly labelled fallback values.
This establishes a tested source; the production integration has not been changed.

## Working request

GET https://investor.dse.co.tz/core/api/v1/market-watch/snapshot?page=0&size=100&sort=volume,desc

Two independent direct requests succeeded with HTTP 200, without credentials,
cookies or an API key. The first used PowerShell; the second used Node fetch.
The Node request completed in approximately 1.07 seconds. No TLS checks were disabled.

The endpoint was found in a JavaScript asset served by the official investor app:
https://investor.dse.co.tz/_next/static/chunks/5980-d6305bd5f54898dc.js
Its market-watch service requests this route using page, size, sort, q and description
parameters. This is an observed application interface, not a published API contract.

## Verified coverage and differences

The response contained 28 rows, including valid positive lastPrice values for all
21 symbols in Investors Portal's DSE_TO_DB_MAP. Both IEACLC-ETF and VERTEX-ETF were
included. Fourteen supported symbols differed from the existing closing-price feed.

| Symbol | Snapshot lastPrice | Official closing feed | Difference |
|---|---:|---:|---:|
| CRDB | 2,880 | 2,840 | +40 |
| NMB | 2,200 | 2,190 | +10 |
| NICO | 3,880 | 3,830 | +50 |
| SWIS | 2,670 | 2,790 | -120 |
| VODA | 1,120 | 1,110 | +10 |
| IEACLC-ETF | 1,440 | 1,460 | -20 |
| VERTEX-ETF | 315 | 310 | +5 |

Values above are TZS from the 10 September session, observed after market hours.
They demonstrate a distinct last-price field, not measured live trading latency.
No side-by-side authenticated Hisa Kiganjani session was used; the source is the
official new web app's market-watch service itself.

## Response mapping for integration

- Successful envelope: code `2000`; quotes: `data.page.content`.
- `symbol` -> existing DSE_TO_DB_MAP. VERTEX-ETF maps to the database name VERTEX ETF.
- `lastPrice` -> latest traded market price, only when finite and strictly positive.
- `priceChange` / `priceChangePct` -> snapshot price change. Do not recompute it by
  mixing lastPrice with the same day's official close.
- `bestBidPrice`, `bestOfferPrice` and quantities -> optional quote details.
- `updatedAt` -> quote-record update timestamp. It is not guaranteed to be the
  execution time of the last trade.
- `data.lastRefreshedAt` -> snapshot refresh time, kept separately from each row's timestamp.
- Official daily closing history remains sourced from the existing duration API.

## Handling required before production use

1. Ignore zero or missing last prices; do not overwrite portfolio values with zero.
   EABL, JHL, KA, NMG and USL returned zero in this sample. None are in the app's current 21-symbol map.
2. Validate supported-symbol coverage. Pagination metadata reported 49 totalElements,
   but content contained 28 rows and last=true. Do not treat totalElements as the
   count of usable equity/ETF quotes or assume all securities are present.
3. Preserve both quote time and fetch time; reject an older quote replacing a newer
   quote from the same source. Never label unchanged prior-session prices as today's trades.
4. Fall back per symbol, retaining the last valid snapshot where appropriate; distinguish
   last-traded, retained/stale, and official-close values in the UI.
5. Keep snapshot and closing-feed OHLC/change fields separate where they differ. A single
   price row must not silently combine incompatible fields from different snapshots.
6. Verify refresh behavior during market hours. The two tests here were after market close;
   no tick-by-tick or maximum-delay guarantee has been established.
7. Public access works today but is not an uptime, rate-limit or redistribution agreement.
   Use a server-side adapter with timeouts and fallback rather than login-page scraping.

## Alternatives evaluated

- Hisa Zangu CRDB, NMB and DSE pages matched the closing feed, explicitly labelled end of day.
  They do not improve on the new official snapshot as the primary last-price source.
  https://www.hisazangu.com/stocks/CRDB
- DSE public range/trend endpoint with isLastTradeTrend=1 returned closing_price, despite
  the suggestive parameter name. Its gainers endpoint also matched closing values.
  The movers endpoint returned CRDB 2,810 and NMB 2,130 (previous closes in the compared data),
  so it is unsuitable as a latest-price source.
- Mansa documents a Tanzania stock API, but its stated refresh cadence is 30 minutes and
  its methodology page still described DSE integration as coming soon while other pages
  advertised coverage. No reason to prefer it over the directly verified official feed.
  https://mansamarkets.com/developers
  https://www.mansamarkets.com/methodology
- DSE licensed live-data services remain the route for contractual service guarantees.
  https://dse.co.tz/market/data/overview

## Reproduce

From the repository root, run:

```powershell
node investorsportal/docs/market-source-research/verify-market-watch.mjs
```

The verifier makes three read-only public GET requests, validates all supported symbols,
and writes `verification.json`. It never reads credentials or updates the app database.
`investor-snapshot.json` preserves the initial raw market-watch response.
