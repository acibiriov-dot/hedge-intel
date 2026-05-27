"use client";
import { useEffect, useMemo, useState } from "react";

// API keys live on the server now (FINVIZ_KEY / ANTHROPIC_API_KEY env vars
// on Vercel) — nothing key-related in localStorage.
// Access gate for this page: localStorage["hi_access"] === "1" means unlocked.
const KEY_ACCESS  = "hi_access";
const PASSWORD    = "okiinvest2026";

// Watchlist scan covers the 10 largest / most-traded names.
const WATCHLIST = ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "TSLA", "IBIT", "SMH", "AMZN", "META"];

// How many top-by-Score contracts to surface (watchlist and single-ticker both).
const TOP_N = 10;

const RU_MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

const HORIZON_OPTIONS = [
  { v: "week",    label: "1 неделя",  maxDays: 7  },
  { v: "month",   label: "1 месяц",   maxDays: 30 },
  { v: "quarter", label: "3 месяца",  maxDays: 90 },
];

// Three scan modes — each tab is a separate entry point that runs a scan
// with its own filter / sort. `anomalies` is the legacy flow.
const SCAN_MODES = [
  { v: "highprob",   label: "🎯 Высокая вероятность", title: "Контракты с вероятностью прибыли 85%+" },
  { v: "balanced",   label: "⚖️ Баланс",             title: "Контракты с балансом риска и прибыли" },
  { v: "anomalies",  label: "⚡ Аномалии",            title: "Аномальная активность крупных игроков" },
  { v: "strategies", label: "🧠 Стратегии",           title: "Найденные возможности для 6 опционных стратегий" },
];

// ---------- date helpers ----------

