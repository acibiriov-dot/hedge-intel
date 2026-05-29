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
    const contracts = data.results.map(normalizeContract).filter(Boolean);
    const underlyingPrice = data.results[0]?.underlying_asset?.price ?? null;

    return Response.json({
      ok: true,
      base,
      ticker: tickerRaw,
      underlyingPrice,
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
