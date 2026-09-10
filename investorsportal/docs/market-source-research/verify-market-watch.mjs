// Read-only verification. No app/database writes, cookies, API keys or login.
import fs from 'node:fs/promises';
const endpoint = 'https://investor.dse.co.tz/core/api/v1/market-watch/snapshot?page=0&size=100&sort=volume,desc';
const expected = ['AFRIPRISE','CRDB','DCB','DSE','MBP','MCB','MKCB','MUCOBA','NICO','NMB','PAL','SWIS','TBL','TCC','TCCL','TOL','TPCC','TTP','VODA','IEACLC-ETF','VERTEX-ETF'];
async function read(url) {
  const start = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return { body: await response.json(), milliseconds: Math.round(performance.now() - start) };
}
const [snapshot, equities, etfs] = await Promise.all([
  read(endpoint),
  read('https://dse.co.tz/api/get/market/prices/for/range/duration?days=5&class=EQUITY'),
  read('https://dse.co.tz/api/get/market/prices/for/range/duration?days=5&class=ETF'),
]);
const page = snapshot.body?.data?.page;
if (String(snapshot.body?.code) !== '2000' || !Array.isArray(page?.content)) throw new Error('Unexpected snapshot schema');
const bySymbol = new Map();
for (const row of page.content) {
  if (bySymbol.has(row.symbol)) throw new Error(`Duplicate symbol: ${row.symbol}`);
  bySymbol.set(row.symbol, row);
}
const closingRows = [equities, etfs].flatMap(r => {
  if (r.body.success !== true || !Array.isArray(r.body.data)) throw new Error('Unexpected closing-feed schema');
  return r.body.data;
}).sort((a,b) => b.trade_date.localeCompare(a.trade_date));
const results = expected.map(symbol => {
  const row = bySymbol.get(symbol);
  if (!row || typeof row.lastPrice !== 'number' || !Number.isFinite(row.lastPrice) || row.lastPrice <= 0) throw new Error(`Missing/invalid last price: ${symbol}`);
  if (!Number.isFinite(Date.parse(row.updatedAt))) throw new Error(`Missing/invalid quote timestamp: ${symbol}`);
  const close = closingRows.find(r => r.company === symbol);
  return { symbol, lastPrice: row.lastPrice, closingPrice: close?.closing_price ?? null,
    difference: close ? row.lastPrice-close.closing_price : null, quoteUpdatedAt: row.updatedAt,
    closeDate: close?.trade_date?.slice(0,10) ?? null,
    bestBid: row.bestBidPrice ?? null, bestOffer: row.bestOfferPrice ?? null };
});
const zeroSymbols = page.content.filter(r => !(r.lastPrice > 0)).map(r => r.symbol);
const report = { observedAt: new Date().toISOString(), endpoint, authenticated: false,
  responseMilliseconds: snapshot.milliseconds, snapshotRefreshedAt: snapshot.body.data.lastRefreshedAt,
  returnedRows: page.content.length, metadataTotal: page.totalElements,
  expectedSymbols: expected.length, validExpectedSymbols: results.length,
  differingPrices: results.filter(r => r.difference !== null && r.difference !== 0).length,
  zeroSymbols, results,
  caveats: ['Off-hours verification does not prove intraday refresh latency.',
    'updatedAt is the quote-record update time, not a guaranteed last-trade execution timestamp.',
    'Snapshot refresh time must not be substituted for quote-record update time.',
    'Server totalElements can differ from returned rows; validate required-symbol coverage.',
    'Public access is observed behavior, not a documented uptime or redistribution agreement.'] };
await fs.writeFile(new URL('./verification.json', import.meta.url), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