function num(v) {
  if (v == null || v === "") return Number.NaN;
  const n = parseFloat(String(v).replace("%", "").replace(",", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Parse Finviz "M/D/YYYY" expiry string into a Date at local midnight. */
function parseFinvizExpiry(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

/** Whole-day delta between two Dates, both normalized to local midnight. */
function daysBetween(future, today) {
  if (!future || !today) return Number.NaN;
  const f = new Date(future.getFullYear(), future.getMonth(), future.getDate());
  const t = new Date(today.getFullYear(),  today.getMonth(),  today.getDate());
  return Math.round((f - t) / 86400000);
}

/** True iff `exp` is in (today, today + horizon.maxDays]. Excludes today. */
function inHorizon(exp, today, horizonKey) {
  const h = HORIZON_OPTIONS.find((x) => x.v === horizonKey);
  if (!h || !exp) return false;
  const d = daysBetween(exp, today);
  return d >= 1 && d <= h.maxDays;
}

/** Friday-only monthly expiries for the single-ticker dropdown (next 6). */
function thirdFridayOfMonth(year, monthZeroBased) {
  const firstOfMonth = new Date(year, monthZeroBased, 1);
  const daysUntilFriday = (5 - firstOfMonth.getDay() + 7) % 7;
  return new Date(year, monthZeroBased, 1 + daysUntilFriday + 14);
}
function computeExpiryOptions(from, count = 6) {
  const out = [];
  const todayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let y = from.getFullYear(), m = from.getMonth(), safety = 0;
  while (out.length < count && safety < 36) {
    const d = thirdFridayOfMonth(y, m);
    if (d >= todayStart) {
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      out.push({
        iso: `${yy}-${mm}-${dd}`,
        label: `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]} ${yy}`,
      });
    }
    m++; if (m > 11) { m = 0; y++; } safety++;
  }
  return out;
}

// ---------- chain stats + scoring ----------

/** Per-chain aggregate stats: put/call volume ratio + magnet (max-OI) strike. */
function chainStats(rows) {
  let callVol = 0, putVol = 0, maxOI = 0, maxOIStrike = "—";
  for (const r of rows) {
    const vol  = num(r["Volume"]);
    const oi   = num(r["Open Int."]);
    const type = (r["Type"] || "").toLowerCase();
    if (Number.isFinite(vol) && vol > 0) {
      if (type === "call")     callVol += vol;
      else if (type === "put") putVol  += vol;
    }
    if (Number.isFinite(oi) && oi > maxOI) {
      maxOI = oi;
      maxOIStrike = r["Strike"] || "—";
    }
  }
  return { pcr: callVol > 0 ? putVol / callVol : 0, callVol, putVol, maxOI, maxOIStrike };
}

function rowSignals(row, stats) {
  const out = [];
  const type = (row["Type"] || "").toLowerCase();
  const vol  = num(row["Volume"]);
  const oi   = num(row["Open Int."]);
  if (Number.isFinite(vol) && Number.isFinite(oi) && oi > 0 && vol / oi > 5) out.push("⚡");
  if (stats.pcr > 0 && stats.pcr < 0.5 && type === "call") out.push("🐂");
  else if (stats.pcr > 1.5 && type === "put")              out.push("🐻");
  return out.join(" ");
}

function dominantSignal(stats, anomalyCount) {
  if (stats.pcr > 1.5)                  return "🐻";
  if (stats.pcr > 0 && stats.pcr < 0.5) return "🐂";
  if (anomalyCount > 0)                 return "⚡";
  return "—";
}

/** 95th / 90th percentile of volume for a chain (after horizon filtering). */
function chainPercentiles(rows) {
  const vols = rows.map((r) => num(r["Volume"])).filter((v) => Number.isFinite(v) && v > 0);
  vols.sort((a, b) => a - b);
  if (!vols.length) return { p5: 0, p10: 0 };
  return {
    p5:  vols[Math.min(vols.length - 1, Math.floor(vols.length * 0.95))],  // top-5%
    p10: vols[Math.min(vols.length - 1, Math.floor(vols.length * 0.90))],  // top-10%
  };
}

/**
 * Score a contract 0..100 (capped). Tiered so each criterion adds the BEST
 * applicable bonus once. Components:
 *   Vol/OI > 10×    → +40        (else >5× → +25)
 *   IV > 80%        → +20        (else >50% → +10)
 *   Vol >= p95      → +20        (else >= p90 → +10)
 *   Expiry > 7 days → +10        (no same-week noise)
 */
function scoreContract(row, p5, p10, today) {
  let score = 0;
  const vol = num(row["Volume"]);
  const oi  = num(row["Open Int."]);
  const iv  = num(row["IV"]);

  if (Number.isFinite(vol) && Number.isFinite(oi) && oi > 0 && vol > 0) {
    const ratio = vol / oi;
    if      (ratio > 10) score += 40;
    else if (ratio > 5)  score += 25;
  }
  if (Number.isFinite(iv)) {
    if      (iv > 80) score += 20;
    else if (iv > 50) score += 10;
  }
  if (Number.isFinite(vol) && vol > 0) {
    if      (p5  > 0 && vol >= p5)  score += 20;
    else if (p10 > 0 && vol >= p10) score += 10;
  }
  const exp = parseFinvizExpiry(row["Expiry"]);
  if (exp && daysBetween(exp, today) > 7) score += 10;

  return Math.min(100, score);
}

/** Build a list of human-readable reasons that contributed to the score. */
function scoreReasons(row, p5, p10, today) {
  const out = [];
  const vol = num(row["Volume"]);
  const oi  = num(row["Open Int."]);
  const iv  = num(row["IV"]);
  if (Number.isFinite(vol) && Number.isFinite(oi) && oi > 0 && vol > 0) {
    const ratio = vol / oi;
    if      (ratio > 10) out.push("V/OI>10×");
    else if (ratio > 5)  out.push("V/OI>5×");
  }
  if (Number.isFinite(iv)) {
    if      (iv > 80) out.push("IV>80%");
    else if (iv > 50) out.push("IV>50%");
  }
  if (Number.isFinite(vol) && vol > 0) {
    if      (p5  > 0 && vol >= p5)  out.push("vol top5%");
    else if (p10 > 0 && vol >= p10) out.push("vol top10%");
  }
  const exp = parseFinvizExpiry(row["Expiry"]);
  if (exp && daysBetween(exp, today) > 7) out.push("exp>7d");
  return out;
}

/** Serialize ONE contract as plain text with all 18 Finviz CSV columns.
 *  Used by both interpret() and buildStrategy() so Claude can do math on
 *  Bid/Ask, Delta, Theta, etc. */
function contractFullData(c) {
  return [
    `Contract Name: ${c["Contract Name"] || ""}`,
    `Last Trade: ${c["Last Trade"] || ""}`,
    `Expiry: ${c["Expiry"] || ""}`,
    `Strike: $${c["Strike"] || ""}`,
    `Last Close: $${c["Last Close"] || ""}`,
    `Bid: $${c["Bid"] || ""}`,
    `Ask: $${c["Ask"] || ""}`,
    `Change $: ${c["Change $"] || ""}`,
    `Change %: ${c["Change %"] || ""}`,
    `Volume: ${c["Volume"] || ""}`,
    `Open Int.: ${c["Open Int."] || ""}`,
    `Type: ${c["Type"] || ""}`,
    `IV: ${c["IV"] || ""}`,
    `Delta: ${c["Delta"] || ""}`,
    `Gamma: ${c["Gamma"] || ""}`,
    `Theta: ${c["Theta"] || ""}`,
    `Vega: ${c["Vega"] || ""}`,
    `Rho: ${c["Rho"] || ""}`,
  ].join("\n");
}

// Shared rules + bans for both interpret and strategy system prompts.
// Calculation rules let Claude convert raw greeks into money values that the
// user template asks for ($Ask × 100, Theta × 100, Last Close × IV × √(N/365), …).
const SHARED_RULES = `ПРАВИЛА РАСЧЁТОВ:
- Стоимость покупки = Ask × 100
- Стоимость продажи = Bid × 100
- Если Bid или Ask = 0 или пустой — пиши 'нет данных', не считай
- Delta = вероятность оказаться в деньгах (например Delta 0.35 = 35% шанс)
- Theta = потеря в день в долларах (Theta × 100)
- IV = ожидаемое движение актива за год в %
- Ожидаемое движение за N дней = Last Close × IV × sqrt(N/365)

ЗАПРЕЩЕНО:
- Выдумывать любые цифры которых нет в данных
- Использовать слова: нога, спред, дебет, кредит, leg, exercise
- Писать markdown (никаких ## или **)
- Округлять цены контрактов`;

const STRATEGY_SYSTEM = `Ты профессиональный опционный трейдер. Все расчёты ТОЛЬКО на основе переданных данных.

${SHARED_RULES}

ФОРМАТ СТРАТЕГИИ строго такой:
СТРАТЕГИЯ: [название]
Что делаем: [1 предложение]
Базовый актив сейчас: $[Last Close]

Параметры позиции:
- Стоимость входа: $[Ask × 100]
- Максимальная прибыль: $[расчёт] (+[%]%)
- Максимальный убыток: $[Ask × 100] (ограничен премией)
- Точка безубыточности: $[Strike + Ask для колла / Strike - Ask для пута]
- Вероятность прибыли: [Delta × 100]%
- Временной распад: -$[Theta × 100] в день

Когда входить: [конкретное условие]
Когда выходить: [конкретное условие]
Срок: [точное количество дней до Expiry]
ВАЖНО: [главный риск одним предложением]

ПОДВОДНЫЕ КАМНИ:
1. Спред: [(Ask-Bid)/((Ask+Bid)/2) × 100]%. Если больше 20% — пиши ВЫСОКИЙ — теряешь [%]% при входе
2. Временной распад: $[Theta × 100 × дней до Expiry]. Если больше 50% стоимости входа — пиши ОПАСНО
3. Ликвидность: OI [число]. Если меньше 100 — пиши НИЗКАЯ — сложно выйти
4. Волатильность: IV [число]%. Если больше 60% — пиши ВЫСОКАЯ IV — риск обвала волатильности после события
5. Итог: СТОИТ ВХОДИТЬ / ОСТОРОЖНО / НЕ РЕКОМЕНДУЮ — одно слово и одна причина`;

const INTERPRET_SYSTEM = `Ты профессиональный опционный трейдер. Все расчёты ТОЛЬКО на основе переданных данных.

${SHARED_RULES}

ФОРМАТ ИНТЕРПРЕТАЦИИ строго такой (3 предложения, без отклонений):
"Кто-то поставил крупную сумму на то что [тикер] [вырастет/упадёт] до $[цена из Strike] к [дата из Expiry словами].
Объём сделки в [Volume / Open Int.]× раз больше обычного — это нестандартная активность.
Вероятно это [хедж-фонд / крупный инвестор / маркет-мейкер] который [объяснение простыми словами одним предложением]."

Не пиши вступлений, не пиши заключений. Только три предложения по шаблону.`;

/**
 * Filter `rows` to the horizon window + today-exclude rule, then score each
 * survivor. Returns ALL scored contracts (caller decides top-N).
 */
// ---------- Strategy analyzers (6 patterns; each returns array of opportunity cards) ----------
//
// Each opportunity has the shape:
//   { id, strategy, icon, name, ticker, signalParams, construction, contracts }
// where `contracts` are raw Finviz rows to feed buildStrategy for the detailed analysis.

function _groupByExpiry(rows) {
  const m = {};
  for (const r of rows) {
    const e = r["Expiry"];
    if (!e) continue;
    (m[e] = m[e] || []).push(r);
  }
  return m;
}

function _meanIV(rows) {
  const ivs = rows.map((r) => num(r["IV"])).filter((v) => Number.isFinite(v) && v > 0);
  if (!ivs.length) return 0;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

function _avgIVByType(rows, t) {
  return _meanIV(rows.filter((r) => (r["Type"] || "").toLowerCase() === t));
}

/** (1) IV SPIKE — Short Strangle on contracts with IV > chain mean × 1.5. */
function findIvSpikeOpportunities(chainsByTicker) {
  const out = [];
  for (const [ticker, rows] of Object.entries(chainsByTicker)) {
    if (rows.length < 10) continue;
    const byExpiry = _groupByExpiry(rows);
    for (const [expiry, contracts] of Object.entries(byExpiry)) {
      if (contracts.length < 5) continue;
      const mean = _meanIV(contracts);
      if (mean <= 0) continue;
      const spikes = contracts.filter((c) => {
        const iv = num(c["IV"]);
        return Number.isFinite(iv) && iv > mean * 1.5;
      });
      if (!spikes.length) continue;
      const maxIV = Math.max(...spikes.map((c) => num(c["IV"])).filter(Number.isFinite));
      const premium = spikes.reduce((s, c) => s + (num(c["Bid"]) || 0) * 100, 0);
      out.push({
        id: `iv_spike-${ticker}-${expiry}`,
        strategy: "iv_spike",
        icon: "🌋",
        name: "IV SPIKE — Short Strangle",
        ticker, expiry,
        signalParams: `mean IV ${mean.toFixed(1)}% · спайк до ${maxIV.toFixed(1)}% (×${(maxIV / mean).toFixed(2)}) · премия ~$${premium.toFixed(0)}`,
        construction: "Продай OTM call и OTM put на этой экспирации — забираешь премию от обвала IV.",
        contracts: spikes.slice(0, 4),
      });
    }
  }
  return out;
}

/** (2) SKEW TRADING — Risk Reversal when put IV > call IV × 1.3 per expiry. */
function findSkewOpportunities(chainsByTicker) {
  const out = [];
  for (const [ticker, rows] of Object.entries(chainsByTicker)) {
    const byExpiry = _groupByExpiry(rows);
    for (const [expiry, contracts] of Object.entries(byExpiry)) {
      const calls = contracts.filter((c) => (c["Type"] || "").toLowerCase() === "call");
      const puts  = contracts.filter((c) => (c["Type"] || "").toLowerCase() === "put");
      if (calls.length < 3 || puts.length < 3) continue;
      const ivCall = _meanIV(calls);
      const ivPut  = _meanIV(puts);
      if (ivCall <= 0 || ivPut <= 0) continue;
      if (ivPut <= ivCall * 1.3) continue;
      // Take highest-IV put + median call for the risk reversal sample.
      const topPut  = [...puts].sort((a, b) => num(b["IV"]) - num(a["IV"]))[0];
      const topCall = [...calls].sort((a, b) => num(b["Volume"]) - num(a["Volume"]))[0];
      out.push({
        id: `skew-${ticker}-${expiry}`,
        strategy: "skew",
        icon: "📐",
        name: "SKEW — Risk Reversal",
        ticker, expiry,
        signalParams: `IV puts ${ivPut.toFixed(1)}% vs calls ${ivCall.toFixed(1)}% · диспаритет +${(((ivPut / ivCall) - 1) * 100).toFixed(0)}%`,
        construction: "Продай дорогой OTM put, купи дешёвый OTM call — синтетически длинная позиция от мисспрайсинга страха.",
        contracts: [topPut, topCall].filter(Boolean),
      });
    }
  }
  return out;
}

/** (3) VOLATILITY ARBITRAGE — Calendar Spread when near IV > far IV × 1.4. */
function findVolArbOpportunities(chainsByTicker) {
  const out = [];
  for (const [ticker, rows] of Object.entries(chainsByTicker)) {
    const byExpiry = _groupByExpiry(rows);
    // Sort expiries by date so "near" / "far" mean what they should.
    const sorted = Object.entries(byExpiry)
      .map(([e, list]) => ({ expiry: e, list, date: parseFinvizExpiry(e), iv: _meanIV(list) }))
      .filter((x) => x.date && x.iv > 0)
      .sort((a, b) => a.date - b.date);
    if (sorted.length < 2) continue;
    for (let i = 0; i < sorted.length - 1; i++) {
      const near = sorted[i], far = sorted[i + 1];
      if (near.iv <= far.iv * 1.4) continue;
      // Use the most active (by volume) contract of each leg.
      const nearTop = [...near.list].sort((a, b) => num(b["Volume"]) - num(a["Volume"]))[0];
      const farTop  = [...far.list].sort((a, b) => num(b["Volume"]) - num(a["Volume"]))[0];
      out.push({
        id: `volarb-${ticker}-${near.expiry}-${far.expiry}`,
        strategy: "vol_arb",
        icon: "⏳",
        name: "VOL ARB — Calendar Spread",
        ticker,
        signalParams: `ближняя ${near.expiry} IV ${near.iv.toFixed(1)}% vs дальняя ${far.expiry} IV ${far.iv.toFixed(1)}% (×${(near.iv / far.iv).toFixed(2)})`,
        construction: "Продай ближнюю экспирацию (дорогая IV), купи дальнюю (дешёвая IV) — заработок на схлопывании near-term volatility.",
        contracts: [nearTop, farTop].filter(Boolean),
        expiry: `${near.expiry} → ${far.expiry}`,
        expiryNear: near.expiry,
        expiryFar: far.expiry,
      });
      break; // one calendar pair per ticker; closest qualifying pair wins
    }
  }
  return out;
}

/** (4) MAX PAIN — Iron Butterfly anchored at strike with max combined call+put OI. */
function findMaxPainOpportunities(chainsByTicker) {
  const out = [];
  for (const [ticker, rows] of Object.entries(chainsByTicker)) {
    const byExpiry = _groupByExpiry(rows);
    for (const [expiry, contracts] of Object.entries(byExpiry)) {
      if (contracts.length < 6) continue;
      const oiByStrike = {};
      for (const c of contracts) {
        const k = String(c["Strike"] || "");
        if (!k) continue;
        const oi = num(c["Open Int."]);
        if (!Number.isFinite(oi)) continue;
        oiByStrike[k] = (oiByStrike[k] || 0) + oi;
      }
      const entries = Object.entries(oiByStrike).sort((a, b) => b[1] - a[1]);
      if (!entries.length) continue;
      const [topStrike, topOI] = entries[0];
      if (topOI < 500) continue;  // ignore weak magnets
      // Pull the call + put at that strike as anchor legs.
      const legs = contracts.filter((c) => String(c["Strike"]) === topStrike);
      out.push({
        id: `maxpain-${ticker}-${expiry}-${topStrike}`,
        strategy: "max_pain",
        icon: "🧲",
        name: "MAX PAIN — Iron Butterfly",
        ticker, expiry,
        signalParams: `Max-Pain страйк $${topStrike} · суммарный OI ${topOI.toLocaleString("ru-RU")}`,
        construction: `Iron Butterfly вокруг $${topStrike} — цена тянется к этому страйку к экспирации, продаёшь премию на схождении.`,
        contracts: legs,
      });
    }
  }
  return out;
}

/** (5) EARNINGS PLAY — Short Straddle ATM when |day change| > 3% on the underlying. */
function findEarningsPlayOpportunities(chainsByTicker, quotesByTicker) {
  const out = [];
  for (const [ticker, rows] of Object.entries(chainsByTicker)) {
    const quote = quotesByTicker[ticker] || [];
    if (quote.length < 2) continue;
    const last = num(quote[quote.length - 1]?.Close);
    const prev = num(quote[quote.length - 2]?.Close);
    if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) continue;
    const change = ((last - prev) / prev) * 100;
    if (Math.abs(change) < 3) continue;
    // Find ATM strike — closest to today's close.
    const strikes = [...new Set(rows.map((r) => num(r["Strike"])).filter(Number.isFinite))];
    if (!strikes.length) continue;
    const atmStrike = strikes.reduce((best, s) => (Math.abs(s - last) < Math.abs(best - last) ? s : best));
    const atmContracts = rows.filter((r) => num(r["Strike"]) === atmStrike);
    if (atmContracts.length < 2) continue;
    const atmCall = atmContracts.find((c) => (c["Type"] || "").toLowerCase() === "call");
    const atmPut  = atmContracts.find((c) => (c["Type"] || "").toLowerCase() === "put");
    if (!atmCall || !atmPut) continue;
    const premium = ((num(atmCall["Bid"]) || 0) + (num(atmPut["Bid"]) || 0)) * 100;
    out.push({
      id: `earnings-${ticker}`,
      strategy: "earnings",
      icon: "📊",
      name: "EARNINGS PLAY — Short Straddle",
      ticker,
      expiry: atmCall["Expiry"],
      signalParams: `цена $${last.toFixed(2)} · 1-day change ${change.toFixed(2)}% · ATM $${atmStrike} · премия ~$${premium.toFixed(0)}`,
      construction: "Продай ATM call и ATM put — забираешь премию когда движение уже произошло и IV должна сходить.",
      contracts: [atmCall, atmPut],
    });
  }
  return out;
}

/** (6) GAMMA SCALPING — Long Straddle on ATM contracts with high gamma (>0.05). */
function findGammaScalpOpportunities(chainsByTicker) {
  const out = [];
  for (const [ticker, rows] of Object.entries(chainsByTicker)) {
    // Filter to ATM-ish, high-gamma contracts.
    const candidates = rows.filter((r) => {
      const delta = Math.abs(num(r["Delta"]));
      const gamma = num(r["Gamma"]);
      return Number.isFinite(delta) && Number.isFinite(gamma)
        && delta >= 0.45 && delta <= 0.55
        && gamma > 0.05;
    });
    if (!candidates.length) continue;
    // Group by (expiry, strike) and pull call+put pairs for straddle.
    const seen = new Set();
    for (const c of candidates.sort((a, b) => num(b["Gamma"]) - num(a["Gamma"]))) {
      const key = `${c["Expiry"]}-${c["Strike"]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pair = rows.filter((r) =>
        r["Expiry"] === c["Expiry"] && String(r["Strike"]) === String(c["Strike"])
      );
      const atmCall = pair.find((r) => (r["Type"] || "").toLowerCase() === "call");
      const atmPut  = pair.find((r) => (r["Type"] || "").toLowerCase() === "put");
      if (!atmCall || !atmPut) continue;
      const cost = ((num(atmCall["Ask"]) || 0) + (num(atmPut["Ask"]) || 0)) * 100;
      const iv  = num(c["IV"]) || 0;
      const close = num(c["Last Close"]) || 0;
      const exp = parseFinvizExpiry(c["Expiry"]);
      const days = exp ? daysBetween(exp, new Date()) : 30;
      const expectedMove = close * (iv / 100) * Math.sqrt(days / 365);
      out.push({
        id: `gamma-${ticker}-${c["Expiry"]}-${c["Strike"]}`,
        strategy: "gamma",
        icon: "⚡",
        name: "GAMMA SCALPING — Long Straddle",
        ticker,
        expiry: c["Expiry"],
        signalParams: `страйк $${c["Strike"]} · Γ ${num(c["Gamma"]).toFixed(3)} · стоимость $${cost.toFixed(0)} · ожидаемое движение ±$${expectedMove.toFixed(2)}`,
        construction: "Купи ATM call + ATM put — заработок если базовый актив сильно сдвинется в любую сторону.",
        contracts: [atmCall, atmPut],
      });
      // One opportunity per ticker — the highest-gamma pair.
      break;
    }
  }
  return out;
}

/**
 * Per-strategy historical winrate. Numbers are heuristic baselines —
 * IV-SPIKE depends on actual Delta of the chosen contracts; the rest are
 * fixed for now (replace with real historical-stats later if needed).
 */
function computeWinrate(opp) {
  switch (opp.strategy) {
    case "iv_spike": {
      const deltas = (opp.contracts || [])
        .map((c) => Math.abs(num(c["Delta"])))
        .filter((v) => Number.isFinite(v));
      if (!deltas.length) return 50;
      const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      return Math.max(0, Math.min(100, Math.round(100 - meanDelta * 100)));
    }
    case "skew":     return 65;
    case "vol_arb":  return 70;
    case "max_pain": {
      const totalOI = (opp.contracts || []).reduce(
        (s, c) => s + (Number.isFinite(num(c["Open Int."])) ? num(c["Open Int."]) : 0), 0
      );
      return totalOI > 1000 ? 75 : 60;
    }
    case "earnings": return 68;
    case "gamma":    return 55;
    default:         return 50;
  }
}

/** Convert YYYY-MM-DD (dropdown value) → M/D/YYYY (Finviz CSV format). */
function isoToFinviz(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return "";
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
}

/** Aggregator — runs all 6 analyzers, attaches per-strategy winrate. */
function findAllStrategies(chainsByTicker, quotesByTicker) {
  const all = [
    ...findIvSpikeOpportunities(chainsByTicker),
    ...findSkewOpportunities(chainsByTicker),
    ...findVolArbOpportunities(chainsByTicker),
    ...findMaxPainOpportunities(chainsByTicker),
    ...findEarningsPlayOpportunities(chainsByTicker, quotesByTicker),
    ...findGammaScalpOpportunities(chainsByTicker),
  ];
  return all.map((opp) => ({ ...opp, winrate: computeWinrate(opp) }));
}

/**
 * Plain-language execution steps (3-5) for a strategy opportunity.
 * Fills the template with actual strike/bid/expiry from the contracts.
 */
function generateExecutionSteps(opp) {
  const t = opp.ticker;
  const c = opp.contracts || [];
  const findCall = () => c.find((x) => (x["Type"] || "").toLowerCase() === "call");
  const findPut  = () => c.find((x) => (x["Type"] || "").toLowerCase() === "put");
  const dollars = (x) => Number.isFinite(x) ? `$${x.toFixed(0)}` : "$?";

  switch (opp.strategy) {
    case "iv_spike": {
      const call = findCall(), put = findPut();
      const callP = call ? num(call.Bid) * 100 : NaN;
      const putP  = put  ? num(put.Bid)  * 100 : NaN;
      const total = (Number.isFinite(callP) ? callP : 0) + (Number.isFinite(putP) ? putP : 0);
      return [
        "Открой брокерский счёт с доступом к опционам",
        `Найди тикер $${t} в опционах`,
        call ? `Продай call страйк $${call.Strike} экспирация ${call.Expiry} — получишь ${dollars(callP)}`
             : "Найди OTM call для продажи",
        put  ? `Одновременно продай put страйк $${put.Strike} экспирация ${put.Expiry} — получишь ${dollars(putP)}`
             : "Найди OTM put для продажи",
        `Итого на счёт: ${dollars(total)}. Позиция закрывается сама, если оба контракта истекут worthless.`,
      ];
    }
    case "skew": {
      const put = c[0], call = c[1];
      const putP   = put  ? num(put.Bid)  * 100 : NaN;
      const callC  = call ? num(call.Ask) * 100 : NaN;
      const net    = (Number.isFinite(putP) ? putP : 0) - (Number.isFinite(callC) ? callC : 0);
      return [
        "Открой брокерский счёт с доступом к опционам",
        `Найди тикер $${t}`,
        put  ? `Продай put страйк $${put.Strike} экспирация ${put.Expiry} — получишь ${dollars(putP)}`
             : "Продай дорогой OTM put",
        call ? `Купи call страйк $${call.Strike} экспирация ${call.Expiry} — заплатишь ${dollars(callC)}`
             : "Купи дешёвый OTM call",
        `Чистый кредит: ${dollars(net)}. Получаешь синтетическую длинную позицию почти бесплатно.`,
      ];
    }
    case "vol_arb": {
      const near = c[0], far = c[1];
      const sellP = near ? num(near.Bid) * 100 : NaN;
      const buyC  = far  ? num(far.Ask)  * 100 : NaN;
      const spread = (Number.isFinite(buyC) ? buyC : 0) - (Number.isFinite(sellP) ? sellP : 0);
      return [
        "Открой брокерский счёт с доступом к опционам",
        `Найди $${t} — нужны опционы на две разные экспирации`,
        near ? `Продай ${near.Type} ${near.Expiry} страйк $${near.Strike} — получишь ${dollars(sellP)}`
             : "Продай ближнюю экспирацию",
        far  ? `Купи такой же ${far.Type} ${far.Expiry} страйк $${far.Strike} — заплатишь ${dollars(buyC)}`
             : "Купи дальнюю экспирацию",
        `Стоимость спреда: ${dollars(spread)}. Профит если цена застынет около страйка к ближней экспирации.`,
      ];
    }
    case "max_pain": {
      const call = findCall(), put = findPut();
      const strike = call?.Strike || put?.Strike || "?";
      return [
        "Открой брокерский счёт с доступом к опционам",
        `Найди $${t} опционы на экспирацию ${opp.expiry}`,
        `Продай call и put на страйке $${strike} (центр Iron Butterfly)`,
        `Купи защитные крылья: call выше $${strike} и put ниже $${strike}`,
        `Профит когда $${t} закроется около $${strike} к ${opp.expiry}.`,
      ];
    }
    case "earnings": {
      const call = findCall(), put = findPut();
      const callP = call ? num(call.Bid) * 100 : NaN;
      const putP  = put  ? num(put.Bid)  * 100 : NaN;
      const total = (Number.isFinite(callP) ? callP : 0) + (Number.isFinite(putP) ? putP : 0);
      return [
        "Открой брокерский счёт с доступом к опционам",
        `Найди $${t} опционы на ближайшую экспирацию`,
        call ? `Продай ATM call $${call.Strike} — получишь ${dollars(callP)}`
             : "Продай ATM call",
        put  ? `Одновременно продай ATM put $${put.Strike} — получишь ${dollars(putP)}`
             : "Продай ATM put",
        `Получаешь ${dollars(total)}. Профит когда IV сойдёт и цена застабилизируется.`,
      ];
    }
    case "gamma": {
      const call = findCall(), put = findPut();
      const callC = call ? num(call.Ask) * 100 : NaN;
      const putC  = put  ? num(put.Ask)  * 100 : NaN;
      const total = (Number.isFinite(callC) ? callC : 0) + (Number.isFinite(putC) ? putC : 0);
      return [
        "Открой брокерский счёт с доступом к опционам",
        `Найди $${t} ATM опционы (Delta ≈ 0.50)`,
        call ? `Купи call страйк $${call.Strike} — заплатишь ${dollars(callC)}`
             : "Купи ATM call",
        put  ? `Купи put такого же страйка $${put?.Strike} — заплатишь ${dollars(putC)}`
             : "Купи ATM put",
        `Итого: ${dollars(total)}. Профит если $${t} сильно сдвинется в любую сторону.`,
      ];
    }
    default:
      return ["Шаги исполнения не определены для этой стратегии"];
  }
}

function detectAnomalies(rows, stats, horizonKey, today) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const inWindow = rows.filter((r) => inHorizon(parseFinvizExpiry(r["Expiry"]), today, horizonKey));
  if (!inWindow.length) return [];
  const { p5, p10 } = chainPercentiles(inWindow);
  const found = [];
  for (const row of inWindow) {
    const score = scoreContract(row, p5, p10, today);
    if (score <= 0) continue;
    found.push({
      row,
      score,
      signals: rowSignals(row, stats),
      reasons: scoreReasons(row, p5, p10, today),
    });
  }
  found.sort((a, b) => b.score - a.score);
  return found;
}

// ===========================================================================

export default function OptionsPage() {
  // ----- access gate (page-level password) -----
  const [hasAccess, setHasAccess] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ----- horizon filter (applies to both watchlist and single-ticker) -----
  const [horizon, setHorizon] = useState("month");

  // ----- single-ticker browser -----
  const [ticker, setTicker] = useState("");
  const [expiry, setExpiry] = useState("");
  const [singleAnomalies, setSingleAnomalies] = useState([]);
  const [singleStats, setSingleStats] = useState(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState("");
  const [expiryOptions, setExpiryOptions] = useState([]);

  // ----- watchlist scan -----
  const [anomalies, setAnomalies]       = useState([]);  // global top-10 by mode-specific sort
  const [tickerStats, setTickerStats]   = useState({});
  const [scanLoading, setScanLoading]   = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanError, setScanError]       = useState("");
  const [scanMode, setScanMode]         = useState("anomalies");  // which mode produced current `anomalies`
  // Strategies mode produces a different data shape — keep separate state.
  const [strategies, setStrategies]     = useState([]);
  const [busyStratOppId, setBusyStratOppId] = useState(null);
  const [scanTimestamp, setScanTimestamp] = useState(null);
  // Filters for strategies mode (tickers checklist, expiry dropdown, min winrate).
  const [stratFilters, setStratFilters] = useState({
    tickers: new Set(WATCHLIST),
    expiry: "",
    minWinrate: 90,
  });

  // ----- Claude interaction -----
  const [busyInterpretId, setBusyInterpretId] = useState(null);
  const [busyStrategyTicker, setBusyStrategyTicker] = useState(null);
  const [resultPanel, setResultPanel] = useState(null);

  // Check access + compute expiry dropdown on mount (client-only — avoids
  // SSR/hydration drift since localStorage is browser-only).
  useEffect(() => {
    try {
      setHasAccess(localStorage.getItem(KEY_ACCESS) === "1");
    } catch {}
    setExpiryOptions(computeExpiryOptions(new Date(), 6));
  }, []);

  function tryLogin() {
    if (passwordInput === PASSWORD) {
      try { localStorage.setItem(KEY_ACCESS, "1"); } catch {}
      setHasAccess(true);
      setPasswordError("");
      setPasswordInput("");
    } else {
      setPasswordError("Неверный пароль");
    }
  }
  function logout() {
    try { localStorage.removeItem(KEY_ACCESS); } catch {}
    setHasAccess(false);
    setPasswordInput("");
  }

  // ----- single-ticker load -----
  async function load() {
    setSingleError("");
    if (!ticker.trim()) { setSingleError("Введи тикер"); return; }
    setSingleLoading(true);
    setSingleAnomalies([]);
    setSingleStats(null);
    try {
      const res = await fetch("/api/finviz-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          expiry: expiry.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSingleError(data.error || `HTTP ${res.status}`);
      } else {
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const stats = chainStats(rows);
        const scored = detectAnomalies(rows, stats, horizon, new Date()).slice(0, TOP_N);
        setSingleStats(stats);
        setSingleAnomalies(scored.map((a) => ({ ticker: ticker.trim().toUpperCase(), ...a })));
      }
    } catch (e) {
      setSingleError(e.message || "Network error");
    }
    setSingleLoading(false);
  }

  // Per-mode contract filter + scoring. Returns array of { row, score, signals, reasons }.
  function pickContractsForMode(chainRows, stats, mode, today) {
    if (mode === "highprob") {
      // High-probability: deep ITM, low IV, real bid, decent liquidity.
      const picks = chainRows.filter((r) => {
        const delta = Math.abs(num(r["Delta"]));
        const iv    = num(r["IV"]);
        const bid   = num(r["Bid"]);
        const oi    = num(r["Open Int."]);
        return delta > 0.85 && iv < 50 && bid > 0 && oi > 100;
      });
      // Compute percentiles + score over the filtered subset (informational —
      // sort is by Delta in this mode).
      const { p5, p10 } = chainPercentiles(picks);
      return picks.map((row) => ({
        row,
        score:   scoreContract(row, p5, p10, today),
        signals: rowSignals(row, stats),
        reasons: scoreReasons(row, p5, p10, today),
      }));
    }
    if (mode === "balanced") {
      // Balanced: moderate Delta, 20-60 days out, real bid, decent liquidity.
      const picks = chainRows.filter((r) => {
        const delta = Math.abs(num(r["Delta"]));
        const bid   = num(r["Bid"]);
        const oi    = num(r["Open Int."]);
        const exp   = parseFinvizExpiry(r["Expiry"]);
        const days  = exp ? daysBetween(exp, today) : null;
        return (
          delta >= 0.5 && delta <= 0.7 &&
          bid > 0 && oi > 50 &&
          days !== null && days >= 20 && days <= 60
        );
      });
      const { p5, p10 } = chainPercentiles(picks);
      return picks.map((row) => ({
        row,
        score:   scoreContract(row, p5, p10, today),
        signals: rowSignals(row, stats),
        reasons: scoreReasons(row, p5, p10, today),
      }));
    }
    // Default: anomalies (existing logic, horizon-aware).
    return detectAnomalies(chainRows, stats, horizon, today);
  }

  // ----- watchlist scan -----
  async function scanWatchlist(mode) {
    setScanError("");
    setScanMode(mode);
    setScanLoading(true);
    setAnomalies([]);
    setStrategies([]);
    setTickerStats({});
    // Strategies mode needs both options + quote data → progress shows two batches.
    const totalUnits = mode === "strategies" ? WATCHLIST.length * 2 : WATCHLIST.length;
    setScanProgress({ done: 0, total: totalUnits });

    // Parallel fetches; per-ticker failure doesn't abort the scan.
    // NOTE: scan never passes the `expiry` param — we want the FULL chain so
    // PCR and OI-magnet calcs are aggregate. Mode-specific filtering is
    // applied CLIENT-side after we have all the data.
    let done = 0;
    const fetchOne = async (t) => {
      try {
        const res = await fetch("/api/finviz-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: t }),
        });
        const data = await res.json();
        const out = res.ok && !data.error && Array.isArray(data.rows)
          ? { ticker: t, rows: data.rows }
          : { ticker: t, rows: [] };
        done += 1;
        setScanProgress({ done, total: totalUnits });
        return out;
      } catch {
        done += 1;
        setScanProgress({ done, total: totalUnits });
        return { ticker: t, rows: [] };
      }
    };
    const results = await Promise.all(WATCHLIST.map(fetchOne));

    // ----- Strategies mode branch -----
    if (mode === "strategies") {
      // Need quote (EOD candles) for EARNINGS_PLAY analyzer.
      const fetchQuote = async (t) => {
        try {
          const res = await fetch("/api/finviz-quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: t }),
          });
          const data = await res.json();
          const out = res.ok && !data.error && Array.isArray(data.rows)
            ? { ticker: t, rows: data.rows }
            : { ticker: t, rows: [] };
          done += 1;
          setScanProgress({ done, total: totalUnits });
          return out;
        } catch {
          done += 1;
          setScanProgress({ done, total: totalUnits });
          return { ticker: t, rows: [] };
        }
      };
      const quoteResults = await Promise.all(WATCHLIST.map(fetchQuote));

      const chainsByTicker = {};
      const quotesByTicker = {};
      for (const r of results)      chainsByTicker[r.ticker] = r.rows;
      for (const r of quoteResults) quotesByTicker[r.ticker] = r.rows;

      const opportunities = findAllStrategies(chainsByTicker, quotesByTicker);

      // Per-ticker summary: count opportunities per ticker, keep chain stats too.
      const statsMap = {};
      for (const { ticker: tk, rows: chainRows } of results) {
        if (!chainRows.length) continue;
        const stats = chainStats(chainRows);
        const oppCount = opportunities.filter((o) => o.ticker === tk).length;
        statsMap[tk] = {
          pcr: stats.pcr,
          maxOIStrike: stats.maxOIStrike,
          maxOI: stats.maxOI,
          anomalyCount: oppCount,
          dominant: dominantSignal(stats, oppCount),
        };
      }

      setStrategies(opportunities);
      setTickerStats(statsMap);
      setScanTimestamp(new Date());
      setScanProgress(null);
      setScanLoading(false);
      return;
    }

    const today = new Date();
    const all = [];
    const statsMap = {};
    for (const { ticker: tk, rows: chainRows } of results) {
      if (!chainRows.length) continue;
      const stats = chainStats(chainRows);
      const picks = pickContractsForMode(chainRows, stats, mode, today);
      statsMap[tk] = {
        pcr:           stats.pcr,
        maxOIStrike:   stats.maxOIStrike,
        maxOI:         stats.maxOI,
        anomalyCount:  picks.length,
        dominant:      dominantSignal(stats, picks.length),
      };
      for (const a of picks) all.push({ ticker: tk, ...a });
    }

    // Mode-specific global sort:
    // - highprob → by |Delta| desc (probability of ITM)
    // - balanced + anomalies → by Score desc (existing scoring)
    if (mode === "highprob") {
      all.sort((a, b) => Math.abs(num(b.row["Delta"])) - Math.abs(num(a.row["Delta"])));
    } else {
      all.sort((a, b) => b.score - a.score);
    }

    setAnomalies(all.slice(0, TOP_N));
    setTickerStats(statsMap);
    setScanProgress(null);
    setScanLoading(false);
  }

  // ----- Claude interpretation: plain-language template, no jargon -----
  async function interpret(a, aId) {
    setBusyInterpretId(aId);
    const title = `Интерпретация: $${a.ticker} ${a.row.Type} $${a.row.Strike} ${a.row.Expiry}`;
    setResultPanel({ title, text: "", loading: true });

    const c = a.row;
    const userMsg = [
      `Тикер: $${a.ticker}`,
      `Score: ${a.score}/100, флаги: ${a.reasons.join(", ")}`,
      "",
      "КОНТРАКТ — все колонки из Finviz CSV:",
      contractFullData(c),
      "",
      "Объясни этот контракт по шаблону из system prompt. Используй точные значения из данных.",
    ].join("\n");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: INTERPRET_SYSTEM,
          messages: [{ role: "user", content: userMsg }],
          useSearch: false,
        }),
      });
      const data = await res.json();
      setResultPanel({ title, text: data.text || data.error || "(пусто)", loading: false });
    } catch (e) {
      setResultPanel({ title, text: "Ошибка: " + (e.message || "network"), loading: false });
    }
    setBusyInterpretId(null);
  }

  // ----- Claude strategy: plain-language template with real-money examples -----
  async function buildStrategy(t, contractsList = null, strategyHint = null) {
    const list = contractsList ?? anomalies.filter((a) => a.ticker === t);
    const top5 = list.slice(0, 5);
    if (top5.length === 0) {
      setResultPanel({
        title: `Стратегия для $${t}`,
        text: "Нет аномалий для построения стратегии. Запусти скан или выбери другой тикер.",
        loading: false,
      });
      return;
    }
    setBusyStrategyTicker(t);
    const title = `Стратегия для $${t} (на основе ${top5.length} аномалий)`;
    setResultPanel({ title, text: "", loading: true });

    const contractsBlock = top5.map((a, i) => (
      `--- Контракт ${i + 1} ---\n${contractFullData(a.row)}`
    )).join("\n\n");

    const userMsg = [
      ...(strategyHint ? [`КАНДИДАТНАЯ СТРАТЕГИЯ: ${strategyHint}`, ""] : []),
      `Тикер: $${t}`,
      `Топ-${top5.length} контрактов (ВСЕ колонки из Finviz CSV):`,
      "",
      contractsBlock,
      "",
      strategyHint
        ? "Построй детальный план для указанной кандидатной стратегии. Используй ТОЛЬКО переданные контракты."
        : "Выбери лучший контракт для стратегии и предложи план по шаблону из system prompt.",
      "Все цифры в стратегии — точные значения из данных или расчёты по правилам.",
    ].join("\n");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: STRATEGY_SYSTEM,
          messages: [{ role: "user", content: userMsg }],
          useSearch: false,
        }),
      });
      const data = await res.json();
      setResultPanel({ title, text: data.text || data.error || "(пусто)", loading: false });
    } catch (e) {
      setResultPanel({ title, text: "Ошибка: " + (e.message || "network"), loading: false });
    }
    setBusyStrategyTicker(null);
  }

  // Tickers with any anomalies — drives the summary card grid.
  const anomalyTickers = useMemo(() =>
    Object.keys(tickerStats)
      .filter((t) => tickerStats[t].anomalyCount > 0)
      .sort((a, b) => tickerStats[b].anomalyCount - tickerStats[a].anomalyCount),
    [tickerStats],
  );

  // Strategies mode: apply user filters, sort by winrate desc, cap to top-20.
  const filteredStrategies = useMemo(() => {
    const expiryFv = stratFilters.expiry ? isoToFinviz(stratFilters.expiry) : "";
    return strategies
      .filter((o) => stratFilters.tickers.has(o.ticker))
      .filter((o) => {
        if (!expiryFv) return true;
        if (o.strategy === "vol_arb") {
          return o.expiryNear === expiryFv || o.expiryFar === expiryFv;
        }
        return o.expiry === expiryFv;
      })
      .filter((o) => (o.winrate ?? 0) >= stratFilters.minWinrate)
      .sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0))
      .slice(0, 20);
  }, [strategies, stratFilters]);

  function toggleTicker(t) {
    setStratFilters((f) => {
      const next = new Set(f.tickers);
      if (next.has(t)) next.delete(t); else next.add(t);
      return { ...f, tickers: next };
    });
  }
  function setAllTickers(on) {
    setStratFilters((f) => ({ ...f, tickers: on ? new Set(WATCHLIST) : new Set() }));
  }

  // ----- Password gate: nothing else renders until the user is unlocked -----
  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>Опционный деск</h1>
          <p style={S.subtitle}>Введи пароль для доступа.</p>
          <input
            style={{ ...S.inp, marginTop: 12, width: "100%" }}
            type="password"
            value={passwordInput}
            placeholder="пароль"
            autoFocus
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") tryLogin(); }}
          />
          {passwordError && (
            <div style={{ color: "#e57373", marginTop: 8, fontSize: 14 }}>
              {passwordError}
            </div>
          )}
          <button style={{ ...S.btn, marginTop: 12 }} onClick={tryLogin}>
            Войти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={{ position: "absolute", top: 18, right: 24, display: "flex", gap: 8 }}>
        <a href="/dashboard" style={{ padding: "6px 12px", background: "#1a1c20", color: "#4caf50", border: "1px solid #4caf50", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>🎛 Dashboard</a>
        <a href="/smart-strategy" style={{ padding: "6px 12px", background: "#1a1c20", color: "#d97706", border: "1px solid #d97706", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>⚡ Smart Strategy</a>
        <button style={{ ...S.logoutBtn, position: "static" }} onClick={logout} title="Сбросить доступ">Выйти</button>
      </div>
      <h1 style={S.title}>Опционный деск</h1>
      <p style={S.subtitle}>
        Скоринг 0-100 · 🐂 / 🐻 / ⚡ сигналы · Claude-интерпретация простым языком ·
        конструктор стратегий с реальными деньгами.
      </p>

      {/* ===== Horizon filter (applies to both watchlist and single-ticker) ===== */}
      <div style={S.horizonRow}>
        <span style={S.horizonLabel}>Горизонт:</span>
        {HORIZON_OPTIONS.map((opt) => (
          <button
            key={opt.v}
            style={horizon === opt.v ? S.horizonBtnActive : S.horizonBtn}
            onClick={() => setHorizon(opt.v)}
          >
            {opt.label}
          </button>
        ))}
        <span style={S.note}>
          Контракты с экспирацией сегодня всегда скрыты.
        </span>
      </div>

      {/* ===== Section 1: Watchlist scan — three modes ===== */}
      <h2 style={S.h2}>1 · Watchlist скан</h2>
      <p style={S.note}>
        Тикеры: {WATCHLIST.join(", ")}. Выбери режим — скан запустится по нему.
        Горизонт сверху применяется только в режиме <b>Аномалии</b>.
      </p>
      <div style={S.tabRow}>
        {SCAN_MODES.map((m) => (
          <button
            key={m.v}
            style={scanMode === m.v ? S.tabActive : S.tab}
            onClick={() => scanWatchlist(m.v)}
            disabled={scanLoading}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={S.row}>
        {scanLoading ? <span style={S.progress}>Сканирую…</span> : null}
        {scanProgress ? (
          <span style={S.progress}>{scanProgress.done}/{scanProgress.total} тикеров</span>
        ) : null}
        {anomalies.length > 0 ? (
          <span style={S.count}>
            Топ-{anomalies.length} из {anomalyTickers.length} тикеров
          </span>
        ) : null}
      </div>
      {scanError ? <div style={S.error}>{scanError}</div> : null}

      {/* Per-ticker summary cards */}
      {anomalyTickers.length > 0 ? (
        <div style={S.cardGrid}>
          {anomalyTickers.map((t) => {
            const s = tickerStats[t];
            const pcrColor = s.pcr > 1.5 ? "#ff6b6b" : (s.pcr > 0 && s.pcr < 0.5 ? "#51cf66" : "#888");
            return (
              <div key={t} style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.cardTicker}>${t}</span>
                  <span style={S.cardSig}>{s.dominant}</span>
                </div>
                <div style={S.cardRow}>
                  <span style={S.cardKey}>PCR</span>
                  <span style={{ ...S.cardVal, color: pcrColor }}>
                    {s.pcr > 0 ? s.pcr.toFixed(2) : "—"}
                  </span>
                </div>
                <div style={S.cardRow}>
                  <span style={S.cardKey}>Магнит OI</span>
                  <span style={S.cardVal}>${s.maxOIStrike}</span>
                </div>
                <div style={S.cardRow}>
                  <span style={S.cardKey}>Аномалий</span>
                  <span style={S.cardVal}>{s.anomalyCount}</span>
                </div>
                <button
                  style={{ ...S.btnSm, marginTop: 8, width: "100%" }}
                  onClick={() => buildStrategy(t)}
                  disabled={busyStrategyTicker === t}
                >
                  {busyStrategyTicker === t ? "…" : "Построить стратегию"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Strategies mode: filters + opportunity cards */}
      {scanMode === "strategies" && strategies.length > 0 ? (
        <>
          {/* Filter panel */}
          <div style={S.filterPanel}>
            <div style={S.filterGroup}>
              <div style={S.filterTitle}>
                Тикеры
                <button
                  style={S.filterSubBtn}
                  onClick={() => setAllTickers(stratFilters.tickers.size !== WATCHLIST.length)}
                >
                  {stratFilters.tickers.size === WATCHLIST.length ? "Снять все" : "Выбрать все"}
                </button>
              </div>
              <div style={S.checkRow}>
                {WATCHLIST.map((t) => (
                  <label key={t} style={S.checkLabel}>
                    <input
                      type="checkbox"
                      checked={stratFilters.tickers.has(t)}
                      onChange={() => toggleTicker(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            <div style={S.filterGroup}>
              <div style={S.filterTitle}>Экспирация</div>
              <select
                style={{ ...S.inp, minWidth: 180 }}
                value={stratFilters.expiry}
                onChange={(e) => setStratFilters((f) => ({ ...f, expiry: e.target.value }))}
              >
                <option value="">Все даты</option>
                {expiryOptions.map((o) => (
                  <option key={o.iso} value={o.iso}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={S.filterGroup}>
              <div style={S.filterTitle}>Min winrate: <b>{stratFilters.minWinrate}%</b></div>
              <input
                type="range"
                min={50}
                max={95}
                step={1}
                value={stratFilters.minWinrate}
                onChange={(e) =>
                  setStratFilters((f) => ({ ...f, minWinrate: parseInt(e.target.value, 10) }))
                }
                style={S.range}
              />
            </div>
          </div>

          <h3 style={S.h3Section}>
            {SCAN_MODES.find((m) => m.v === "strategies")?.title}
            {" · показано "}{filteredStrategies.length}{" из "}{strategies.length}
            {scanTimestamp ? (
              <span style={S.freshness}>
                {" · обновлено "}
                {String(scanTimestamp.getDate()).padStart(2, "0")}.
                {String(scanTimestamp.getMonth() + 1).padStart(2, "0")}{" "}
                {String(scanTimestamp.getHours()).padStart(2, "0")}:
                {String(scanTimestamp.getMinutes()).padStart(2, "0")}
              </span>
            ) : null}
          </h3>

          <div style={S.stratGrid}>
            {filteredStrategies.map((opp) => {
              const wrapped = opp.contracts.map((c) => ({
                row: c, score: 0, signals: "", reasons: [opp.name],
              }));
              const isBusy = busyStratOppId === opp.id;
              const wr = opp.winrate ?? 0;
              const wrColor = wr > 80 ? "#22c55e" : (wr >= 65 ? "#eab308" : "#ef4444");
              const steps = generateExecutionSteps(opp);
              return (
                <div key={opp.id} style={S.stratCard}>
                  <div style={S.stratHead}>
                    <span style={S.stratIcon}>{opp.icon}</span>
                    <span style={S.stratName}>{opp.name}</span>
                  </div>
                  <div style={S.stratTicker}>
                    ${opp.ticker}{opp.expiry ? ` · ${opp.expiry}` : ""}
                  </div>
                  <div style={{ ...S.stratWinrate, color: wrColor }}>
                    Winrate: {wr}%
                  </div>
                  <div style={S.stratParams}>{opp.signalParams}</div>
                  <div style={S.stratConstruction}>{opp.construction}</div>
                  <div style={S.stepsTitle}>Как исполнять:</div>
                  <ol style={S.stepsList}>
                    {steps.map((s, i) => <li key={i} style={S.stepItem}>{s}</li>)}
                  </ol>
                  <button
                    style={{ ...S.btnSm, marginTop: "auto", width: "100%" }}
                    onClick={async () => {
                      setBusyStratOppId(opp.id);
                      try {
                        await buildStrategy(opp.ticker, wrapped, opp.name);
                      } finally {
                        setBusyStratOppId(null);
                      }
                    }}
                    disabled={isBusy}
                  >
                    {isBusy ? "Строю…" : "Построить детальную стратегию"}
                  </button>
                </div>
              );
            })}
          </div>

          {filteredStrategies.length === 0 ? (
            <div style={S.note}>
              Под текущими фильтрами ни одна стратегия не прошла. Снизь min winrate,
              расширь список тикеров или выбери «Все даты».
            </div>
          ) : null}
        </>
      ) : null}

      {scanMode === "strategies" && !scanLoading && strategies.length === 0 && Object.keys(tickerStats).length > 0 ? (
        <div style={S.note}>
          Стратегических возможностей не найдено. Попробуй позже или после event-driven дня.
        </div>
      ) : null}

      {/* Top-3 spotlight (anomalies/highprob/balanced modes) — subset of top-10 */}
      {scanMode !== "strategies" && anomalies.length > 0 ? (
        <>
          <h3 style={S.h3Section}>
            {SCAN_MODES.find((m) => m.v === scanMode)?.title || "Топ-3"}
          </h3>
          <div style={S.spotGrid}>
            {anomalies.slice(0, 3).map((a, i) => {
              const aId = `spot-${a.ticker}-${i}`;
              const c = a.row;
              return (
                <div key={aId} style={S.spotCard}>
                  <div style={S.spotHead}>
                    <span style={S.cardTicker}>${a.ticker}</span>
                    <span style={S.cardSig}>{a.signals || "⚡"}</span>
                  </div>
                  <div style={S.spotBody}>{c.Type} ${c.Strike} · exp {c.Expiry}</div>
                  <div style={S.spotMetrics}>
                    Score {a.score} · Vol {c.Volume} · OI {c["Open Int."]} · IV {c.IV}
                  </div>
                  <div style={S.spotReasons}>{a.reasons.join(", ")}</div>
                  <button
                    style={{ ...S.btnSm, marginTop: 8, width: "100%" }}
                    onClick={() => buildStrategy(a.ticker)}
                    disabled={busyStrategyTicker === a.ticker}
                  >
                    {busyStrategyTicker === a.ticker ? "…" : `Стратегия для $${a.ticker}`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Top-N anomaly table — hidden in strategies mode */}
      {scanMode !== "strategies" && anomalies.length > 0 ? (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Score","Ticker","Sig","Type","Strike","Expiry","Vol","OI","IV","Δ","Флаги",""].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a, i) => {
                const aId = `${a.ticker}-${i}`;
                return (
                  <tr key={aId} style={i % 2 ? S.trAlt : S.tr}>
                    <td style={S.tdScore}>{a.score}</td>
                    <td style={S.tdTicker}>${a.ticker}</td>
                    <td style={S.tdSig}>{a.signals || ""}</td>
                    <td style={S.td}>{a.row.Type}</td>
                    <td style={S.tdNum}>{a.row.Strike}</td>
                    <td style={S.td}>{a.row.Expiry}</td>
                    <td style={S.tdNum}>{a.row.Volume}</td>
                    <td style={S.tdNum}>{a.row["Open Int."]}</td>
                    <td style={S.tdNum}>{a.row.IV}</td>
                    <td style={S.tdNum}>{a.row.Delta}</td>
                    <td style={S.td}>{a.reasons.join(", ")}</td>
                    <td style={S.td}>
                      <button
                        style={S.btnSm}
                        onClick={() => interpret(a, aId)}
                        disabled={busyInterpretId === aId}
                      >
                        {busyInterpretId === aId ? "…" : "Интерпретировать"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <hr style={S.hr} />

      {/* ===== Section 2: Single ticker — top-10 anomalies by score ===== */}
      <h2 style={S.h2}>2 · Один тикер</h2>
      <div style={S.controls}>
        <label style={S.lbl}>
          Тикер
          <input
            style={S.inp}
            value={ticker}
            placeholder="NVDA"
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </label>
        <label style={S.lbl}>
          Expiry
          <select style={S.inp} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="">Все даты</option>
            {expiryOptions.map((o) => (
              <option key={o.iso} value={o.iso}>{o.label}</option>
            ))}
          </select>
        </label>
        <button style={S.btn} onClick={load} disabled={singleLoading}>
          {singleLoading ? "Загрузка…" : "Загрузить"}
        </button>
      </div>
      {singleError ? <div style={S.error}>{singleError}</div> : null}

      {singleStats ? (
        <div style={S.cardGrid}>
          {(() => {
            const s = singleStats;
            const t = ticker.trim().toUpperCase();
            const dom = dominantSignal(s, singleAnomalies.length);
            const pcrColor = s.pcr > 1.5 ? "#ff6b6b" : (s.pcr > 0 && s.pcr < 0.5 ? "#51cf66" : "#888");
            return (
              <div style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.cardTicker}>${t}</span>
                  <span style={S.cardSig}>{dom}</span>
                </div>
                <div style={S.cardRow}>
                  <span style={S.cardKey}>PCR</span>
                  <span style={{ ...S.cardVal, color: pcrColor }}>
                    {s.pcr > 0 ? s.pcr.toFixed(2) : "—"}
                  </span>
                </div>
                <div style={S.cardRow}>
                  <span style={S.cardKey}>Магнит OI</span>
                  <span style={S.cardVal}>${s.maxOIStrike}</span>
                </div>
                <div style={S.cardRow}>
                  <span style={S.cardKey}>Аномалий</span>
                  <span style={S.cardVal}>{singleAnomalies.length}</span>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {singleAnomalies.length > 0 ? (
        <>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {["Score","Sig","Type","Strike","Expiry","Vol","OI","IV","Δ","Флаги",""].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {singleAnomalies.map((a, i) => {
                  const aId = `single-${i}`;
                  return (
                    <tr key={aId} style={i % 2 ? S.trAlt : S.tr}>
                      <td style={S.tdScore}>{a.score}</td>
                      <td style={S.tdSig}>{a.signals || ""}</td>
                      <td style={S.td}>{a.row.Type}</td>
                      <td style={S.tdNum}>{a.row.Strike}</td>
                      <td style={S.td}>{a.row.Expiry}</td>
                      <td style={S.tdNum}>{a.row.Volume}</td>
                      <td style={S.tdNum}>{a.row["Open Int."]}</td>
                      <td style={S.tdNum}>{a.row.IV}</td>
                      <td style={S.tdNum}>{a.row.Delta}</td>
                      <td style={S.td}>{a.reasons.join(", ")}</td>
                      <td style={S.td}>
                        <button
                          style={S.btnSm}
                          onClick={() => interpret(a, aId)}
                          disabled={busyInterpretId === aId}
                        >
                          {busyInterpretId === aId ? "…" : "Интерпретировать"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            style={S.btnLg}
            onClick={() => buildStrategy(ticker.trim().toUpperCase(), singleAnomalies)}
            disabled={busyStrategyTicker === ticker.trim().toUpperCase()}
          >
            {busyStrategyTicker === ticker.trim().toUpperCase()
              ? "Строю стратегию…"
              : `Найти лучшую стратегию для $${ticker.trim().toUpperCase()}`}
          </button>
        </>
      ) : (singleStats ? (
        <div style={S.note}>
          В выбранном горизонте ({HORIZON_OPTIONS.find((h) => h.v === horizon)?.label})
          нет контрактов со Score &gt; 0. Попробуй другой горизонт или другой тикер.
        </div>
      ) : null)}

      {/* ===== Floating result panel ===== */}
      {resultPanel ? (
        <div style={S.resultPanel}>
          <div style={S.resultHead}>
            <h3 style={S.h3}>{resultPanel.title}</h3>
            <button style={S.btnSm} onClick={() => setResultPanel(null)}>Закрыть</button>
          </div>
          {resultPanel.loading
            ? <div style={S.resultLoading}>Claude думает…</div>
            : <pre style={S.resultText}>{resultPanel.text}</pre>}
        </div>
      ) : null}
    </div>
  );
}

const S = {
  page:       { background: "#0d0e10", color: "#e6e6e6", minHeight: "100vh", padding: "24px 32px 64px", fontFamily: "system-ui, sans-serif", position: "relative" },
  title:      { margin: "0 0 4px", fontSize: 24, color: "#fff" },
  subtitle:   { margin: "0 0 20px", color: "#888", fontSize: 13 },
  h2:         { margin: "24px 0 8px", fontSize: 16, color: "#fff", borderBottom: "1px solid #2a2d33", paddingBottom: 6 },
  h3:         { margin: 0, fontSize: 14, color: "#fff" },
  h3Section:  { margin: "16px 0 8px", fontSize: 13, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 },
  note:       { margin: "0 0 12px", color: "#888", fontSize: 12 },
  controls:   { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 },
  row:        { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 },
  lbl:        { display: "flex", flexDirection: "column", fontSize: 12, color: "#aaa", gap: 4 },
  inp:        { padding: "8px 10px", background: "#1a1c20", color: "#e6e6e6", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 13, minWidth: 200 },
  btn:        { padding: "9px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnLg:      { padding: "12px 24px", background: "#d97706", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14, fontWeight: 600, marginTop: 16 },
  btnSm:      { padding: "5px 10px", background: "#374151", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: 500 },

  // horizon group
  horizonRow:      { display: "flex", gap: 6, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  horizonLabel:    { color: "#aaa", fontSize: 12 },
  horizonBtn:      { padding: "6px 14px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 4, cursor: "pointer", fontSize: 12 },
  horizonBtnActive:{ padding: "6px 14px", background: "#3b82f6", color: "#fff", border: "1px solid #3b82f6", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 },

  // scan-mode tabs (replace the single "Сканировать" button)
  tabRow:    { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  tab:       { padding: "10px 18px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 },
  tabActive: { padding: "10px 18px", background: "#3b82f6", color: "#fff", border: "1px solid #3b82f6", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 },

  // Strategy filter panel (above the opportunity grid)
  filterPanel:    { display: "flex", flexWrap: "wrap", gap: 24, padding: "14px 16px", background: "#161820", border: "1px solid #2a2d33", borderRadius: 6, marginBottom: 16 },
  filterGroup:    { display: "flex", flexDirection: "column", gap: 6, minWidth: 200 },
  filterTitle:    { color: "#bbb", fontSize: 12, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  filterSubBtn:   { padding: "2px 8px", background: "#2a2d33", color: "#aaa", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 10 },
  checkRow:       { display: "flex", flexWrap: "wrap", gap: 6 },
  checkLabel:     { display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#ddd", cursor: "pointer", padding: "3px 6px", background: "#0d0e10", borderRadius: 3 },
  range:          { width: 220, accentColor: "#3b82f6" },
  freshness:      { color: "#666", fontSize: 11, fontWeight: 400, marginLeft: 8 },

  // Strategy opportunity cards (🧠 Стратегии mode)
  stratGrid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginBottom: 20 },
  stratCard:        { background: "#161820", border: "1px solid #d97706", borderRadius: 8, padding: "14px 16px", display: "flex", flexDirection: "column" },
  stratHead:        { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  stratIcon:        { fontSize: 22 },
  stratName:        { color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: 0.3 },
  stratTicker:      { color: "#3b82f6", fontSize: 14, fontWeight: 600, marginBottom: 6 },
  stratWinrate:     { fontSize: 18, fontWeight: 700, marginBottom: 6, fontVariantNumeric: "tabular-nums" },
  stratParams:      { color: "#bbb", fontSize: 12, marginBottom: 6, fontVariantNumeric: "tabular-nums" },
  stratConstruction:{ color: "#d97706", fontSize: 12, fontStyle: "italic", lineHeight: 1.4, marginBottom: 10 },
  stepsTitle:       { color: "#aaa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  stepsList:        { color: "#e6e6e6", fontSize: 12, lineHeight: 1.5, paddingLeft: 18, margin: "0 0 10px 0" },
  stepItem:         { marginBottom: 2 },

  count:      { color: "#666", fontSize: 12 },
  progress:   { color: "#3b82f6", fontSize: 12, fontWeight: 500 },
  error:      { padding: "8px 12px", background: "#3b1d1d", color: "#ff8888", borderRadius: 4, marginBottom: 12, fontSize: 13 },

  // Per-ticker summary cards
  cardGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 20 },
  card:       { background: "#161820", border: "1px solid #2a2d33", borderRadius: 6, padding: "12px 14px" },
  cardHead:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardTicker: { color: "#3b82f6", fontWeight: 700, fontSize: 15 },
  cardSig:    { fontSize: 16 },
  cardRow:    { display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", color: "#bbb" },
  cardKey:    { color: "#888" },
  cardVal:    { color: "#e6e6e6", fontVariantNumeric: "tabular-nums" },

  // Top-3 spotlight cards (highlighted)
  spotGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 20 },
  spotCard:   { background: "#1a1c20", border: "1px solid #d97706", borderRadius: 6, padding: "12px 14px" },
  spotHead:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  spotBody:   { color: "#e6e6e6", fontSize: 13, fontWeight: 600, marginBottom: 4 },
  spotMetrics:{ color: "#aaa", fontSize: 11, marginBottom: 4, fontVariantNumeric: "tabular-nums" },
  spotReasons:{ color: "#d97706", fontSize: 11, fontStyle: "italic" },

  // Table
  tableWrap:  { overflowX: "auto", border: "1px solid #2a2d33", borderRadius: 6, marginBottom: 12 },
  table:      { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:         { padding: "10px 12px", background: "#1a1c20", color: "#bbb", textAlign: "left", borderBottom: "1px solid #2a2d33", userSelect: "none", fontWeight: 600, whiteSpace: "nowrap" },
  tr:         { background: "#0d0e10" },
  trAlt:      { background: "#121317" },
  td:         { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126" },
  tdNum:      { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  tdTicker:   { padding: "8px 12px", color: "#3b82f6", borderBottom: "1px solid #1f2126", fontWeight: 600 },
  tdSig:      { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126", fontSize: 14, whiteSpace: "nowrap" },
  tdScore:    { padding: "8px 12px", color: "#d97706", borderBottom: "1px solid #1f2126", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" },

  hr:         { border: "none", borderTop: "1px solid #2a2d33", margin: "32px 0" },

  // Result panel
  resultPanel:{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a1c20", borderTop: "2px solid #3b82f6", padding: "12px 24px", maxHeight: "50vh", overflowY: "auto", boxShadow: "0 -4px 12px rgba(0,0,0,0.4)" },
  resultHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  resultText: { margin: 0, color: "#e6e6e6", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "system-ui, sans-serif" },
  resultLoading: { color: "#888", fontSize: 13, padding: "8px 0" },

  // Password gate
  lockBox:    { maxWidth: 360, margin: "10vh auto 0", padding: "24px 28px", background: "#161820", border: "1px solid #2a2d33", borderRadius: 8 },
  logoutBtn:  { position: "absolute", top: 18, right: 24, padding: "6px 12px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 4, cursor: "pointer", fontSize: 12 },
};
