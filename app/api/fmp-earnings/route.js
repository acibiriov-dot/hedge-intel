// GET /api/fmp-earnings
// Returns: { ok, items: [{symbol, date, time, epsEstimated, revenueEstimated}], ... }
//
// REQUIRED env var on Vercel (Project Settings → Environment Variables):
//   FMP_API_KEY — Financial Modeling Prep API key.
//                 Free tier: 250 calls/day. Get it at:
//                 https://site.financialmodelingprep.com/developer/docs
//
// Why direct REST (not MCP): the deployed Vercel app has no MCP runtime —
// MCP servers live in local Claude Code sessions only. FMP exposes a clean
// REST endpoint that returns earnings calendar as JSON, no auth dance.
//
// Filter: results are restricted to the watchlist below. SPY/QQQ/IBIT don't
// report earnings (they're ETFs), but we keep them in the array for symmetry
// with /options' WATCHLIST — FMP simply returns no matches for them.

export const dynamic = "force-dynamic";

// Mirror of /options WATCHLIST. ETFs are excluded since they don't report.
const WATCHLIST = new Set([
  "NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META",
]);

const HORIZON_DAYS = 7;

export async function GET() {
  const apiKey = (process.env.FMP_API_KEY || "").trim();
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "FMP_API_KEY не задан на сервере (Vercel env vars)" },
      { status: 500 }
    );
  }

  // 7-day window starting today (UTC date is fine — earnings dates are coarse).
  const today = new Date();
  const end   = new Date(today.getTime() + HORIZON_DAYS * 86400000);
  const from = isoDate(today);
  const to   = isoDate(end);

  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(apiKey)}`;

  let raw;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return Response.json(
        { ok: false, error: `FMP вернул ${r.status}` },
        { status: 502 }
      );
    }
    raw = await r.json();
  } catch (e) {
    return Response.json(
      { ok: false, error: "FMP fetch failed: " + (e?.message || "network") },
      { status: 502 }
    );
  }

  if (!Array.isArray(raw)) {
    return Response.json(
      { ok: false, error: "FMP вернул не-массив (возможно лимит ключа исчерпан)" },
      { status: 502 }
    );
  }

  // Filter to watchlist + normalize shape. FMP fields:
  //   symbol, date (YYYY-MM-DD), time ("bmo"|"amc"|""), eps, epsEstimated,
  //   revenue, revenueEstimated, updatedFromDate, fiscalDateEnding
  const items = [];
  for (const row of raw) {
    if (!row || !row.symbol || !WATCHLIST.has(String(row.symbol).toUpperCase())) continue;
    items.push({
      symbol: String(row.symbol).toUpperCase(),
      date: row.date || "",
      time: row.time || "",
      epsEstimated: typeof row.epsEstimated === "number" ? row.epsEstimated : null,
      revenueEstimated: typeof row.revenueEstimated === "number" ? row.revenueEstimated : null,
      fiscalDateEnding: row.fiscalDateEnding || "",
    });
  }

  return Response.json({
    ok: true,
    from, to,
    horizonDays: HORIZON_DAYS,
    items,
    watchlistSize: WATCHLIST.size,
  });
}

function isoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
