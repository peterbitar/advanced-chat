import axios from 'axios';

export interface ValuationData {
  symbol: string;
  price: number | null;
  peRatio: number | null;
  pegRatio: number | null;
  epsTTM: number | null;
  forwardPE: number | null;
  marketCap: string | null;
  source: string;
}

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export async function getValuation(symbol: string): Promise<ValuationData> {
  const ticker = symbol.toUpperCase().trim();
  try {
    const { data } = await axios.get<ChartResponse>(`${CHART_URL}/${ticker}`, {
      params: { interval: '1d', range: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 5000,
    });

    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) {
      return fallback(ticker);
    }

    const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;

    return {
      symbol: ticker,
      price,
      peRatio: null,
      pegRatio: null,
      epsTTM: null,
      forwardPE: null,
      marketCap: null,
      source: 'Yahoo Finance',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch data for ${ticker}:`, msg);
    return fallback(ticker);
  }
}

function fallback(symbol: string): ValuationData {
  return {
    symbol,
    price: null,
    peRatio: null,
    pegRatio: null,
    epsTTM: null,
    forwardPE: null,
    marketCap: null,
    source: 'Yahoo Finance',
  };
}

interface ChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
        symbol?: string;
        longName?: string;
        regularMarketVolume?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
      };
    }>;
  };
}
