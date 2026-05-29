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
//      НЕ триггерят fallback, возвращаются как есть.
//
// Endpoint: /v3/snapshot/options/{ticker}?apiKey={key}&limit=250
//   Опциональный фильтр expiration_date=YYYY-MM-DD — снимает cap на 250
//   контрактов для всей цепочки и возвращает 250 ИМЕННО для запрошенной
//   экспирации (хватает на все страйки даже у ликвидных тикеров).
// Документация: https://polygon.io/docs/options/get_v3_snapshot_options__underlyingasset
//
// Стратегия покрытия greeks:
//   Initial unfiltered call cap'ится на 250 контрактов и сгруппирован вокруг
//   ближайших экспираций. Далёкие даты (например AAPL 2026-06-26) выпадают
//   из выборки — клиент видел "—" во всех греках. Fallback на Finviz Elite
//   тоже бесполезен: для AAPL/SPY/тестовых тикеров колонки Delta/IV в CSV
//   приходят ПУСТЫМИ для всех 28 экспираций (verified 2026-05 probe).
//
//   Решение: после initial call идентифицируем экспирации без greek-coverage
//   и параллельно запрашиваем для каждой `expiration_date=YYYY-MM-DD` snapshot.
//   Polygon Starter не лимитит RPS → 28 parallel calls укладываются в 30s.

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const API_BASE_PRIMARY  = "https://api.polygon.io";
const API_BASE_FALLBACK = "https://api.massive.com";
const CONTRACT_LIMIT = 250;

// Cap on how many additional per-expiry fetches we'll make. Защита от
// случайного blow-up если Finviz вернёт мусорные даты или тикер очень
// богатый на экспирации (LEAPs до 2030+).
const MAX_EXTRA_EXPIRY_FETCHES = 35;

// Helper: один snapshot-запрос Massive с base-cascade и нормализованными
// ошибками. extraQuery — дополнительные query-параметры без leading "&".
async function fetchMassiveSnapshot(apiKey, ticker, extraQuery = "") {
  const tried = [];
  for (const base of [API_BASE_PRIMARY, API_BASE_FALLBACK]) {
    const url =
      `${base}/v3/snapshot/options/${encodeURIComponent(ticker)}` +
      `?apiKey=${encodeURIComponent(apiKey)}&limit=${CONTRACT_LIMIT}` +
      (extraQuery ? `&${extraQuery}` : "");

    let resp;
    try {
      resp = await fetch(url, { cache: "no-store" });
    } catch (e) {
      tried.push({ base, error: e?.message || String(e) });
      continue;
    }

    if (resp.status === 404) {
      tried.push({ base, status: 404 });
      continue;
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      let parsed = null;
      try { parsed = JSON.parse(errText); } catch {}
      return {
        ok: false,
        status: resp.status,
        error: parsed?.error || parsed?.message || `Massive API ${resp.status}`,
        base,
        raw: errText.slice(0, 800),
        tried,
      };
    }

    const data = await resp.json().catch(() => null);
    if (!data?.results) {
      return {
        ok: false,
        status: 502,
        error: "Empty or malformed response (no results array)",
        base,
        raw: JSON.stringify(data || {}).slice(0, 500),
        tried,
      };
    }
    return { ok: true, base, data, tried };
  }
  return {
    ok: false,
    status: 502,
    error: "Все endpoint'ы недоступны (404 / DNS / connect)",
    tried,
  };
}

// FMP — best-effort fetch для underlying price. Starter Massive план не
// всегда отдаёт underlying_asset.price → FMP как defensive fallback.
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

// ─── Finviz Elite options chain ──────────────────────────────────────────
// Используется ТОЛЬКО для премии (Last Close / Mid / Ask / Bid) — Massive
// Starter не отдаёт котировки. Делта/гамма/тета/вега/IV из Finviz в проде
// приходят пустыми (verified probe) — больше на них НЕ опираемся.
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

