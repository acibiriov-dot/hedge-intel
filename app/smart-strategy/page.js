"use client";
import { useEffect, useState } from "react";

// Same access gate as /options — single password unlocks both pages.
const KEY_ACCESS = "hi_access";
const PASSWORD   = "okiinvest2026";

// ---------- glossary tooltips (hover or click) ----------
// Plain-language explanations; max 2 sentences each, no jargon.
const GLOSSARY = {
  delta:    "Вероятность что опцион принесёт прибыль. Delta 0.30 = 30% шанс.",
  iv:       "Насколько рынок ожидает движения акции. Высокая IV = дорогие опционы.",
  theta:    "Сколько теряет опцион каждый день просто от течения времени.",
  pcr:      "Соотношение ставок на падение к ставкам на рост. < 1 = рынок ждёт роста.",
  maxpain:  "Цена акции при которой большинство опционов истекут worthless. Рынок часто притягивается к этому уровню.",
  strike:   "Цена акции при которой опцион исполняется.",
  expiry:   "Дата когда опцион перестаёт существовать.",
  premium:  "Деньги которые ты получаешь или платишь за опцион.",
  cc:       "Держишь акцию и продаёшь право другому купить её дороже. Получаешь деньги прямо сейчас.",
  csp:      "Продаёшь право другому продать тебе акцию дешевле. Получаешь деньги и готов купить акцию.",
  otm:      "Опцион пока не в прибыли — акция ещё не дошла до нужной цены.",
  atm:      "Цена опциона примерно равна текущей цене акции.",
  itm:      "Опцион уже в прибыли — акция прошла нужную цену.",
  worthless:"Опцион истёк без ценности — продавец забирает всю премию.",
  winrate:  "Процент сделок которые закрываются в прибыль.",
  strangle: "Одновременно продаёшь колл выше и пут ниже текущей цены. Прибыль если акция останется в коридоре.",
  bps:      "Покупаешь дорогой пут и продаёшь дешёвый. Зарабатываешь на падении с ограниченным риском.",
  longcall: "Покупаешь право купить акцию дороже текущей. Платишь премию, зарабатываешь если акция вырастет.",
  longput:  "Покупаешь право продать акцию по текущей цене. Платишь премию, зарабатываешь если акция упадёт.",
  breakeven:"Цена акции при которой стратегия выходит в ноль — ни прибыли, ни убытка.",
  skew:     "Перекос — насколько путы дороже коллов. Высокий skew = страх падения.",
};

// ---------- numeric + date helpers ----------

