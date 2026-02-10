/**
 * Test script for getValuation (Yahoo Finance valuation extractor)
 * Run with: npx tsx scripts/test-valuation.ts [SYMBOL]
 */

import { getValuation } from '../src/tools/valuationExtractor';

const symbol = process.argv[2] || 'AAPL';

async function main() {
  console.log(`Fetching valuation for ${symbol}...\n`);
  const data = await getValuation(symbol);
  console.log(JSON.stringify(data, null, 2));
  const hasData = data.price != null || data.peRatio != null || data.marketCap != null;
  console.log(hasData ? '\n✅ Success' : '\n⚠️ No numeric data (check symbol or page structure)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
