// GET /api/options-chain?ticker=AAPL[&expiry=YYYY-MM-DD]
//
// Два режима — frontend дёргает initial один раз на тикер и per-expiry при
// смене даты в селекторе.
//
// ── Mode 1: INITIAL (без expiry param) ────────────────────────────────────
//   Назначение: дать клиенту список всех экспираций для dropdown'а + сразу
//   готовые данные для default-даты, чтобы первое отрисованное состояние
//   было полным.
//   Параллельно:
//     · Massive unfiltered snapshot — underlying price + baseline.
//     · Finviz full CSV — полный список экспираций.
//     · FMP quote — best-effort underlying price.
//   Затем server picks defaultExpiry (today если 0DTE с volume → nearest
//   future с volume → с OI → любая будущая) и делает Finviz e=defaultExpiry
//   для реальных греков/IV/премий.
//   Возвращает: expirations[], defaultExpiry, expiry=defaultExpiry,
//   contracts (для default), underlyingPrice.
//
// ── Mode 2: PER-EXPIRY (?expiry=YYYY-MM-DD) ───────────────────────────────
//   Назначение: вернуть полные греки/IV/премии для выбранной даты без
//   повторной выкачки полного списка экспираций.
//   Параллельно:
//     · Finviz CSV с e=expiry — primary греков/IV/премии. Verified probe
//       2026-05: AAPL 2026-06-26 (28 дней) → 116 строк, 0 пустых Delta,
//       0 пустых IV. На дальних датах Finviz e= тянет всё.
//     · Massive snapshot с expiration_date=expiry — fallback на случай
//       если Finviz пропустил какой-то страйк.
//     · FMP quote — best-effort underlying price.
//   Возвращает: expiry, contracts (только для expiry), underlyingPrice.
//   БЕЗ expirations[]/defaultExpiry — frontend закэшировал от initial.
//
// REQUIRED env vars:
//   MASSIVE_API_KEY (or POLYGON_API_KEY) — для Massive snapshot fallback.
//   FINVIZ_KEY — для Finviz Elite CSV export (primary греков).
//   FMP_API_KEY — для FMP quote (best-effort underlying).

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const API_BASE_PRIMARY  = "https://api.polygon.io";
const API_BASE_FALLBACK = "https://api.massive.com";
const CONTRACT_LIMIT = 250;

// ============================================================================
// External fetchers
// ============================================================================

// Massive snapshot — base cascade (polygon.io primary → massive.com fallback).
// extraQuery: без leading "&", например "expiration_date=2026-06-26".
async function fetchMassiveSnapshot(apiKey, ticker, extraQuery = "") {
  const tried = [];
  for (const base of [API_BASE_PRIMARY, API_BASE_FALLBACK]) {
    const url =
      `${base}/v3/snapshot/options/${encodeURIComponent(ticker)}` +
      `?apiKey=${encodeURIComponent(apiKey)}&limit=${CONTRACT_LIMIT}` +
      (extraQuery ? `&${extraQuery}` : "");
    let resp;
    try { resp = await fetch(url, { cache: "no-store" }); }
    catch (e) { tried.push({ base, error: e?.message || String(e) }); continue; }
    if (resp.status === 404) { tried.push({ base, status: 404 }); continue; }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      let parsed = null; try { parsed = JSON.parse(errText); } catch {}
      return {
        ok: false, status: resp.status,
        error: parsed?.error || parsed?.message || `Massive ${resp.status}`,
        base, raw: errText.slice(0, 800), tried,
      };
    }
    const data = await resp.json().catch(() => null);
    if (!data?.results) {
      return {
        ok: false, status: 502,
        error: "Empty Massive response (no results)",
        base, raw: JSON.stringify(data || {}).slice(0, 500), tried,
      };
    }
    return { ok: true, base, data, tried };
  }
  return { ok: false, status: 502, error: "All Massive endpoints unavailable", tried };
}

// FMP — best-effort underlying price.
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

