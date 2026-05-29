// GET /api/options-chain?ticker=AAPL
// Returns: { ok, base, ticker, underlyingPrice, contracts: [...] } or
//          { ok: false, error, status, debug }
//
// REQUIRED env var:
//   MASSIVE_API_KEY — Massive (бывш. Polygon) API ключ. Также принимается
//                     POLYGON_API_KEY для backward-совместимости.
//
// API_BASE стратегия:
//   1) Пробуем PRIMARY (https://api.polygon.io) — на 2026-05 это всё ещё
//      рабочий endpoint, бренд официально не сменился.
//   2) Если основной отдаёт 404 / DNS ошибку / connection refused →
//      пробуем FALLBACK (https://api.massive.com) — на случай если ребренд
//      когда-нибудь произойдёт реально или DNS изменится без анонса.
//   3) Auth-ошибки (401/403), rate-limit (429), серверные ошибки (5xx) —
//      НЕ триггерят fallback, возвращаются как есть. Эти ошибки осмысленны
//      и одинаковы на обоих доменах — fallback просто продублирует ошибку.
//
// Endpoint: /v3/snapshot/options/{ticker}?apiKey={key}&limit=250
// Документация: https://polygon.io/docs/options/get_v3_snapshot_options__underlyingasset

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const API_BASE_PRIMARY  = "https://api.polygon.io";
const API_BASE_FALLBACK = "https://api.massive.com";
const CONTRACT_LIMIT = 250;

// FMP — best-effort fetch для underlying price. Starter Massive план не
// всегда отдаёт underlying_asset.price → FMP как defensive fallback.
// Если FMP_API_KEY не задан или запрос упал — просто пропускаем,
// клиент получит Massive'ский underlyingPrice (или null).
async function fetchFmpPrice(ticker) {
  const key = (process.env.FMP_API_KEY || "").trim();
  if (!key) return { price: null, source: "fmp_unconfigured" };
  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return { price: null, source: `fmp_${r.status}` };
    const arr = await r.json();
    const price = Array.isArray(arr) && arr[0]?.price;
    return { price: typeof price === "number" && Number.isFinite(price) ? price : null, source: "fmp" };
  } catch {
    return { price: null, source: "fmp_error" };
  }
}

// ─── Finviz Elite options chain — для реальной цены опциона ──────────────
// Massive Starter план не отдаёт bid/ask/last → break_even_price = null.
// Finviz Elite экспортирует CSV с реальными котировками через
// /export/options?t={ticker}&ty=oc&auth={FINVIZ_KEY}.
//
// Реальные колонки (verified 2026-05 probe на AAPL):
//   Contract Name, Last Trade, Expiry (M/D/YYYY), Strike, Last Close,
//   Bid, Ask, Change $, Change %, Volume, Open Int., Type (lowercase
//   "call"/"put"), IV, Delta, Gamma, Theta, Vega, Rho
//
// Премия (priority order):
//   1. Last Close — последняя цена закрытия (всегда есть)
//   2. Mid (Bid+Ask)/2 — если оба котировки активны
//   3. Ask — если Bid отсутствует
//   4. Bid — если Ask отсутствует

function parseCsvLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

