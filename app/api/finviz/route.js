export async function POST(request) {
  try {
    const { finvizKey, ticker } = await request.json();
    if (!finvizKey || !ticker) {
      return Response.json({ error: "Нужен Finviz Elite API Token и тикер" }, { status: 400 });
    }

    const t = ticker.trim().toUpperCase();
    const token = finvizKey.trim();

    const reqHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/csv,*/*",
    };

    function parseCSVLine(line) {
      const result = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      result.push(cur.trim());
      return result;
    }

    async function fetchView(v) {
      const url = `https://elite.finviz.com/export?v=${v}&t=${t}&auth=${token}`;
      try {
        const res = await fetch(url, { headers: reqHeaders, redirect: "follow" });
        const text = await res.text();
        const trimmed = text.trim();
        if (!res.ok || trimmed.startsWith("<!") || trimmed.startsWith("<html")) return {};
        const lines = trimmed.split("\n").filter(Boolean);
        if (lines.length < 2) return {};
        const hdrs = parseCSVLine(lines[0]);
        const tickerIdx = hdrs.findIndex(h => h === "Ticker");
        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVLine(lines[i]);
          if (tickerIdx === -1 || row[tickerIdx] === t) {
            const map = {};
            hdrs.forEach((h, idx) => { map[h] = row[idx] || ""; });
            return map;
          }
        }
      } catch {}
      return {};
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function formatMarketCap(raw) {
      const n = parseFloat(raw);
      if (isNaN(n)) return raw;
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " трлн";
      if (n >= 1_000)     return (n / 1_000).toFixed(2) + " млрд";
      return n.toFixed(2) + " млн";
    }

    // Batch requests to avoid rate limiting — two groups with a small gap
    // Exactly 5 requests — Finviz blocks the 6th regardless of timing
    const v171 = await fetchView(171); await sleep(200); // Technical: RSI, SMA, 52W, Beta, ATR
    const v131 = await fetchView(131); await sleep(200); // Ownership: insider, inst, short float
    const v161 = await fetchView(161); await sleep(200); // Financial: ROE, margins, debt, ratios
    const v111 = await fetchView(111); await sleep(200); // Overview: ticker, company, price, P/E
    const v141 = await fetchView(141);                   // Performance: perf%, volatility, rel vol
    const v121 = {};                                     // Skipped — Finviz blocks 6th request

    const raw = { ...v111, ...v121, ...v131, ...v141, ...v161, ...v171 };

    if (Object.keys(raw).length === 0) {
      return Response.json({ error: "Finviz не вернул данные. Проверь API Token." }, { status: 502 });
    }

    function g(...keys) {
      for (const k of keys) {
        const v = raw[k];
        if (v !== undefined && v !== "" && v !== "-" && v !== "N/A") return v;
      }
      return null;
    }

    // Helper: parse percentage string to number (e.g. "14.28%" → 0.1428)
    function parsePct(s) {
      if (!s) return null;
      const n = parseFloat(s.replace("%", ""));
      return isNaN(n) ? null : n / 100;
    }

    // Helper: format number nicely
    function fmt(n, decimals = 2) {
      if (n === null || isNaN(n)) return null;
      return n.toFixed(decimals);
    }

    const price = parseFloat(g("Price") || "0");
    const pe    = parseFloat(g("P/E") || "0");

    // Calculate EPS (ttm) from Price / P/E
    const epsCalc = (price > 0 && pe > 0) ? fmt(price / pe) : null;

    // Calculate actual SMA prices from % distance
    // e.g. SMA50 pct = "+14.28%" means price is 14.28% above SMA50 → SMA50 = price / 1.1428
    function calcSMA(pctStr) {
      const pct = parsePct(pctStr);
      if (pct === null || price <= 0) return null;
      return fmt(price / (1 + pct));
    }

    // Calculate actual 52W High/Low from % distance
    // 52W High pct = "-5.55%" means price is 5.55% below 52W High → High = price / (1 - 0.0555)
    function calc52W(pctStr, isHigh) {
      const pct = parsePct(pctStr);
      if (pct === null || price <= 0) return null;
      // High: negative pct (price below high) → High = price / (1 + pct) where pct is negative
      // Low: positive pct (price above low) → Low = price / (1 + pct)
      const result = price / (1 + pct);
      return fmt(result);
    }

    const sma20raw  = g("20-Day Simple Moving Average");
    const sma50raw  = g("50-Day Simple Moving Average");
    const sma200raw = g("200-Day Simple Moving Average");
    const h52wraw   = g("52-Week High");
    const l52wraw   = g("52-Week Low");

    const data = {
      ticker:       g("Ticker") || t,
      company:      g("Company") || "-",
      sector:       g("Sector") || "-",
      industry:     g("Industry") || "-",
      country:      g("Country") || "-",

      price:        g("Price") || "-",
      change:       g("Change") || "-",
      volume:       g("Volume") || "-",
      marketCap:    g("Market Cap") ? formatMarketCap(g("Market Cap")) : "-",
      avgVolume:    g("Average Volume") || "-",
      relVolume:    g("Relative Volume") || "-",

      pe:           g("P/E") || "-",
      forwardPE:    g("Forward P/E") || "-",
      peg:          g("PEG") || "-",
      ps:           g("P/S") || "-",
      pb:           g("P/B") || "-",
      pfcf:         g("P/Free Cash Flow") || "-",

      // EPS calculated from Price / P/E (exact value from Finviz)
      eps:          epsCalc || "-",

      epsThisY:     g("EPS Growth This Year") || "-",
      epsNextY:     g("EPS Growth Next Year") || "-",
      epsPast5Y:    g("EPS Growth Past 5 Years") || "-",
      epsNext5Y:    g("EPS Growth Next 5 Years") || "-",
      salesPast5Y:  g("Sales Growth Past 5 Years") || "-",

      outstanding:  g("Shares Outstanding") || "-",
      float:        g("Shares Float") || "-",
      insiderOwn:   g("Insider Ownership") || "-",
      insiderTrans: g("Insider Transactions") || "-",
      instOwn:      g("Institutional Ownership") || "-",
      instTrans:    g("Institutional Transactions") || "-",
      floatShort:   g("Short Float") || "-",
      shortRatio:   g("Short Ratio") || "-",

      dividend:     g("Dividend Yield") || "-",
      roa:          g("Return on Assets") || "-",
      roe:          g("Return on Equity") || "-",
      roi:          g("Return on Invested Capital") || "-",
      currentRatio: g("Current Ratio") || "-",
      quickRatio:   g("Quick Ratio") || "-",
      ltDebtEq:     g("LT Debt/Equity") || "-",
      debtEq:       g("Total Debt/Equity") || "-",
      grossMargin:  g("Gross Margin") || "-",
      operMargin:   g("Operating Margin") || "-",
      profitMargin: g("Profit Margin") || "-",

      // Technical — actual prices (calculated from % distance)
      rsi:          g("Relative Strength Index (14)") || "-",
      sma20:        calcSMA(sma20raw) ? "$" + calcSMA(sma20raw) : (sma20raw || "-"),
      sma50:        calcSMA(sma50raw) ? "$" + calcSMA(sma50raw) : (sma50raw || "-"),
      sma200:       calcSMA(sma200raw) ? "$" + calcSMA(sma200raw) : (sma200raw || "-"),
      high52w:      calc52W(h52wraw, true) ? "$" + calc52W(h52wraw, true) : (h52wraw || "-"),
      low52w:       calc52W(l52wraw, false) ? "$" + calc52W(l52wraw, false) : (l52wraw || "-"),
      beta:         g("Beta") || "-",
      atr:          g("Average True Range") || "-",
      volatilityW:  g("Volatility (Week)") || "-",
      volatilityM:  g("Volatility (Month)") || "-",

      // SMA % distances (for context in prompts)
      sma20pct:     sma20raw || "-",
      sma50pct:     sma50raw || "-",
      sma200pct:    sma200raw || "-",

      perfWeek:     g("Performance (Week)") || "-",
      perfMonth:    g("Performance (Month)") || "-",
      perfQuart:    g("Performance (Quarter)") || "-",
      perfHalf:     g("Performance (Half Year)") || "-",
      perfYTD:      g("Performance (YTD)") || "-",
      perfYear:     g("Performance (Year)") || "-",

      // Target Price / Recom — not available via export API, omit
      recom:        "-",
      targetPrice:  "-",
    };

    return Response.json({ data });

  } catch (err) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