// Finviz Elite options chain. expiry="" → полная цепочка (все даты),
// expiry="YYYY-MM-DD" → только выбранная дата (Finviz возвращает полные
// греки/IV для любого срока при использовании e= параметра).
async function fetchFinvizOptionsChain(ticker, expiry = "") {
  const token = (process.env.FINVIZ_KEY || "").trim();
  if (!token) return { rows: [], error: "FINVIZ_KEY not set", status: 0 };

  let url = `https://elite.finviz.com/export/options?t=${encodeURIComponent(ticker)}&ty=oc&auth=${encodeURIComponent(token)}`;
  if (expiry) url += `&e=${encodeURIComponent(expiry)}`;

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
      console.error("[options-chain.finviz]", expiry || "(all)", r.status, errText.slice(0, 300));
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

// ============================================================================
// Parsing helpers
// ============================================================================

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

// "23.45%", "5,000", "" → number | null
function parseFvNum(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace("%", "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// "M/D/YYYY" → "YYYY-MM-DD" | null
function parseFvDateToIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

// Massive contract → flat shape used in API response.
function normalizeMassive(c) {
  if (!c?.details) return null;
  const d = c.details;
  return {
    contractTicker: d.ticker || null,
    type:           d.contract_type || null,
    strike:         num(d.strike_price),
    expiration:     d.expiration_date || null,
    delta:          num(c.greeks?.delta),
    gamma:          num(c.greeks?.gamma),
    theta:          num(c.greeks?.theta),
    vega:           num(c.greeks?.vega),
    iv:             num(c.implied_volatility),
    openInterest:   num(c.open_interest),
    breakEvenPrice: num(c.break_even_price),
    last:           num(c.day?.close),
    volume:         num(c.day?.volume),
  };
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Build unified contract from Finviz row + optional Massive fallback.
// Greeks priority: Finviz (primary, per probe) → Massive (fallback for ниши
// где Finviz row есть но греки пустые).
function buildContractFromFinviz(fv, massiveMaybe) {
  const type = (fv.Type || "").trim().toLowerCase();
  const strike = parseFvNum(fv.Strike);
  const expIso = parseFvDateToIso(fv.Expiry);
  if (!type || !Number.isFinite(strike) || !expIso) return null;

  // Premium priority: Last Close → Mid(Bid,Ask) → Ask → Bid.
  const lastClose = parseFvNum(fv["Last Close"]);
  const bid = parseFvNum(fv.Bid);
  const ask = parseFvNum(fv.Ask);
  let premium = null, premiumSource = null;
  if (lastClose != null && lastClose > 0) { premium = lastClose; premiumSource = "last_close"; }
  else if (bid != null && ask != null && bid > 0 && ask > 0) { premium = (bid + ask) / 2; premiumSource = "mid"; }
  else if (ask != null && ask > 0) { premium = ask; premiumSource = "ask"; }
  else if (bid != null && bid > 0) { premium = bid; premiumSource = "bid"; }

  // Finviz IV приходит в percent, Massive в decimal → нормализуем к decimal.
  const fvIvPct = parseFvNum(fv.IV);
  const fvIvDec = fvIvPct != null ? fvIvPct / 100 : null;
  const fvDelta = parseFvNum(fv.Delta);
  const fvGamma = parseFvNum(fv.Gamma);
  const fvTheta = parseFvNum(fv.Theta);
  const fvVega  = parseFvNum(fv.Vega);

  // Источник греков — кто реально дал значение (для diagnostics).
  const greeksFromFinviz = fvDelta != null;
  const greeksFromMassive = !greeksFromFinviz && massiveMaybe?.delta != null;

  return {
    contractTicker: fv["Contract Name"] || massiveMaybe?.contractTicker || null,
    type, strike, expiration: expIso,
    delta:        fvDelta ?? massiveMaybe?.delta  ?? null,
    gamma:        fvGamma ?? massiveMaybe?.gamma  ?? null,
    theta:        fvTheta ?? massiveMaybe?.theta  ?? null,
    vega:         fvVega  ?? massiveMaybe?.vega   ?? null,
    iv:           fvIvDec ?? massiveMaybe?.iv     ?? null,
    openInterest: parseFvNum(fv["Open Int."]) ?? massiveMaybe?.openInterest ?? null,
    volume:       parseFvNum(fv.Volume)       ?? massiveMaybe?.volume       ?? null,
    marketPremium: premium,
    premiumSource,
    greeksSource: greeksFromFinviz ? "finviz" : (greeksFromMassive ? "massive" : "none"),
  };
}

// Server-side default expiry picker — синхронизирована с frontend'ом.
//   1) today если volumeSum > 0 (liquid 0DTE — SPX/SPY)
//   2) nearest future с volumeSum > 0
//   3) nearest future с oiSum > 0 (off-hours probe)
//   4) первое доступное по дате
function pickDefaultExpiry(expirations) {
  if (!expirations?.length) return null;
  const today = todayIsoServer();
  const todayE = expirations.find(e => e.expiry === today);
  if (todayE && todayE.volumeSum > 0) return today;
  const futureWithVol = expirations.filter(e => e.expiry >= today && e.volumeSum > 0)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  if (futureWithVol) return futureWithVol.expiry;
  const futureWithOi = expirations.filter(e => e.expiry >= today && e.oiSum > 0)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  if (futureWithOi) return futureWithOi.expiry;
  const future = expirations.filter(e => e.expiry >= today)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  return future?.expiry || expirations[expirations.length - 1].expiry;
}

function todayIsoServer() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================================
// Common: build contracts list from Finviz e= rows + Massive fallback map
// ============================================================================

function assembleContracts(finvizRows, massiveByKey) {
  let contractsFromFinviz = 0, contractsMassiveOnly = 0;
  const contracts = [];
  const seenKeys = new Set();

  for (const fv of finvizRows) {
    const type = (fv.Type || "").trim().toLowerCase();
    const strike = parseFvNum(fv.Strike);
    const expIso = parseFvDateToIso(fv.Expiry);
    if (!type || !Number.isFinite(strike) || !expIso) continue;
    const key = `${strike}|${type}|${expIso}`;
    const c = buildContractFromFinviz(fv, massiveByKey.get(key));
    if (!c) continue;
    contracts.push(c);
    seenKeys.add(key);
    contractsFromFinviz++;
  }
  // Massive-only: контракты которых Finviz не отдал (пропущенные страйки).
  for (const [key, m] of massiveByKey) {
    if (seenKeys.has(key)) continue;
    contracts.push({
      contractTicker: m.contractTicker,
      type: m.type, strike: m.strike, expiration: m.expiration,
      delta: m.delta, gamma: m.gamma, theta: m.theta, vega: m.vega,
      iv: m.iv,
      openInterest: m.openInterest, volume: m.volume,
      marketPremium: m.last ?? null,
      premiumSource: m.last != null ? "massive_day_close" : null,
      greeksSource: m.delta != null ? "massive" : "none",
    });
    contractsMassiveOnly++;
  }
  return { contracts, contractsFromFinviz, contractsMassiveOnly };
}

// ============================================================================
// Mode handlers
// ============================================================================

async function handlePerExpiry({ apiKey, ticker, expiry }) {
  // 3 параллельных запроса для одной выбранной даты — все нужны.
  const [finviz, massive, fmp] = await Promise.all([
    fetchFinvizOptionsChain(ticker, expiry),
    fetchMassiveSnapshot(apiKey, ticker, `expiration_date=${encodeURIComponent(expiry)}`),
    fetchFmpPrice(ticker),
  ]);

  const massiveContracts = massive.ok
    ? massive.data.results.map(normalizeMassive).filter(Boolean)
    : [];
  const massivePrice = massive.ok
    ? (massive.data.results[0]?.underlying_asset?.price ?? null)
    : null;
  const underlyingPrice = fmp.price ?? massivePrice;

  const massiveByKey = new Map();
  for (const c of massiveContracts) {
    massiveByKey.set(`${c.strike}|${c.type}|${c.expiration}`, c);
  }

  const { contracts, contractsFromFinviz, contractsMassiveOnly } =
    assembleContracts(finviz.rows, massiveByKey);

  return Response.json({
    ok: true,
    ticker,
    expiry,
    underlyingPrice,
    priceSources: {
      massive: massivePrice,
      fmp: fmp.price,
      used: underlyingPrice === fmp.price && fmp.price != null ? "fmp" : "massive",
      fmp_status: fmp.source,
    },
    contracts,
    contractCount: contracts.length,
    dataSources: {
      finvizExpiryRows: finviz.rows?.length || 0,
      finvizError: finviz.error || null,
      finvizStatus: finviz.status,
      finvizColumns: finviz.columns || null,
      finvizSampleRow: finviz.rows?.[0] || null,
      massiveExpiryContracts: massiveContracts.length,
      massiveError: massive.ok ? null : massive.error,
      contractsFromFinviz,
      contractsMassiveOnly,
    },
  });
}

async function handleInitial({ apiKey, ticker }) {
  // Stage A: параллельно — Massive unfiltered, Finviz full CSV, FMP.
  const [massive, finvizFull, fmp] = await Promise.all([
    fetchMassiveSnapshot(apiKey, ticker),
    fetchFinvizOptionsChain(ticker),
    fetchFmpPrice(ticker),
  ]);

  // Если оба primary-источника пустые — возвращаем ошибку.
  if (!massive.ok && (!finvizFull.rows || finvizFull.rows.length === 0)) {
    return Response.json(
      {
        ok: false,
        error: "Не удалось получить данные ни от Massive, ни от Finviz",
        massive: massive.error,
        finviz: finvizFull.error,
        tried: massive.tried,
      },
      { status: 502 }
    );
  }

  const massiveContracts = massive.ok
    ? massive.data.results.map(normalizeMassive).filter(Boolean)
    : [];
  const massivePrice = massive.ok
    ? (massive.data.results[0]?.underlying_asset?.price ?? null)
    : null;
  const underlyingPrice = fmp.price ?? massivePrice;

  // Build expirations summary. Primary source — Finviz full CSV (полнее),
  // fallback — Massive unfiltered.
  const expirationsByDate = new Map();
  function bump(expIso, type, oi, vol) {
    let s = expirationsByDate.get(expIso);
    if (!s) {
      s = { expiry: expIso, contractCount: 0, volumeSum: 0, oiSum: 0, callOi: 0, putOi: 0 };
      expirationsByDate.set(expIso, s);
    }
    s.contractCount++;
    s.volumeSum += vol || 0;
    s.oiSum += oi || 0;
    if (type === "call") s.callOi += oi || 0;
    if (type === "put")  s.putOi  += oi || 0;
  }
  for (const fv of finvizFull.rows) {
    const expIso = parseFvDateToIso(fv.Expiry);
    const type = (fv.Type || "").trim().toLowerCase();
    if (!expIso || !type) continue;
    bump(expIso, type, parseFvNum(fv["Open Int."]) || 0, parseFvNum(fv.Volume) || 0);
  }
  if (expirationsByDate.size === 0) {
    for (const c of massiveContracts) {
      if (!c.expiration || !c.type) continue;
      bump(c.expiration, c.type, c.openInterest || 0, c.volume || 0);
    }
  }
  const expirations = [...expirationsByDate.values()]
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1));

  const defaultExpiry = pickDefaultExpiry(expirations);

  // Stage B: Finviz e=defaultExpiry — primary греков для default.
  // Сабсеквентно, потому что нужно знать defaultExpiry.
  let finvizExpiry = { rows: [], error: null, status: 0 };
  if (defaultExpiry) {
    finvizExpiry = await fetchFinvizOptionsChain(ticker, defaultExpiry);
  }

  // Massive fallback для default'ной даты — только те контракты из
  // unfiltered snapshot которые совпадают с defaultExpiry.
  const massiveByKey = new Map();
  for (const c of massiveContracts) {
    if (c.expiration === defaultExpiry) {
      massiveByKey.set(`${c.strike}|${c.type}|${c.expiration}`, c);
    }
  }

  const { contracts, contractsFromFinviz, contractsMassiveOnly } =
    assembleContracts(finvizExpiry.rows, massiveByKey);

  return Response.json({
    ok: true,
    ticker,
    underlyingPrice,
    priceSources: {
      massive: massivePrice,
      fmp: fmp.price,
      used: underlyingPrice === fmp.price && fmp.price != null ? "fmp" : "massive",
      fmp_status: fmp.source,
    },
    expirations,
    defaultExpiry,
    expiry: defaultExpiry,
    contracts,
    contractCount: contracts.length,
    dataSources: {
      massiveUnfilteredContracts: massiveContracts.length,
      finvizFullRows: finvizFull.rows?.length || 0,
      finvizExpiryRows: finvizExpiry.rows?.length || 0,
      finvizFullError: finvizFull.error || null,
      finvizExpiryError: finvizExpiry.error || null,
      contractsFromFinviz,
      contractsMassiveOnly,
    },
    base: massive.ok ? massive.base : null,
    tried: massive.tried || [],
  });
}

// ============================================================================
// Entry
// ============================================================================

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
  const expiry = (searchParams.get("expiry") || "").trim();

  if (!ticker || !/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return Response.json(
      { ok: false, error: "Нужен корректный ticker в query (?ticker=AAPL)" },
      { status: 400 }
    );
  }
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    return Response.json(
      { ok: false, error: "expiry должен быть в формате YYYY-MM-DD" },
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

  return expiry
    ? handlePerExpiry({ apiKey, ticker, expiry })
    : handleInitial({ apiKey, ticker });
}