async function fetchFinvizOptionsChain(ticker) {
  const token = (process.env.FINVIZ_KEY || "").trim();
  if (!token) return { rows: [], error: "FINVIZ_KEY not set", status: 0 };

  const url = `https://elite.finviz.com/export/options?t=${encodeURIComponent(ticker)}&ty=oc&auth=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/csv,*/*",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("[options-chain.finviz]", r.status, errText.slice(0, 300));
      return { rows: [], error: `Finviz ${r.status}: ${errText.slice(0, 200)}`, status: r.status };
    }
    const text = (await r.text()).trim();
    if (!text || text.startsWith("<!") || text.startsWith("<html")) {
      console.error("[options-chain.finviz] received HTML — auth or ticker issue");
      return { rows: [], error: "Finviz returned HTML (auth / invalid ticker)", status: 200 };
    }

    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) return { rows: [], error: "Empty CSV from Finviz", status: 200 };

    const columns = parseCsvLine(lines[0]).map(c => c.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const row = {};
      columns.forEach((c, idx) => { row[c] = (cells[idx] ?? "").trim(); });
      rows.push(row);
    }
    return { rows, columns, status: 200 };
  } catch (e) {
    console.error("[options-chain.finviz] exception:", e?.message);
    return { rows: [], error: "Finviz exception: " + (e?.message || "unknown"), status: 0 };
  }
}

// Build lookup map: "strike|type|YYYY-MM-DD" → {premium, source}.
// Priority: Last Close → Mid(Bid,Ask) → Ask → Bid.
function buildFinvizPremiumMap(rows) {
  const map = new Map();
  for (const r of rows) {
    const type = (r.Type || "").trim().toLowerCase();
    const strike = parseFloat(String(r.Strike || "").replace(/,/g, ""));
    const expiryRaw = (r.Expiry || "").trim();
    if (!type || !Number.isFinite(strike) || !expiryRaw) continue;

    // M/D/YYYY → YYYY-MM-DD (matches Massive's expiration_date format)
    const m = expiryRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    const expIso = `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;

    const lastClose = parseFloat(r["Last Close"] || "");
    const bid = parseFloat(r.Bid || "");
    const ask = parseFloat(r.Ask || "");

    let premium = null, source = null;
    if (Number.isFinite(lastClose) && lastClose > 0) {
      premium = lastClose; source = "last_close";
    } else if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      premium = (bid + ask) / 2; source = "mid";
    } else if (Number.isFinite(ask) && ask > 0) {
      premium = ask; source = "ask";
    } else if (Number.isFinite(bid) && bid > 0) {
      premium = bid; source = "bid";
    }
    if (premium == null) continue;

    map.set(`${strike}|${type}|${expIso}`, { premium, source });
  }
  return map;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tickerRaw = (searchParams.get("ticker") || "").trim().toUpperCase();
  if (!tickerRaw || !/^[A-Z0-9.-]{1,10}$/.test(tickerRaw)) {
    return Response.json(
      { ok: false, error: "Нужен корректный ticker в query (?ticker=AAPL)" },
      { status: 400 }
    );
  }

  const apiKey = (process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "").trim();
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        error: "MASSIVE_API_KEY не задан на сервере",
        debug: {
          MASSIVE_API_KEY_exists: !!process.env.MASSIVE_API_KEY,
          POLYGON_API_KEY_exists: !!process.env.POLYGON_API_KEY,
        },
      },
      { status: 500 }
    );
  }

  // Cascade: primary → fallback. На auth/rate/server-ошибках primary'а
  // возвращаем сразу — fallback ничего не починит, только потратит время.
  const tried = [];
  for (const base of [API_BASE_PRIMARY, API_BASE_FALLBACK]) {
    const url = `${base}/v3/snapshot/options/${encodeURIComponent(tickerRaw)}?apiKey=${encodeURIComponent(apiKey)}&limit=${CONTRACT_LIMIT}`;

    let resp;
    try {
      resp = await fetch(url, { cache: "no-store" });
    } catch (e) {
      // DNS / connection error → пробуем следующий
      tried.push({ base, error: e?.message || String(e) });
      continue;
    }

    if (resp.status === 404) {
      // Specifically домен/path 404 → пробуем fallback
      tried.push({ base, status: 404 });
      continue;
    }

    if (!resp.ok) {
      // Auth, rate-limit, 5xx — реальная ошибка, не пытаемся fallback'ом
      const errText = await resp.text().catch(() => "");
      let parsed = null;
      try { parsed = JSON.parse(errText); } catch {}
      return Response.json(
        {
          ok: false,
          error: parsed?.error || parsed?.message || `Massive API ${resp.status}`,
          status: resp.status,
          base,
          raw: errText.slice(0, 800),
          tried,
        },
        { status: resp.status }
      );
    }

    const data = await resp.json().catch(() => null);
    if (!data?.results) {
      return Response.json(
        {
          ok: false,
          error: "Empty or malformed response (no results array)",
          base,
          raw: JSON.stringify(data || {}).slice(0, 500),
          tried,
        },
        { status: 502 }
      );
    }

    // Normalize контракты в плоскую форму. Underlying price берём из первого
    // контракта (он одинаков для всех — это spot price базового актива).
    const rawContracts = data.results.map(normalizeContract).filter(Boolean);
    const massivePrice = data.results[0]?.underlying_asset?.price ?? null;

    // Параллельно тянем (а) FMP для underlying-price fallback'а и
    // (б) Finviz Elite options chain для реальных премий → breakeven.
    // Promise.all чтобы не складывать latency'ы последовательно.
    const [fmp, finviz] = await Promise.all([
      fetchFmpPrice(tickerRaw),
      fetchFinvizOptionsChain(tickerRaw),
    ]);
    const underlyingPrice = fmp.price ?? massivePrice;
    const premiumMap = buildFinvizPremiumMap(finviz.rows);

    // Merge Finviz premium → marketPremium / premiumSource. Если matched
    // (strike + type + expiry) — клиент посчитает BE = strike ± premium.
    // Если нет matched — поле null, UI рендерит "—" (BS НЕ используется,
    // user explicit: реальные данные only).
    let premiumMatched = 0;
    const contracts = rawContracts.map(c => {
      const key = `${c.strike}|${c.type}|${c.expiration}`;
      const lookup = premiumMap.get(key);
      if (lookup) premiumMatched++;
      return {
        ...c,
        marketPremium: lookup?.premium ?? null,
        premiumSource: lookup?.source ?? null,
      };
    });

    return Response.json({
      ok: true,
      base,
      ticker: tickerRaw,
      underlyingPrice,
      priceSources: {
        massive: massivePrice,
        fmp: fmp.price,
        used: underlyingPrice === fmp.price && fmp.price != null ? "fmp" : "massive",
        fmp_status: fmp.source,
      },
      finvizPremiums: {
        rowsFetched: finviz.rows?.length || 0,
        mapEntries: premiumMap.size,
        contractsMatched: premiumMatched,
        contractsTotal: contracts.length,
        error: finviz.error || null,
        status: finviz.status,
      },
      contractCount: contracts.length,
      contracts,
      tried,
    });
  }

  // Оба base'а отдали 404 / DNS — возвращаем диагностический ответ
  return Response.json(
    {
      ok: false,
      error: "Все endpoint'ы недоступны (404 / DNS / connect). Проверь домен или ключ.",
      tried,
    },
    { status: 502 }
  );
}

// Plucks the fields we render in the UI; defensive about missing nested keys.
function normalizeContract(c) {
  if (!c?.details) return null;
  const d = c.details;
  return {
    contractTicker:    d.ticker || null,
    type:              d.contract_type || null,            // "call" | "put"
    strike:            num(d.strike_price),
    expiration:        d.expiration_date || null,           // "YYYY-MM-DD"
    delta:             num(c.greeks?.delta),
    gamma:             num(c.greeks?.gamma),
    theta:             num(c.greeks?.theta),
    vega:              num(c.greeks?.vega),
    iv:                num(c.implied_volatility),           // in decimal (0.35 = 35%)
    openInterest:      num(c.open_interest),
    breakEvenPrice:    num(c.break_even_price),
    last:              num(c.day?.close),
    volume:            num(c.day?.volume),
  };
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