// Parse Finviz numeric — tolerates "23.45%", "5,000", empty string.
function parseFvNum(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace("%", "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Convert Finviz date "M/D/YYYY" → ISO "YYYY-MM-DD" (matches Massive).
function parseFvDateToIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
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

  // 1. Initial unfiltered snapshot — нужен для underlying_asset.price и
  // как baseline покрытие ближайших экспираций.
  const initial = await fetchMassiveSnapshot(apiKey, tickerRaw);
  if (!initial.ok) {
    return Response.json(
      {
        ok: false,
        error: initial.error,
        status: initial.status,
        base: initial.base,
        raw: initial.raw,
        tried: initial.tried,
      },
      { status: initial.status || 502 }
    );
  }

  const initialContracts = initial.data.results.map(normalizeContract).filter(Boolean);
  const massivePrice = initial.data.results[0]?.underlying_asset?.price ?? null;

  // 2. Параллельно: FMP underlying-price + Finviz CSV.
  const [fmp, finviz] = await Promise.all([
    fetchFmpPrice(tickerRaw),
    fetchFinvizOptionsChain(tickerRaw),
  ]);
  const underlyingPrice = fmp.price ?? massivePrice;

  // 3. Собираем универсум всех экспираций (Massive initial + Finviz).
  const allExpiries = new Set();
  for (const c of initialContracts) if (c.expiration) allExpiries.add(c.expiration);
  for (const fv of finviz.rows) {
    const e = parseFvDateToIso(fv.Expiry);
    if (e) allExpiries.add(e);
  }

  // 4. Считаем coverage по каждой экспирации в initial response.
  // Coverage = доля контрактов с непустыми greeks. Дальние даты обычно
  // имеют 0 контрактов в initial (cap 250 → не дотянулся).
  const initialCoverage = new Map(); // expIso → {total, withGreeks}
  for (const c of initialContracts) {
    const has = (c.delta != null && c.iv != null) ? 1 : 0;
    const prev = initialCoverage.get(c.expiration) || { total: 0, withGreeks: 0 };
    prev.total++; prev.withGreeks += has;
    initialCoverage.set(c.expiration, prev);
  }

  // 5. Определяем какие экспирации нуждаются в targeted per-expiry fetch.
  // Критерий: либо вообще нет контрактов в initial, либо greek-coverage < 80%.
  // Sorted по дате для предсказуемости (ближайшие первыми — если упрёмся
  // в MAX_EXTRA_EXPIRY_FETCHES, отрежем самые далёкие).
  const expiriesNeedingFetch = [...allExpiries]
    .filter(e => {
      const cov = initialCoverage.get(e);
      if (!cov || cov.total === 0) return true;
      return cov.withGreeks / cov.total < 0.8;
    })
    .sort()
    .slice(0, MAX_EXTRA_EXPIRY_FETCHES);

  // 6. Параллельный per-expiry fetch. Polygon Starter без RPS-лимита →
  // Promise.all безопасен. Каждый запрос ~300-500ms → slowest determines latency.
  const additionalSnapshots = await Promise.all(
    expiriesNeedingFetch.map(e =>
      fetchMassiveSnapshot(apiKey, tickerRaw, `expiration_date=${encodeURIComponent(e)}`)
        .then(r => ({ expiry: e, result: r }))
    )
  );

  // 7. Merge: initial → per-expiry. Каждая targeted выборка точнее по своей
  // экспирации, но может вернуть ошибку (rate-limit, plan-restriction) —
  // в таком случае оставляем то, что есть от initial. Перезаписываем только
  // если новый контракт имеет greeks, которых не было у существующего.
  const massiveByKey = new Map();
  for (const c of initialContracts) {
    massiveByKey.set(`${c.strike}|${c.type}|${c.expiration}`, c);
  }
  const additionalStats = {
    requested: expiriesNeedingFetch.length,
    ok: 0,
    failed: 0,
    contractsAdded: 0,
    contractsUpgraded: 0,
    errors: [],
  };
  for (const { expiry, result } of additionalSnapshots) {
    if (!result.ok) {
      additionalStats.failed++;
      additionalStats.errors.push({ expiry, error: result.error, status: result.status });
      continue;
    }
    additionalStats.ok++;
    for (const raw of result.data.results) {
      const c = normalizeContract(raw);
      if (!c) continue;
      const key = `${c.strike}|${c.type}|${c.expiration}`;
      const existing = massiveByKey.get(key);
      if (!existing) {
        massiveByKey.set(key, c);
        additionalStats.contractsAdded++;
      } else if (existing.delta == null && c.delta != null) {
        // Upgrade: ту же позицию, но с заполненными greeks.
        massiveByKey.set(key, c);
        additionalStats.contractsUpgraded++;
      }
    }
  }

  // 8. Build unified chain. Iterate over Finviz rows (полное покрытие
  // экспираций для премии) + добавляем "massive-only" контракты, у которых
  // нет Finviz-соответствия (на случай если Finviz пропустил какой-то страйк).
  let massiveMatched = 0, finvizOnly = 0, massiveOnly = 0;
  const unifiedContracts = [];
  const seenKeys = new Set();

  for (const fv of finviz.rows) {
    const type = (fv.Type || "").trim().toLowerCase();
    const strike = parseFvNum(fv.Strike);
    const expIso = parseFvDateToIso(fv.Expiry);
    if (!type || !Number.isFinite(strike) || !expIso) continue;

    const key = `${strike}|${type}|${expIso}`;
    seenKeys.add(key);
    const massive = massiveByKey.get(key);
    if (massive) massiveMatched++; else finvizOnly++;

    // Premium priority: Last Close → Mid(Bid,Ask) → Ask → Bid.
    const lastClose = parseFvNum(fv["Last Close"]);
    const bid = parseFvNum(fv.Bid);
    const ask = parseFvNum(fv.Ask);
    let premium = null, premiumSource = null;
    if (lastClose != null && lastClose > 0) { premium = lastClose; premiumSource = "last_close"; }
    else if (bid != null && ask != null && bid > 0 && ask > 0) { premium = (bid + ask) / 2; premiumSource = "mid"; }
    else if (ask != null && ask > 0) { premium = ask; premiumSource = "ask"; }
    else if (bid != null && bid > 0) { premium = bid; premiumSource = "bid"; }

    // Finviz IV percent → decimal — на случай если когда-нибудь начнёт
    // приходить заполненным (verified probe 2026-05: пустое, не используется).
    const fvIvPct = parseFvNum(fv.IV);
    const fvIvDec = fvIvPct != null ? fvIvPct / 100 : null;

    unifiedContracts.push({
      contractTicker: fv["Contract Name"] || massive?.contractTicker || null,
      type, strike, expiration: expIso,
      delta:         massive?.delta        ?? parseFvNum(fv.Delta),
      gamma:         massive?.gamma        ?? parseFvNum(fv.Gamma),
      theta:         massive?.theta        ?? parseFvNum(fv.Theta),
      vega:          massive?.vega         ?? parseFvNum(fv.Vega),
      iv:            massive?.iv           ?? fvIvDec,
      openInterest:  massive?.openInterest ?? parseFvNum(fv["Open Int."]),
      volume:        massive?.volume       ?? parseFvNum(fv.Volume),
      marketPremium: premium,
      premiumSource,
      greeksSource:  massive ? "massive" : (parseFvNum(fv.Delta) != null ? "finviz" : "none"),
    });
  }

  // Massive-only: контракты, которых не было в Finviz CSV.
  for (const [key, m] of massiveByKey) {
    if (seenKeys.has(key)) continue;
    massiveOnly++;
    unifiedContracts.push({
      contractTicker: m.contractTicker,
      type: m.type, strike: m.strike, expiration: m.expiration,
      delta: m.delta, gamma: m.gamma, theta: m.theta, vega: m.vega,
      iv: m.iv,
      openInterest: m.openInterest, volume: m.volume,
      marketPremium: m.last ?? null,
      premiumSource: m.last != null ? "massive_day_close" : null,
      greeksSource: "massive",
    });
  }

  // 9. Build expirations summary с coverage-метрикой — клиент видит
  // в dropdown'е реальное состояние данных.
  const expirySummary = new Map();
  for (const c of unifiedContracts) {
    let s = expirySummary.get(c.expiration);
    if (!s) {
      s = {
        expiry: c.expiration,
        contractCount: 0,
        volumeSum: 0, oiSum: 0, callOi: 0, putOi: 0,
        withGreeks: 0,
      };
      expirySummary.set(c.expiration, s);
    }
    s.contractCount++;
    s.volumeSum += c.volume || 0;
    s.oiSum += c.openInterest || 0;
    if (c.type === "call") s.callOi += c.openInterest || 0;
    if (c.type === "put")  s.putOi  += c.openInterest || 0;
    if (c.delta != null && c.iv != null) s.withGreeks++;
  }
  const expirations = [...expirySummary.values()]
    .map(s => ({ ...s, greekCoverage: s.contractCount > 0 ? s.withGreeks / s.contractCount : 0 }))
    .sort((a, b) => a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0);

  return Response.json({
    ok: true,
    base: initial.base,
    ticker: tickerRaw,
    underlyingPrice,
    priceSources: {
      massive: massivePrice,
      fmp: fmp.price,
      used: underlyingPrice === fmp.price && fmp.price != null ? "fmp" : "massive",
      fmp_status: fmp.source,
    },
    dataSources: {
      massiveInitialContracts: initialContracts.length,
      massiveTotalAfterEnrich: massiveByKey.size,
      finvizRows: finviz.rows?.length || 0,
      unifiedContracts: unifiedContracts.length,
      massiveMatched, finvizOnly, massiveOnly,
      finvizError: finviz.error || null,
      finvizStatus: finviz.status,
      additional: additionalStats,
    },
    expirations,
    contractCount: unifiedContracts.length,
    contracts: unifiedContracts,
    tried: initial.tried,
  });
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