function num(v) {
  if (v == null || v === "") return Number.NaN;
  const n = parseFloat(String(v).replace("%", "").replace(",", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

function parseFinvizExpiry(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

function daysBetween(future, today) {
  if (!future || !today) return Number.NaN;
  const f = new Date(future.getFullYear(), future.getMonth(), future.getDate());
  const t = new Date(today.getFullYear(),  today.getMonth(),  today.getDate());
  return Math.round((f - t) / 86400000);
}

function fmtMoney(v, digits = 2) {
  if (!Number.isFinite(v)) return "—";
  return "$" + v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(v, digits = 1) {
  if (!Number.isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(digits) + "%";
}

function fmtDate(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

// ---------- chain metrics ----------

function isCall(r) { return (r.Type || "").toLowerCase() === "call"; }
function isPut(r)  { return (r.Type || "").toLowerCase() === "put"; }

/** Sum put / call volume across the entire chain. */
function computePCR(rows) {
  let callVol = 0, putVol = 0;
  for (const r of rows) {
    const v = num(r.Volume);
    if (!Number.isFinite(v)) continue;
    if (isCall(r)) callVol += v;
    else if (isPut(r)) putVol += v;
  }
  if (callVol === 0) return null;
  return putVol / callVol;
}

/** Mean IV across all contracts with a finite IV. */
function meanIV(rows) {
  const ivs = rows.map((r) => num(r.IV)).filter((v) => Number.isFinite(v) && v > 0);
  if (!ivs.length) return null;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

/** Put-IV / Call-IV ratio — skew indicator. > 1.2 = puts expensive. */
function computeSkew(rows) {
  const ivCalls = meanIV(rows.filter(isCall));
  const ivPuts  = meanIV(rows.filter(isPut));
  if (!ivCalls || !ivPuts) return null;
  return ivPuts / ivCalls;
}

/** Strike with maximum aggregate open interest (call + put combined). */
function maxPainStrike(rows) {
  const byStrike = new Map();
  for (const r of rows) {
    const s = num(r.Strike);
    const oi = num(r["Open Int."]);
    if (!Number.isFinite(s) || !Number.isFinite(oi)) continue;
    byStrike.set(s, (byStrike.get(s) || 0) + oi);
  }
  let bestStrike = null, bestOI = -Infinity;
  for (const [s, oi] of byStrike) {
    if (oi > bestOI) { bestOI = oi; bestStrike = s; }
  }
  return bestStrike;
}

/** Strike closest to currentPrice — used as the ATM anchor. */
function atmStrike(rows, currentPrice) {
  const strikes = [...new Set(rows.map((r) => num(r.Strike)).filter(Number.isFinite))];
  if (!strikes.length) return null;
  strikes.sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
  return strikes[0];
}

// ---------- contract pickers ----------
// All pickers respect a default DTE window of 21-45 days (one monthly cycle).
// If empty, the caller can re-try with a wider window — kept simple here.

const DTE_MIN = 14;
const DTE_MAX = 60;

function withinDTE(row, today, min = DTE_MIN, max = DTE_MAX) {
  const exp = parseFinvizExpiry(row.Expiry);
  if (!exp) return false;
  const dte = daysBetween(exp, today);
  return dte >= min && dte <= max;
}

// Pickers use a strict pass first (delta-targeted, decent OI), then fall back
// to the closest available contract by delta. Real chains often lack the
// textbook 0.20-0.30 short-premium contract, so a soft fallback keeps the
// strategy engine usable on thin tickers.

/** Short call: Delta 0.15-0.40, OI > 0, max Bid → fallback closest to Δ 0.25. */
function pickShortCall(rows, today) {
  const inWindow = rows.filter((r) => isCall(r) && withinDTE(r, today) && num(r.Bid) > 0);
  const strict = inWindow.filter((r) => {
    const d = num(r.Delta), oi = num(r["Open Int."]);
    return d >= 0.15 && d <= 0.40 && oi > 0;
  });
  if (strict.length) {
    strict.sort((a, b) => num(b.Bid) - num(a.Bid));
    return strict[0];
  }
  // Fallback: any tradeable call, prefer Δ closest to 0.25.
  const soft = [...inWindow];
  soft.sort((a, b) => Math.abs(num(a.Delta) - 0.25) - Math.abs(num(b.Delta) - 0.25));
  return soft[0] || null;
}

/** Short put: Delta -0.40 to -0.15, OI > 0, max Bid → fallback closest to Δ -0.25. */
function pickShortPut(rows, today) {
  const inWindow = rows.filter((r) => isPut(r) && withinDTE(r, today) && num(r.Bid) > 0);
  const strict = inWindow.filter((r) => {
    const d = num(r.Delta), oi = num(r["Open Int."]);
    return d <= -0.15 && d >= -0.40 && oi > 0;
  });
  if (strict.length) {
    strict.sort((a, b) => num(b.Bid) - num(a.Bid));
    return strict[0];
  }
  const soft = [...inWindow];
  soft.sort((a, b) => Math.abs(num(a.Delta) + 0.25) - Math.abs(num(b.Delta) + 0.25));
  return soft[0] || null;
}

/** ATM call: Delta 0.35-0.65, OI > 0, nearest DTE → fallback closest to Δ 0.50. */
function pickATMCall(rows, today) {
  const inWindow = rows.filter((r) => isCall(r) && withinDTE(r, today) && num(r.Bid) > 0);
  const strict = inWindow.filter((r) => {
    const d = num(r.Delta), oi = num(r["Open Int."]);
    return d >= 0.35 && d <= 0.65 && oi > 0;
  });
  if (strict.length) {
    strict.sort((a, b) => {
      const da = daysBetween(parseFinvizExpiry(a.Expiry), today);
      const db = daysBetween(parseFinvizExpiry(b.Expiry), today);
      return da - db;
    });
    return strict[0];
  }
  const soft = [...inWindow];
  soft.sort((a, b) => Math.abs(num(a.Delta) - 0.50) - Math.abs(num(b.Delta) - 0.50));
  return soft[0] || null;
}

/** ATM put: Delta -0.65 to -0.35, OI > 0, nearest DTE → fallback closest to Δ -0.50. */
function pickATMPut(rows, today) {
  const inWindow = rows.filter((r) => isPut(r) && withinDTE(r, today) && num(r.Bid) > 0);
  const strict = inWindow.filter((r) => {
    const d = num(r.Delta), oi = num(r["Open Int."]);
    return d <= -0.35 && d >= -0.65 && oi > 0;
  });
  if (strict.length) {
    strict.sort((a, b) => {
      const da = daysBetween(parseFinvizExpiry(a.Expiry), today);
      const db = daysBetween(parseFinvizExpiry(b.Expiry), today);
      return da - db;
    });
    return strict[0];
  }
  const soft = [...inWindow];
  soft.sort((a, b) => Math.abs(num(a.Delta) + 0.50) - Math.abs(num(b.Delta) + 0.50));
  return soft[0] || null;
}

/** OTM put for a bear-put spread: same expiry as anchor, lower strike, decent Bid. */
function pickOTMPut(rows, anchor) {
  if (!anchor) return null;
  const anchorStrike = num(anchor.Strike);
  const cands = rows.filter((r) => {
    if (!isPut(r) || r.Expiry !== anchor.Expiry) return false;
    const s = num(r.Strike), bid = num(r.Bid);
    return Number.isFinite(s) && s < anchorStrike && bid > 0;
  });
  // Prefer strike ~5% below current — but we don't have currentPrice here; use 5% below anchor.
  const target = anchorStrike * 0.95;
  cands.sort((a, b) => Math.abs(num(a.Strike) - target) - Math.abs(num(b.Strike) - target));
  return cands[0] || null;
}

/** Short strangle: a matched call + put at same expiry, both delta-targeted. */
function pickStranglePair(rows, today) {
  const sc = pickShortCall(rows, today);
  if (!sc) return null;
  // Find a short put with same expiry — same widened filter as pickShortPut.
  const sameExp = rows.filter((r) => isPut(r) && r.Expiry === sc.Expiry && num(r.Bid) > 0);
  const strict = sameExp.filter((r) => {
    const d = num(r.Delta), oi = num(r["Open Int."]);
    return d <= -0.15 && d >= -0.40 && oi > 0;
  });
  let sp;
  if (strict.length) {
    strict.sort((a, b) => num(b.Bid) - num(a.Bid));
    sp = strict[0];
  } else if (sameExp.length) {
    const soft = [...sameExp];
    soft.sort((a, b) => Math.abs(num(a.Delta) + 0.25) - Math.abs(num(b.Delta) + 0.25));
    sp = soft[0];
  }
  if (!sp) return null;
  return { call: sc, put: sp };
}

/** Last-resort fallback: contract with max Bid across the whole chain. */
function pickBestAvailable(rows) {
  const tradeable = rows.filter((r) => num(r.Bid) > 0);
  if (!tradeable.length) return null;
  tradeable.sort((a, b) => num(b.Bid) - num(a.Bid));
  return tradeable[0];
}

// ---------- strategy selection ----------

function bias(pcr) {
  if (pcr == null) return "unknown";
  if (pcr < 0.7)   return "bullish";
  if (pcr > 1.3)   return "bearish";
  return "neutral";
}

function ivLevel(iv) {
  if (iv == null) return "unknown";
  if (iv > 50) return "high";
  if (iv < 25) return "low";
  return "moderate";
}

/** Pick the best strategy based on PCR × IV × contract availability. */
function chooseStrategy(metrics, picks) {
  const b = bias(metrics.pcr);
  const v = ivLevel(metrics.avgIV);

  // Each branch returns { id, name, icon, winrate, contract(s) } or null
  // if required contracts are missing — caller falls through to the next branch.
  if (b === "bullish" && v === "moderate" && picks.shortCall) {
    return {
      id: "covered_call",
      name: "Covered Call",
      icon: "🛡️",
      winrate: (1 - num(picks.shortCall.Delta)) * 100,
      contracts: { call: picks.shortCall },
    };
  }
  if (b === "bullish" && v === "high" && picks.shortPut) {
    return {
      id: "csp",
      name: "Cash-Secured Put",
      icon: "💰",
      winrate: (1 - Math.abs(num(picks.shortPut.Delta))) * 100,
      contracts: { put: picks.shortPut },
    };
  }
  if (b === "neutral" && v === "high" && picks.strangle) {
    const dCall = num(picks.strangle.call.Delta);
    const dPut  = Math.abs(num(picks.strangle.put.Delta));
    return {
      id: "short_strangle",
      name: "Short Strangle",
      icon: "🎯",
      winrate: (1 - (dCall + dPut) / 2) * 100,
      contracts: picks.strangle,
    };
  }
  if (b === "bearish" && v === "moderate" && picks.atmPut && picks.otmPut) {
    return {
      id: "bear_put_spread",
      name: "Bear Put Spread",
      icon: "🐻",
      winrate: Math.abs(num(picks.atmPut.Delta)) * 100,
      contracts: { atmPut: picks.atmPut, otmPut: picks.otmPut },
    };
  }
  if (v === "low") {
    if ((b === "bullish" || b === "neutral") && picks.atmCall) {
      return {
        id: "long_call",
        name: "Long Call",
        icon: "🚀",
        winrate: num(picks.atmCall.Delta) * 100,
        contracts: { call: picks.atmCall },
      };
    }
    if (b === "bearish" && picks.atmPut) {
      return {
        id: "long_put",
        name: "Long Put",
        icon: "📉",
        winrate: Math.abs(num(picks.atmPut.Delta)) * 100,
        contracts: { put: picks.atmPut },
      };
    }
  }

  // ----- fallbacks ----- pick the best available income strategy.
  if (picks.shortCall) {
    return {
      id: "covered_call",
      name: "Covered Call",
      icon: "🛡️",
      winrate: (1 - num(picks.shortCall.Delta)) * 100,
      contracts: { call: picks.shortCall },
      fallback: true,
    };
  }
  if (picks.shortPut) {
    return {
      id: "csp",
      name: "Cash-Secured Put",
      icon: "💰",
      winrate: (1 - Math.abs(num(picks.shortPut.Delta))) * 100,
      contracts: { put: picks.shortPut },
      fallback: true,
    };
  }

  // Last resort: max-Bid contract from the whole chain → Long Call or Long Put.
  if (picks.bestAvailable) {
    const c = picks.bestAvailable;
    const isC = isCall(c);
    return {
      id: isC ? "long_call" : "long_put",
      name: isC ? "Long Call (BEST AVAILABLE)" : "Long Put (BEST AVAILABLE)",
      icon: isC ? "🚀" : "📉",
      winrate: Math.abs(num(c.Delta)) * 100,
      contracts: isC ? { call: c } : { put: c },
      fallback: true,
      bestAvailable: true,
    };
  }
  return null;
}

/** Why each non-selected strategy was skipped — short string per id. */
function whyNotOthers(selected, metrics, picks) {
  const b = bias(metrics.pcr);
  const v = ivLevel(metrics.avgIV);
  const all = [
    { id: "covered_call",    name: "Covered Call",     need: () => !picks.shortCall ? "нет колла с подходящей Delta 0.15-0.40" : (b !== "bullish" ? `рынок ${b === "bearish" ? "медвежий" : "нейтральный"} — не время продавать коллы` : (v !== "moderate" ? `IV ${v === "high" ? "слишком высокая" : "слишком низкая"} для CC` : null)) },
    { id: "csp",             name: "Cash-Secured Put", need: () => !picks.shortPut ? "нет пута с подходящей Delta -0.40…-0.15" : (b !== "bullish" ? `рынок ${b}, нет смысла встречать падение` : (v !== "high" ? `IV ${v}, премия за пут не максимальна` : null)) },
    { id: "short_strangle",  name: "Short Strangle",   need: () => !picks.strangle ? "нет пары колл+пут на одной экспирации с нужной Delta" : (b !== "neutral" ? `рынок направленный (${b}) — стрэнгл рискован` : (v !== "high" ? `IV ${v}, премии за оба крыла малы` : null)) },
    { id: "bear_put_spread", name: "Bear Put Spread",  need: () => (!picks.atmPut || !picks.otmPut) ? "нет пары ATM+OTM путов" : (b !== "bearish" ? `рынок ${b}, ставка на падение не оправдана` : (v !== "moderate" ? `IV ${v}, цена спреда не оптимальна` : null)) },
    { id: "long_call",       name: "Long Call",        need: () => !picks.atmCall ? "нет ATM колла с Delta 0.35-0.65" : (v !== "low" ? `IV ${v}, опцион дороже разумного` : (b === "bearish" ? "рынок медвежий, длинный колл против тренда" : null)) },
    { id: "long_put",        name: "Long Put",         need: () => !picks.atmPut ? "нет ATM пута с Delta -0.65…-0.35" : (v !== "low" ? `IV ${v}, опцион дороже разумного` : (b !== "bearish" ? `рынок ${b}, длинный пут против тренда` : null)) },
  ];
  return all.filter((s) => s.id !== selected.id).map((s) => ({ name: s.name, reason: s.need() || "подходит, но выбранная стратегия даёт больший edge" }));
}

// ---------- per-strategy P/L calculators ----------
// Each returns a shape: { investment, premium, breakeven, scenarios: [{label, color, profit, pct}], thetaPerDay, dte, annualized }

function calcCoveredCall(opt, price) {
  const strike = num(opt.Strike);
  const bid    = num(opt.Bid);
  const theta  = num(opt.Theta);
  const exp    = parseFinvizExpiry(opt.Expiry);
  const dte    = daysBetween(exp, new Date());

  const investment = price * 100;
  const premium    = bid * 100;
  const breakeven  = price - bid;

  // Sc 1: акция выросла ВЫШЕ страйка → колл исполняется, продаём акцию по страйку
  const profitUp     = (strike - price + bid) * 100;
  const pctUp        = (profitUp / investment) * 100;
  // Sc 2: акция между breakeven и страйком → удерживаем премию + текущая позиция
  const profitFlat   = bid * 100;
  const pctFlat      = (bid / price) * 100;
  // Sc 3: акция упала на 5%
  const profitDown   = (price * 0.95 - price + bid) * 100;
  const pctDown      = (profitDown / investment) * 100;

  return {
    investment, premium, breakeven, dte,
    strike, bid,
    thetaPerDay: Math.abs(theta) * 100,
    annualized:  dte > 0 ? (bid / price) * (365 / dte) * 100 : null,
    maxProfit:   profitUp,
    maxLossNote: "Убыток если акция падает — теряешь как держатель акции, но премия частично компенсирует.",
    scenarios: [
      { label: `Акция выросла выше $${strike.toFixed(2)} (страйк)`,            color: "good",    profit: profitUp,   pct: pctUp   },
      { label: `Акция между $${breakeven.toFixed(2)} и $${strike.toFixed(2)}`, color: "neutral", profit: profitFlat, pct: pctFlat },
      { label: `Акция упала на 5% → $${(price * 0.95).toFixed(2)}`,            color: "bad",     profit: profitDown, pct: pctDown },
    ],
  };
}

function calcCashSecuredPut(opt, price) {
  const strike = num(opt.Strike);
  const bid    = num(opt.Bid);
  const theta  = num(opt.Theta);
  const exp    = parseFinvizExpiry(opt.Expiry);
  const dte    = daysBetween(exp, new Date());

  const investment = strike * 100; // cash reserved
  const premium    = bid * 100;
  const breakeven  = strike - bid;

  const profitUp   = bid * 100; // акция выше страйка → пут истекает worthless
  const pctUp      = (bid / strike) * 100;
  const profitDown = (price - strike + bid) * 100; // assignment scenario
  const pctDown    = (profitDown / investment) * 100;
  const profitBE   = 0;

  return {
    investment, premium, breakeven, dte,
    strike, bid,
    thetaPerDay: Math.abs(theta) * 100,
    annualized:  dte > 0 ? (bid / strike) * (365 / dte) * 100 : null,
    maxProfit:   profitUp,
    maxLossNote: "Максимальный убыток если акция рухнет к нулю: (страйк - премия) × 100.",
    scenarios: [
      { label: `Акция выше $${strike.toFixed(2)} (страйк) — пут истекает worthless`, color: "good",    profit: profitUp,   pct: pctUp   },
      { label: `Акция на breakeven $${breakeven.toFixed(2)}`,                        color: "neutral", profit: profitBE,   pct: 0       },
      { label: `Акция упала до текущей $${price.toFixed(2)} → assignment`,           color: "bad",     profit: profitDown, pct: pctDown },
    ],
  };
}

function calcShortStrangle(pair, price) {
  const call   = pair.call, put = pair.put;
  const cStr   = num(call.Strike), pStr = num(put.Strike);
  const cBid   = num(call.Bid),    pBid = num(put.Bid);
  const totalP = cBid + pBid;
  const exp    = parseFinvizExpiry(call.Expiry);
  const dte    = daysBetween(exp, new Date());
  const thetaC = Math.abs(num(call.Theta));
  const thetaP = Math.abs(num(put.Theta));

  // Approximate naked-options margin ≈ 20% of underlying per side (rough).
  const investment = Math.max(cStr, pStr) * 100 * 0.2;
  const premium    = totalP * 100;
  const breakevenUp   = cStr + totalP;
  const breakevenDown = pStr - totalP;

  const profitInside = totalP * 100;
  const pctInside    = (premium / investment) * 100;
  const profitBEUp   = 0;
  const profitBigMove = -(price * 0.10) * 100; // illustrative

  return {
    investment, premium, breakeven: null, dte,
    breakevenUp, breakevenDown, callStrike: cStr, putStrike: pStr,
    thetaPerDay: (thetaC + thetaP) * 100,
    annualized:  dte > 0 ? (totalP / price) * (365 / dte) * 100 : null,
    maxProfit:   profitInside,
    maxLossNote: "Убыток теоретически неограничен на росте, и до (страйк пута - премия) × 100 на падении.",
    scenarios: [
      { label: `Акция в коридоре $${pStr.toFixed(2)} - $${cStr.toFixed(2)}`,                                              color: "good",    profit: profitInside, pct: pctInside },
      { label: `Акция на breakeven $${breakevenDown.toFixed(2)} или $${breakevenUp.toFixed(2)}`,                          color: "neutral", profit: 0,            pct: 0         },
      { label: `Сильное движение ±10% за пределы коридора`,                                                                color: "bad",     profit: profitBigMove, pct: (profitBigMove / investment) * 100 },
    ],
  };
}

function calcLongCall(opt, price) {
  const strike = num(opt.Strike);
  const ask    = num(opt.Ask);
  const theta  = num(opt.Theta);
  const exp    = parseFinvizExpiry(opt.Expiry);
  const dte    = daysBetween(exp, new Date());

  const investment = ask * 100;
  const premium    = -ask * 100; // paid out
  const breakeven  = strike + ask;
  const profitUp10 = Math.max(0, price * 1.10 - strike) * 100 - investment;
  const profitFlat = -investment * 0.5; // approximate decay
  const profitDown = -investment;       // worthless

  return {
    investment, premium, breakeven, dte,
    strike, ask,
    thetaPerDay: -Math.abs(theta) * 100, // working AGAINST us
    annualized:  null,
    maxProfit:   null, // unlimited
    maxLossNote: "Максимальный убыток = вся уплаченная премия " + fmtMoney(investment),
    scenarios: [
      { label: `Акция выросла на 10% → $${(price * 1.10).toFixed(2)}`,    color: "good",    profit: profitUp10, pct: (profitUp10 / investment) * 100 },
      { label: `Акция осталась около $${price.toFixed(2)} (theta съел)`,  color: "neutral", profit: profitFlat, pct: (profitFlat / investment) * 100 },
      { label: `Акция упала ниже $${strike.toFixed(2)} (страйк)`,         color: "bad",     profit: profitDown, pct: -100 },
    ],
  };
}

function calcBearPutSpread(atmPut, otmPut, price) {
  const atmK = num(atmPut.Strike), otmK = num(otmPut.Strike);
  const atmAsk = num(atmPut.Ask),  otmBid = num(otmPut.Bid);
  const netPremium = atmAsk - otmBid;
  const exp = parseFinvizExpiry(atmPut.Expiry);
  const dte = daysBetween(exp, new Date());

  const investment = netPremium * 100;
  const breakeven  = atmK - netPremium;
  const maxProfit  = (atmK - otmK - netPremium) * 100;
  const profitDown = maxProfit;
  const profitFlat = -investment * 0.6; // approximate at expiry if price stays
  const profitUp   = -investment;       // both expire worthless

  return {
    investment, premium: -investment, breakeven, dte,
    atmStrike: atmK, otmStrike: otmK,
    thetaPerDay: 0, // net theta close to zero on debit spreads
    annualized:  null,
    maxProfit,
    maxLossNote: "Максимальный убыток = чистая премия " + fmtMoney(investment),
    scenarios: [
      { label: `Акция упала до $${otmK.toFixed(2)} или ниже`,    color: "good",    profit: maxProfit,  pct: (maxProfit / investment) * 100 },
      { label: `Акция на breakeven $${breakeven.toFixed(2)}`,    color: "neutral", profit: 0,          pct: 0 },
      { label: `Акция выше $${atmK.toFixed(2)} (страйк ATM)`,    color: "bad",     profit: profitUp,   pct: -100 },
    ],
  };
}

// ---------- theta decay table ----------

function thetaDecayTable(currentValue, thetaPerDay, dte) {
  const checkpoints = [0, 7, 14, 21, dte];
  const seen = new Set();
  const out = [];
  for (const d of checkpoints) {
    if (d < 0 || d > dte || seen.has(d)) continue;
    seen.add(d);
    // For short positions thetaPerDay > 0 (we receive theta).
    // For long positions thetaPerDay < 0 (we pay theta).
    const remaining = Math.max(0, currentValue - Math.abs(thetaPerDay) * d);
    out.push({ day: d, value: remaining, pl: thetaPerDay > 0 ? (currentValue - remaining) : -(currentValue - remaining) });
  }
  return out.sort((a, b) => a.day - b.day);
}

// ---------- glossary tooltip component ----------

function Term({ k, children }) {
  const [open, setOpen] = useState(false);
  const text = GLOSSARY[k] || "";
  return (
    <span style={S.termWrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <span
        style={S.termIcon}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={text}
      >
        ❓
      </span>
      {open && <span style={S.tooltip}>{text}</span>}
    </span>
  );
}

// ===========================================================================

export default function SmartStrategy() {
  // ----- access gate (shared with /options) -----
  const [hasAccess, setHasAccess] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [ticker, setTicker]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [result, setResult]   = useState(null);

  // "Спросить Claude" panel
  const [askLoading, setAskLoading] = useState(false);
  const [askText, setAskText]       = useState("");

  useEffect(() => {
    try { setHasAccess(localStorage.getItem(KEY_ACCESS) === "1"); } catch {}
  }, []);

  function tryLogin() {
    if (passwordInput === PASSWORD) {
      try { localStorage.setItem(KEY_ACCESS, "1"); } catch {}
      setHasAccess(true); setPasswordError(""); setPasswordInput("");
    } else {
      setPasswordError("Неверный пароль");
    }
  }
  function logout() {
    try { localStorage.removeItem(KEY_ACCESS); } catch {}
    setHasAccess(false); setPasswordInput("");
  }

  async function analyze() {
    setError("");
    setResult(null);
    setAskText("");
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Введи тикер"); return; }

    setLoading(true);
    try {
      const [optRes, qRes] = await Promise.all([
        fetch("/api/finviz-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: t }),
        }),
        fetch("/api/finviz-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: t }),
        }),
      ]);
      const optData = await optRes.json();
      const qData   = await qRes.json();
      if (optData.error) throw new Error("Опционы: " + optData.error);
      if (qData.error)   throw new Error("Котировки: " + qData.error);

      const rows = optData.rows || [];
      const quoteRows = qData.rows || [];
      if (!rows.length)       throw new Error("Опционная цепочка пуста.");
      if (!quoteRows.length)  throw new Error("Нет данных по цене.");

      const last = quoteRows[quoteRows.length - 1];
      const currentPrice = num(last.Close);
      if (!Number.isFinite(currentPrice)) throw new Error("Не удалось прочитать текущую цену.");

      const today = new Date();
      const callCount = rows.filter(isCall).length;
      const putCount  = rows.filter(isPut).length;
      const metrics = {
        pcr:        computePCR(rows),
        avgIV:      meanIV(rows),
        skew:       computeSkew(rows),
        maxPain:    maxPainStrike(rows),
        atm:        atmStrike(rows, currentPrice),
        chainCount: rows.length,
        callCount,
        putCount,
        bias:       null,
        ivLevel:    null,
      };
      metrics.bias    = bias(metrics.pcr);
      metrics.ivLevel = ivLevel(metrics.avgIV);

      const atmPut = pickATMPut(rows, today);
      const picks = {
        shortCall:     pickShortCall(rows, today),
        shortPut:      pickShortPut(rows, today),
        atmCall:       pickATMCall(rows, today),
        atmPut,
        otmPut:        pickOTMPut(rows, atmPut),
        strangle:      pickStranglePair(rows, today),
        bestAvailable: pickBestAvailable(rows),
      };

      const strategy = chooseStrategy(metrics, picks);
      if (!strategy) {
        throw new Error("Не нашлось подходящих контрактов для любой из 6 стратегий — попробуй другой тикер.");
      }

      // Build numbers for the chosen strategy.
      let calc, theta;
      const fromOption = (opt, currentValueField) => {
        // currentValueField is "Bid" for short, "Ask" for long.
        const cv = num(opt[currentValueField]) * 100;
        return cv;
      };

      switch (strategy.id) {
        case "covered_call": {
          calc = calcCoveredCall(strategy.contracts.call, currentPrice);
          theta = thetaDecayTable(fromOption(strategy.contracts.call, "Bid"), calc.thetaPerDay, calc.dte);
          break;
        }
        case "csp": {
          calc = calcCashSecuredPut(strategy.contracts.put, currentPrice);
          theta = thetaDecayTable(fromOption(strategy.contracts.put, "Bid"), calc.thetaPerDay, calc.dte);
          break;
        }
        case "short_strangle": {
          calc = calcShortStrangle(strategy.contracts, currentPrice);
          const cv = (num(strategy.contracts.call.Bid) + num(strategy.contracts.put.Bid)) * 100;
          theta = thetaDecayTable(cv, calc.thetaPerDay, calc.dte);
          break;
        }
        case "long_call": {
          calc = calcLongCall(strategy.contracts.call, currentPrice);
          theta = thetaDecayTable(fromOption(strategy.contracts.call, "Ask"), calc.thetaPerDay, calc.dte);
          break;
        }
        case "long_put": {
          // Mirror of long call — reuse calcLongCall with put fields.
          const opt = strategy.contracts.put;
          calc = {
            ...calcLongCall(opt, currentPrice),
            scenarios: [
              { label: `Акция упала на 10% → $${(currentPrice * 0.90).toFixed(2)}`, color: "good",
                profit: Math.max(0, num(opt.Strike) - currentPrice * 0.90) * 100 - num(opt.Ask) * 100,
                pct:    ((Math.max(0, num(opt.Strike) - currentPrice * 0.90) * 100 - num(opt.Ask) * 100) / (num(opt.Ask) * 100)) * 100 },
              { label: `Акция осталась около $${currentPrice.toFixed(2)}`,           color: "neutral", profit: -num(opt.Ask) * 50, pct: -50 },
              { label: `Акция выросла выше $${num(opt.Strike).toFixed(2)}`,          color: "bad",     profit: -num(opt.Ask) * 100, pct: -100 },
            ],
          };
          theta = thetaDecayTable(fromOption(opt, "Ask"), calc.thetaPerDay, calc.dte);
          break;
        }
        case "bear_put_spread": {
          calc = calcBearPutSpread(strategy.contracts.atmPut, strategy.contracts.otmPut, currentPrice);
          theta = thetaDecayTable(calc.investment, 0, calc.dte);
          break;
        }
        default:
          throw new Error("Неизвестная стратегия.");
      }

      const reasoning = buildReasoning(metrics, strategy, currentPrice);
      const others    = whyNotOthers(strategy, metrics, picks);

      setResult({
        ticker: t, currentPrice, metrics, strategy, calc, theta, reasoning, others,
        contracts: strategy.contracts,
      });
    } catch (e) {
      setError(e.message || "Ошибка при анализе");
    }
    setLoading(false);
  }

  async function askClaude() {
    if (!result) return;
    setAskLoading(true);
    setAskText("");
    const m = result.metrics;
    const c = result.calc;
    const s = result.strategy;
    const contractsDesc = describeContracts(result.contracts);
    const userMsg = [
      `Тикер: ${result.ticker}, текущая цена: $${result.currentPrice.toFixed(2)}`,
      `Метрики рынка: PCR ${m.pcr?.toFixed(2)}, IV ${m.avgIV?.toFixed(1)}%, Skew ${m.skew?.toFixed(2)}, Max Pain $${m.maxPain}, ATM $${m.atm}`,
      `Выбранная стратегия: ${s.name} (winrate ${s.winrate.toFixed(0)}%)`,
      `Контракты: ${contractsDesc}`,
      `Вложений: ${fmtMoney(c.investment)}, премия: ${fmtMoney(Math.abs(c.premium))}, breakeven: ${c.breakeven ? "$" + c.breakeven.toFixed(2) : "—"}`,
      `Theta в день: ${fmtMoney(c.thetaPerDay)}, дней до экспирации: ${c.dte}`,
      "",
      "Задача: проанализируй стратегию глубоко. Какие риски не учтены? Какие альтернативы стоит рассмотреть? Что важно знать перед открытием позиции? Простым языком, без жаргона. Цифры — только из переданного блока, не выдумывай.",
    ].join("\n");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "Ты опционный коуч. Объясняешь простыми словами, на русском, без жаргона. Запрещены слова: leg, нога, спред, дебет, кредит, exercise. Используй только переданные данные.",
          messages: [{ role: "user", content: userMsg }],
          useSearch: false,
        }),
      });
      const data = await res.json();
      setAskText(data.text || data.error || "(пусто)");
    } catch (e) {
      setAskText("Ошибка: " + (e.message || "network"));
    }
    setAskLoading(false);
  }

  // ----- render: password gate -----
  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>Smart Strategy</h1>
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
          {passwordError && <div style={S.errorInline}>{passwordError}</div>}
          <button style={{ ...S.btn, marginTop: 12 }} onClick={tryLogin}>Войти</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={{ position: "absolute", top: 18, right: 24, display: "flex", gap: 8 }}>
        <a href="/briefing" style={{ padding: "6px 12px", background: "#1a1c20", color: "#10b981", border: "1px solid #10b981", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>☼ Briefing</a>
        <a href="/dashboard" style={{ padding: "6px 12px", background: "#1a1c20", color: "#4caf50", border: "1px solid #4caf50", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>🎛 Dashboard</a>
        <a href="/options" style={{ padding: "6px 12px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>🎯 Опционный деск</a>
        <button style={{ ...S.logoutBtn, position: "static" }} onClick={logout} title="Сбросить доступ">Выйти</button>
      </div>

      <h1 style={S.title}>Smart Strategy</h1>
      <p style={S.subtitle}>
        Одна кнопка → полный анализ цепочки → лучшая стратегия с точными цифрами.
      </p>

      {/* 30-секундный ликбез */}
      <div style={S.intro}>
        <div style={S.introTitle}>Как это работает — за 30 секунд</div>
        <div style={S.introBody}>
          <Term k="strike">Опцион</Term> = договор на покупку или продажу акции по фиксированной цене до определённой даты.
          Продавая опцион — получаешь деньги сейчас. Покупая — платишь за возможность заработать больше.
        </div>
      </div>

      {/* Ввод */}
      <div style={S.inputRow}>
        <input
          style={S.inpLarge}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading) analyze(); }}
          placeholder="NVDA"
          maxLength={10}
        />
        <button style={S.btnPrimary} onClick={analyze} disabled={loading}>
          {loading ? "Анализирую…" : "Найти лучшую стратегию"}
        </button>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {result && <ResultCard result={result} askClaude={askClaude} askLoading={askLoading} askText={askText} />}
    </div>
  );
}

// ---------- result rendering helpers ----------

function buildReasoning(metrics, strategy, price) {
  const lines = [];
  if (metrics.pcr != null) {
    const tag = metrics.bias === "bullish" ? "рынок бычий" : metrics.bias === "bearish" ? "рынок медвежий" : "рынок нейтральный";
    lines.push(`PCR ${metrics.pcr.toFixed(2)} → ${tag}`);
  }
  if (metrics.avgIV != null) {
    const tag = metrics.ivLevel === "high" ? "высокая — продавать выгодно" : metrics.ivLevel === "low" ? "низкая — покупать выгодно" : "умеренная";
    lines.push(`IV ${metrics.avgIV.toFixed(1)}% → ${tag}`);
  }
  if (metrics.skew != null) {
    lines.push(`Skew ${metrics.skew.toFixed(2)} → ${metrics.skew > 1.2 ? "путы дороже — рынок боится падения" : "коллы и путы оценены сбалансированно"}`);
  }
  if (metrics.maxPain != null) {
    lines.push(`Max Pain $${metrics.maxPain} → магнитный уровень для цены к экспирации`);
  }
  if (metrics.atm != null) {
    lines.push(`ATM страйк $${metrics.atm} (текущая цена $${price.toFixed(2)})`);
  }
  if (strategy.fallback) {
    lines.push("⚠️ Стратегия выбрана как запасной вариант — идеального сценария по PCR×IV не нашлось.");
  }
  return lines;
}

function describeContracts(c) {
  const parts = [];
  if (c.call)    parts.push(`колл $${num(c.call.Strike)} exp ${c.call.Expiry} (Δ ${num(c.call.Delta).toFixed(2)}, Bid ${num(c.call.Bid).toFixed(2)})`);
  if (c.put)     parts.push(`пут $${num(c.put.Strike)} exp ${c.put.Expiry} (Δ ${num(c.put.Delta).toFixed(2)}, Bid ${num(c.put.Bid).toFixed(2)})`);
  if (c.atmPut)  parts.push(`ATM пут $${num(c.atmPut.Strike)} exp ${c.atmPut.Expiry} (Ask ${num(c.atmPut.Ask).toFixed(2)})`);
  if (c.otmPut)  parts.push(`OTM пут $${num(c.otmPut.Strike)} exp ${c.otmPut.Expiry} (Bid ${num(c.otmPut.Bid).toFixed(2)})`);
  return parts.join(" + ");
}

function MarketInfo({ ticker, currentPrice, metrics }) {
  const biasLabel = metrics.bias === "bullish" ? "🐂 бычий" : metrics.bias === "bearish" ? "🐻 медвежий" : "⚖️ нейтральный";
  const ivLabel   = metrics.ivLevel === "high" ? "высокая" : metrics.ivLevel === "low" ? "низкая" : "умеренная";
  return (
    <div style={S.marketWrap}>
      <div style={S.marketTitle}>ОБСТАНОВКА НА РЫНКЕ — ${ticker}</div>
      <div style={S.marketGrid}>
        <div style={S.marketCell}>
          <div style={S.marketKey}>Текущая цена</div>
          <div style={S.marketVal}>${currentPrice.toFixed(2)}</div>
        </div>
        <div style={S.marketCell}>
          <div style={S.marketKey}><Term k="pcr">PCR</Term></div>
          <div style={S.marketVal}>{metrics.pcr != null ? metrics.pcr.toFixed(2) : "—"}</div>
          <div style={S.marketSub}>{biasLabel}</div>
        </div>
        <div style={S.marketCell}>
          <div style={S.marketKey}>Средняя <Term k="iv">IV</Term></div>
          <div style={S.marketVal}>{metrics.avgIV != null ? metrics.avgIV.toFixed(1) + "%" : "—"}</div>
          <div style={S.marketSub}>{ivLabel}</div>
        </div>
        <div style={S.marketCell}>
          <div style={S.marketKey}>Контрактов в цепочке</div>
          <div style={S.marketVal}>{metrics.chainCount ?? "—"}</div>
          <div style={S.marketSub}>{metrics.callCount} коллов · {metrics.putCount} путов</div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, askClaude, askLoading, askText }) {
  const { ticker, currentPrice, metrics, strategy, calc, theta, reasoning, others, contracts } = result;

  return (
    <>
      <MarketInfo ticker={ticker} currentPrice={currentPrice} metrics={metrics} />

      <div style={S.resultWrap}>
      {strategy.bestAvailable && (
        <div style={S.bestAvailBanner}>
          ⚠ <b>BEST AVAILABLE fallback</b> — ни одна из 5 базовых стратегий не подошла под фильтры.
          Показываю позицию по самому ликвидному контракту цепочки.
        </div>
      )}
      {/* Header */}
      <div style={S.resultHeader}>
        <div style={S.resultIcon}>{strategy.icon}</div>
        <div>
          <div style={S.resultLabel}>РЕКОМЕНДОВАННАЯ СТРАТЕГИЯ</div>
          <div style={S.resultName}>
            {strategy.name}{" "}
            <Term k={strategy.id === "covered_call" ? "cc" : strategy.id === "csp" ? "csp" : strategy.id === "short_strangle" ? "strangle" : strategy.id === "bear_put_spread" ? "bps" : strategy.id === "long_call" ? "longcall" : strategy.id === "long_put" ? "longput" : "strike"}>&nbsp;</Term>
          </div>
          <div style={S.resultTicker}>${ticker} · текущая цена ${currentPrice.toFixed(2)}</div>
        </div>
        <div style={S.winrateBox}>
          <div style={S.winrateNum}>{strategy.winrate.toFixed(0)}%</div>
          <div style={S.winrateLabel}><Term k="winrate">Winrate</Term></div>
        </div>
      </div>

      {/* Reasoning */}
      <div style={S.section}>
        <div style={S.sectionTitle}>ПОЧЕМУ ЭТА СТРАТЕГИЯ</div>
        <ul style={S.list}>
          {reasoning.map((line, i) => <li key={i} style={S.listItem}>{line}</li>)}
        </ul>
      </div>

      {/* Position params */}
      <div style={S.section}>
        <div style={S.sectionTitle}>ПАРАМЕТРЫ ПОЗИЦИИ</div>
        <div style={S.paramsGrid}>
          <Param label="Вложений" value={fmtMoney(calc.investment)} />
          <Param label={<><Term k="premium">Премия</Term></>} value={fmtMoney(Math.abs(calc.premium ?? (calc.bid * 100)))} />
          {calc.breakeven != null   && <Param label={<><Term k="breakeven">Breakeven</Term></>}   value={fmtMoney(calc.breakeven)} />}
          {calc.breakevenUp != null && <Param label="BE сверху"   value={fmtMoney(calc.breakevenUp)} />}
          {calc.breakevenDown != null && <Param label="BE снизу"   value={fmtMoney(calc.breakevenDown)} />}
          <Param label="Дней до экспирации" value={calc.dte} />
          <Param label={<><Term k="theta">Theta</Term> в день</>} value={fmtMoney(calc.thetaPerDay) + (calc.thetaPerDay > 0 ? " (на нас)" : calc.thetaPerDay < 0 ? " (против нас)" : "")} />
          {calc.annualized != null && <Param label="Годовая доходность" value={fmtPct(calc.annualized)} />}
          {calc.maxProfit  != null && <Param label="Макс. прибыль"     value={fmtMoney(calc.maxProfit)} />}
        </div>
        <div style={S.contractsLine}>
          <span style={S.muted}>Контракты:</span> {describeContracts(contracts)}
        </div>
        <div style={S.warningLine}>⚠ {calc.maxLossNote}</div>
      </div>

      {/* Scenarios */}
      <div style={S.section}>
        <div style={S.sectionTitle}>ТРИ СЦЕНАРИЯ</div>
        <div style={S.scenarioGrid}>
          {calc.scenarios.map((s, i) => (
            <div key={i} style={{ ...S.scenarioCard, ...scenarioColor(s.color) }}>
              <div style={S.scenarioLabel}>{s.label}</div>
              <div style={S.scenarioProfit}>{s.profit >= 0 ? "+" : ""}{fmtMoney(s.profit)}</div>
              <div style={S.scenarioPct}>{fmtPct(s.pct)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Theta decay */}
      <div style={S.section}>
        <div style={S.sectionTitle}><Term k="theta">Theta</Term> decay по дням</div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>День</th>
                <th style={S.th}>Стоимость опциона</th>
                <th style={S.th}>P/L накоплено</th>
              </tr>
            </thead>
            <tbody>
              {theta.map((row, i) => (
                <tr key={i} style={i % 2 ? S.trAlt : S.tr}>
                  <td style={S.td}>{row.day === 0 ? "Сегодня" : row.day === calc.dte ? `${row.day} (экспирация)` : `+${row.day}`}</td>
                  <td style={S.tdNum}>{fmtMoney(row.value)}</td>
                  <td style={{ ...S.tdNum, color: row.pl >= 0 ? "#4caf50" : "#e57373" }}>
                    {row.pl >= 0 ? "+" : ""}{fmtMoney(row.pl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Why not others */}
      <div style={S.section}>
        <div style={S.sectionTitle}>ПОЧЕМУ НЕ ДРУГИЕ СТРАТЕГИИ</div>
        <ul style={S.list}>
          {others.map((o, i) => (
            <li key={i} style={S.listItem}><b style={S.muted}>{o.name}:</b> {o.reason}</li>
          ))}
        </ul>
      </div>

      {/* Ask Claude */}
      <div style={S.section}>
        <button style={S.btnAsk} onClick={askClaude} disabled={askLoading}>
          {askLoading ? "Claude думает…" : "🧠 Спросить Claude — глубокий анализ"}
        </button>
        {askText && (
          <div style={S.askPanel}>
            <div style={S.askText}>{askText}</div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

function Param({ label, value }) {
  return (
    <div style={S.paramCell}>
      <div style={S.paramLabel}>{label}</div>
      <div style={S.paramValue}>{value}</div>
    </div>
  );
}

function scenarioColor(c) {
  if (c === "good")    return { background: "#1a2e1e", borderColor: "#4caf50" };
  if (c === "neutral") return { background: "#2e2a1a", borderColor: "#d97706" };
  return { background: "#2e1a1a", borderColor: "#e57373" };
}

// ===========================================================================
// styles
// ===========================================================================

const S = {
  page: { background: "#0d0e10", color: "#e6e6e6", minHeight: "100vh", padding: "24px 32px 64px", fontFamily: "system-ui, sans-serif", position: "relative", maxWidth: 1100, margin: "0 auto" },
  title: { margin: "0 0 4px", fontSize: 26, color: "#fff" },
  subtitle: { margin: "0 0 20px", color: "#888", fontSize: 13 },
  logoutBtn: { position: "absolute", top: 18, right: 24, padding: "6px 12px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 4, cursor: "pointer", fontSize: 12 },

  lockBox: { maxWidth: 360, margin: "10vh auto 0", padding: "24px 28px", background: "#161820", border: "1px solid #2a2d33", borderRadius: 8 },
  inp: { padding: "8px 10px", background: "#1a1c20", color: "#e6e6e6", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 13 },
  inpLarge: { padding: "12px 16px", background: "#1a1c20", color: "#fff", border: "1px solid #2a2d33", borderRadius: 6, fontSize: 18, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", width: 200 },
  btn: { padding: "9px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnPrimary: { padding: "12px 28px", background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 700, letterSpacing: 0.3 },
  btnAsk: { padding: "12px 22px", background: "#d97706", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 },

  errorInline: { color: "#e57373", marginTop: 8, fontSize: 14 },
  error: { padding: "10px 14px", background: "#3b1d1d", color: "#ff8888", borderRadius: 6, marginTop: 12, fontSize: 13 },

  intro: { background: "#161820", border: "1px solid #2a2d33", borderRadius: 8, padding: "14px 18px", marginBottom: 18 },
  introTitle: { color: "#d97706", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  introBody: { color: "#ddd", fontSize: 13, lineHeight: 1.55 },

  inputRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 12 },

  resultWrap: { marginTop: 20, background: "#161820", border: "2px solid #d97706", borderRadius: 10, padding: "22px 24px" },
  resultHeader: { display: "flex", alignItems: "center", gap: 16, marginBottom: 18, borderBottom: "1px solid #2a2d33", paddingBottom: 16 },
  resultIcon: { fontSize: 44 },
  resultLabel: { color: "#888", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  resultName: { color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 2 },
  resultTicker: { color: "#3b82f6", fontSize: 13, fontWeight: 500, marginTop: 4 },
  winrateBox: { marginLeft: "auto", textAlign: "center", padding: "10px 16px", background: "#0d0e10", border: "1px solid #2a2d33", borderRadius: 8 },
  winrateNum: { fontSize: 28, fontWeight: 800, color: "#4caf50", fontVariantNumeric: "tabular-nums" },
  winrateLabel: { fontSize: 11, color: "#888", marginTop: 2 },

  // Market info — always visible above the strategy card
  marketWrap:  { marginTop: 20, marginBottom: 12, background: "#161820", border: "1px solid #2a2d33", borderRadius: 10, padding: "16px 20px" },
  marketTitle: { color: "#888", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  marketGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 },
  marketCell:  { background: "#0d0e10", border: "1px solid #2a2d33", borderRadius: 6, padding: "10px 14px" },
  marketKey:   { color: "#888", fontSize: 11, marginBottom: 4 },
  marketVal:   { color: "#fff", fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  marketSub:   { color: "#aaa", fontSize: 11, marginTop: 2 },

  bestAvailBanner: { background: "#2e1a1a", color: "#ffb380", border: "1px solid #d97706", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 12, lineHeight: 1.5 },

  section: { marginBottom: 22 },
  sectionTitle: { color: "#d97706", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  list: { margin: 0, paddingLeft: 18, color: "#e6e6e6", fontSize: 13, lineHeight: 1.6 },
  listItem: { marginBottom: 4 },

  paramsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 },
  paramCell: { background: "#0d0e10", border: "1px solid #2a2d33", borderRadius: 6, padding: "10px 12px" },
  paramLabel: { color: "#888", fontSize: 11, marginBottom: 4 },
  paramValue: { color: "#fff", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  contractsLine: { marginTop: 10, color: "#bbb", fontSize: 12, lineHeight: 1.5 },
  warningLine: { marginTop: 8, color: "#d97706", fontSize: 12, fontStyle: "italic" },
  muted: { color: "#888" },

  scenarioGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  scenarioCard: { border: "1px solid", borderRadius: 8, padding: "12px 14px" },
  scenarioLabel: { color: "#ddd", fontSize: 12, lineHeight: 1.4, marginBottom: 8, minHeight: 32 },
  scenarioProfit: { fontSize: 20, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" },
  scenarioPct: { fontSize: 12, color: "#aaa", marginTop: 2 },

  tableWrap: { overflowX: "auto", border: "1px solid #2a2d33", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", background: "#1a1c20", color: "#bbb", textAlign: "left", borderBottom: "1px solid #2a2d33", fontWeight: 600 },
  tr: { background: "#0d0e10" },
  trAlt: { background: "#121317" },
  td: { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126" },
  tdNum: { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126", textAlign: "right", fontVariantNumeric: "tabular-nums" },

  askPanel: { marginTop: 14, background: "#0d0e10", border: "1px solid #2a2d33", borderRadius: 6, padding: "14px 18px" },
  askText: { color: "#e6e6e6", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" },

  // Glossary tooltip
  termWrap: { position: "relative", display: "inline-block", cursor: "help" },
  termIcon: { marginLeft: 4, color: "#888", fontSize: 11, cursor: "pointer", userSelect: "none" },
  tooltip: {
    position: "absolute", bottom: "calc(100% + 6px)", left: 0,
    background: "#0d0e10", border: "1px solid #d97706", color: "#fff",
    padding: "8px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.5,
    width: 260, zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    fontWeight: 400, textTransform: "none", letterSpacing: 0,
  },
};
