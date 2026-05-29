"use client";
//
// Движок стратегий для /volatility.
//
// На вход — уже загруженный массив контрактов выбранной даты (Finviz e=mode):
// strike, type, bid, ask, delta, iv, openInterest, marketPremium + спот цена.
// Никаких новых запросов — всё считается на клиенте.
//
// Реализованные стратегии (все продают премию):
//   covered_call · csp · iron_condor · bull_put · bear_call
//   (Bull Put и Bear Call — два варианта vertical spread'а, переключаются
//    вручную пользователем или подбираются автоматикой по тренду)
//
// Автоподбор — простые прозрачные правила (без чёрного ящика):
//   IV ≥ 60% → Iron Condor (продажа vol с обеих сторон, IV crush max edge)
//   IV 40-60%, медвежий перекос (Put/Call OI > 1.3) → Bear Call
//   IV 40-60%, бычий перекос  (Put/Call OI < 0.7) → Bull Put
//   IV 40-60%, нейтральный    → CSP (универсал продажи премии)
//   IV 20-40%                → CSP
//   IV < 20%                 → Covered Call (theta decay при дешёвых опционах)
//
// Доходность считаем НА ЗАНЯТЫЙ КАПИТАЛ (это premium / capitalAtRisk),
// потом анализируем годовую × 365/DTE. Это правильная метрика — не от
// цены акции, не от номинала, а от реальных денег под сделкой.
//
// Каждая стратегия даёт массив Candidate'ов; таблица фильтруется по винрейту
// ≥ 50% (порог автоматически поднимается до ≤15 строк) и сортируется.
//
// Compliance: винрейт = вероятность из дельты, НЕ гарантия. Приписка внизу.

import { useMemo, useState } from "react";

// ============================================================================
// Палитра DESIGN_CODE.md — продублирована локально для self-containment.
// ============================================================================
const C = {
  bgMain:        "#15181C",
  bgAlt:         "#1A1E23",
  bgCard:        "#20252B",
  emerald:       "#12473D",
  petrol:        "#1D4258",
  textWhite:     "#FFFFFF",
  textPrimary:   "#D6D9DE",
  textSecondary: "#9CA3AF",
  textMute:      "#6B7280",
  divider:       "#2A2E34",
  marketUp:      "#2E7D5B",
  marketDown:    "#8E4343",
  marketNeutral: "#6B7280",
  marketWarning: "#A36D2D",
  marketInfo:    "#2F5F88",
};
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, 'Helvetica Neue', sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

// ============================================================================
// Helpers
// ============================================================================

// Цена продажи опциона — ТОЛЬКО живая котировка, без Last Close fallback'а.
// На неликвидных страйках Last Close — это стухшая цена многомесячной давности,
// она даёт фейковые $200 премии там где реально торгуется $0.05. Movok отбраковка.
// Приоритет:
//   Mid = (bid+ask)/2 если bid > 0 И ask > 0 — middle of spread
//   bid если только bid > 0 (консервативно)
//   null если bid отсутствует или равен 0 (страйк не торгуется)
function getSellPrice(c) {
  if (!c) return null;
  const bid = c.bid;
  const ask = c.ask;
  if (bid != null && bid > 0 && ask != null && ask > 0) return (bid + ask) / 2;
  if (bid != null && bid > 0) return bid;
  return null;
}

// Цена покупки защитного крыла — ask (что точно заплатим). Без fallback'а:
// если ask нет — крыло не купить, спред бракуем.
function getBuyPrice(c) {
  if (!c) return null;
  if (c?.ask != null && c.ask > 0) return c.ask;
  return null;
}

// Ликвидность: страйк реально торгуется, если есть жирная заявка на покупку
// (bid > 0) и накопленный открытый интерес ≥ 50 контрактов. Иначе котировки
// неактуальны и реальные сделки невозможны.
function isLiquid(c) {
  if (!c) return false;
  if (c.bid == null || c.bid <= 0) return false;
  if ((c.openInterest ?? 0) < 50) return false;
  return true;
}

// Дельта-зона для short-ноги: 0.10–0.45 — практическая зона продажи премии.
// Ниже 0.10 — премия копеечная, не оправдывает риск. Выше 0.45 — слишком
// близко к ATM, винрейт меньше 55% и риск выноса значительный.
const SHORT_DELTA_MIN = 0.10;
const SHORT_DELTA_MAX = 0.45;

function inShortDeltaZone(c) {
  if (!c || c.delta == null) return false;
  const abs = Math.abs(c.delta);
  return abs >= SHORT_DELTA_MIN && abs <= SHORT_DELTA_MAX;
}

// Найти страйк ближайший к (shortStrike ± idealWing) в нужном направлении.
function pickWingStrike(sortedStrikes, shortStrike, direction, idealWing) {
  const target = direction === "below" ? shortStrike - idealWing : shortStrike + idealWing;
  const candidates = direction === "below"
    ? sortedStrikes.filter(s => s < shortStrike)
    : sortedStrikes.filter(s => s > shortStrike);
  if (!candidates.length) return null;
  let best = candidates[0], bestDist = Math.abs(candidates[0] - target);
  for (const s of candidates) {
    const d = Math.abs(s - target);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

// Wing width в долларах — масштабируется к цене базисного актива.
function defaultWing(spot) {
  if (spot == null) return 5;
  if (spot < 50)   return 1;
  if (spot < 150)  return 5;
  if (spot < 500)  return 5;
  return 10;
}

// Days-until — local-time YYYY-MM-DD.
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(iso + "T00:00:00");
  return Math.max(1, Math.round((target - t0) / 86400000));
}

// Number formatters.
function fmtUsd(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits) + "%";
}
function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU");
}

// ============================================================================
// Strategy candidate builders
// ============================================================================

// Финализация кандидата — общая для всех стратегий: добавляем yield/annualized/score.
// winratePct — это ПРИБЛИЖЕНИЕ вероятности через дельту (1 − |delta short|).
// НЕ точный win rate. UI обозначает это символом «≈».
function finalize(c) {
  const yieldPct      = c.capitalAtRisk > 0 ? (c.premium / c.capitalAtRisk) * 100 : 0;
  const annualizedPct = c.dte > 0 ? yieldPct * (365 / c.dte) : 0;
  const scoreWinYield = c.winratePct * annualizedPct;
  return { ...c, yieldPct, annualizedPct, scoreWinYield };
}

// 1) Covered Call — для каждого OTM колла с дельтой в зоне 0.10-0.45 и
// ликвидностью.
function buildCoveredCalls(contracts, spot, dte) {
  if (spot == null) return [];
  const out = [];
  for (const c of contracts) {
    if (c.type !== "call") continue;
    if (c.strike <= spot) continue;
    if (!inShortDeltaZone(c)) continue;   // delta-зона 0.10–0.45
    if (!isLiquid(c)) continue;            // bid>0 + OI ≥ 50
    const sell = getSellPrice(c);
    if (sell == null) continue;
    const premium       = sell * 100;
    const capitalAtRisk = spot * 100;
    const breakeven     = spot - sell;
    const maxProfit     = premium + (c.strike - spot) * 100;
    // Макс убыток — если акция падает в 0; премию оставляем, акции теряем.
    const maxLoss       = spot * 100 - premium;
    out.push(finalize({
      kind: "covered_call",
      key: `cc_${c.strike}`,
      label: `Call $${c.strike.toFixed(2)}`,
      strikes: [c.strike],
      legs: [{ action: "sell", type: "call", strike: c.strike, price: sell }],
      winratePct: (1 - Math.abs(c.delta)) * 100,
      premium, capitalAtRisk,
      breakevenLow: breakeven, breakevenHigh: null,
      maxProfit, maxLoss,
      // Покрытый колл НЕ создаёт неограниченного риска — он покрыт акциями.
      // maxLoss отражает риск ВЛАДЕНИЯ акцией (падение в 0), сниженный премией.
      riskKind: "ownership",
      dte,
    }));
  }
  return out;
}

// 2) Cash-Secured Put — для каждого OTM пута с дельтой в зоне 0.10-0.45 и
// ликвидностью.
function buildCSPs(contracts, spot, dte) {
  if (spot == null) return [];
  const out = [];
  for (const c of contracts) {
    if (c.type !== "put") continue;
    if (c.strike >= spot) continue;
    if (!inShortDeltaZone(c)) continue;   // delta-зона 0.10–0.45
    if (!isLiquid(c)) continue;            // bid>0 + OI ≥ 50
    const sell = getSellPrice(c);
    if (sell == null) continue;
    const premium       = sell * 100;
    const capitalAtRisk = c.strike * 100;
    const breakeven     = c.strike - sell;
    const maxLoss       = c.strike * 100 - premium;
    out.push(finalize({
      kind: "csp",
      key: `csp_${c.strike}`,
      label: `Put $${c.strike.toFixed(2)}`,
      strikes: [c.strike],
      legs: [{ action: "sell", type: "put", strike: c.strike, price: sell }],
      winratePct: (1 - Math.abs(c.delta)) * 100,
      premium, capitalAtRisk,
      breakevenLow: breakeven, breakevenHigh: null,
      maxProfit: premium, maxLoss,
      // CSP — реальное обязательство купить акцию по K. Риск ограничен
      // обязательством: акция в 0 = убыток (K − prem) × 100 × N.
      riskKind: "obligation",
      dte,
    }));
  }
  return out;
}

// 3) Bull Put — продать OTM пут (delta-зона + ликвидность),
// купить пут ниже (тоже ликвидный).
function buildBullPuts(contracts, spot, dte, wing) {
  if (spot == null) return [];
  const puts = new Map();
  for (const c of contracts) if (c.type === "put") puts.set(c.strike, c);
  const strikes = [...puts.keys()].sort((a, b) => a - b);
  const out = [];
  for (const spStrike of strikes) {
    if (spStrike >= spot) continue;
    const SP = puts.get(spStrike);
    if (!SP) continue;
    if (!inShortDeltaZone(SP)) continue;   // short в зоне 0.10–0.45
    if (!isLiquid(SP)) continue;            // short ликвидный
    const sellSP = getSellPrice(SP);
    if (sellSP == null) continue;
    const lpStrike = pickWingStrike(strikes, spStrike, "below", wing);
    if (lpStrike == null) continue;
    const LP = puts.get(lpStrike);
    if (!LP) continue;
    if (!isLiquid(LP)) continue;            // long тоже должен быть ликвидным
    const buyLP = getBuyPrice(LP);
    if (buyLP == null) continue;
    const credit = sellSP - buyLP;
    if (credit <= 0) continue;
    const wingW = spStrike - lpStrike;
    const premium       = credit * 100;
    const capitalAtRisk = wingW * 100 - premium;
    if (capitalAtRisk <= 0) continue;
    out.push(finalize({
      kind: "bull_put",
      key: `bp_${spStrike}_${lpStrike}`,
      label: `Put $${spStrike.toFixed(0)} / $${lpStrike.toFixed(0)}`,
      strikes: [spStrike, lpStrike],
      legs: [
        { action: "sell", type: "put", strike: spStrike, price: sellSP },
        { action: "buy",  type: "put", strike: lpStrike, price: buyLP },
      ],
      winratePct: (1 - Math.abs(SP.delta)) * 100,
      premium, capitalAtRisk,
      breakevenLow: spStrike - credit, breakevenHigh: null,
      maxProfit: premium, maxLoss: capitalAtRisk,
      // Спред — риск ОГРАНИЧЕН шириной крыла минус кредит.
      riskKind: "defined",
      dte,
    }));
  }
  return out;
}

// 4) Bear Call — продать OTM колл (delta-зона + ликвидность),
// купить колл выше (тоже ликвидный).
function buildBearCalls(contracts, spot, dte, wing) {
  if (spot == null) return [];
  const calls = new Map();
  for (const c of contracts) if (c.type === "call") calls.set(c.strike, c);
  const strikes = [...calls.keys()].sort((a, b) => a - b);
  const out = [];
  for (const scStrike of strikes) {
    if (scStrike <= spot) continue;
    const SC = calls.get(scStrike);
    if (!SC) continue;
    if (!inShortDeltaZone(SC)) continue;   // short в зоне 0.10–0.45
    if (!isLiquid(SC)) continue;            // short ликвидный
    const sellSC = getSellPrice(SC);
    if (sellSC == null) continue;
    const lcStrike = pickWingStrike(strikes, scStrike, "above", wing);
    if (lcStrike == null) continue;
    const LC = calls.get(lcStrike);
    if (!LC) continue;
    if (!isLiquid(LC)) continue;            // long тоже должен быть ликвидным
    const buyLC = getBuyPrice(LC);
    if (buyLC == null) continue;
    const credit = sellSC - buyLC;
    if (credit <= 0) continue;
    const wingW = lcStrike - scStrike;
    const premium       = credit * 100;
    const capitalAtRisk = wingW * 100 - premium;
    if (capitalAtRisk <= 0) continue;
    out.push(finalize({
      kind: "bear_call",
      key: `bc_${scStrike}_${lcStrike}`,
      label: `Call $${scStrike.toFixed(0)} / $${lcStrike.toFixed(0)}`,
      strikes: [scStrike, lcStrike],
      legs: [
        { action: "sell", type: "call", strike: scStrike, price: sellSC },
        { action: "buy",  type: "call", strike: lcStrike, price: buyLC },
      ],
      winratePct: (1 - Math.abs(SC.delta)) * 100,
      premium, capitalAtRisk,
      breakevenLow: scStrike + credit, breakevenHigh: null,
      maxProfit: premium, maxLoss: capitalAtRisk,
      // Спред — риск ОГРАНИЧЕН шириной крыла минус кредит.
      riskKind: "defined",
      dte,
    }));
  }
  return out;
}

// 5) Iron Condor — для каждого OTM пута SP подбираем call SC с близким |delta|.
// Так получаем сбалансированный кондор: ширина крыльев одинаковая.
function buildIronCondors(contracts, spot, dte, wing) {
  if (spot == null) return [];
  const puts = new Map(), calls = new Map();
  for (const c of contracts) {
    if (c.type === "put") puts.set(c.strike, c);
    else if (c.type === "call") calls.set(c.strike, c);
  }
  const putStrikes  = [...puts.keys()].sort((a, b) => a - b);
  const callStrikes = [...calls.keys()].sort((a, b) => a - b);
  const out = [];

  for (const spStrike of putStrikes) {
    if (spStrike >= spot) continue;
    const SP = puts.get(spStrike);
    if (!SP) continue;
    if (!inShortDeltaZone(SP)) continue;   // short put в зоне 0.10–0.45
    if (!isLiquid(SP)) continue;
    const sellSP = getSellPrice(SP);
    if (sellSP == null) continue;

    const lpStrike = pickWingStrike(putStrikes, spStrike, "below", wing);
    if (lpStrike == null) continue;
    const LP = puts.get(lpStrike);
    if (!LP) continue;
    if (!isLiquid(LP)) continue;            // long put тоже ликвидный
    const buyLP = getBuyPrice(LP);
    if (buyLP == null) continue;

    // Подбираем SC с |delta| ближайшим к |delta SP| — сбалансированный кондор.
    // SC тоже должен быть в delta-зоне и ликвидным.
    const targetDelta = Math.abs(SP.delta);
    let SC = null, scStrike = null, bestDeltaDist = Infinity;
    for (const s of callStrikes) {
      if (s <= spot) continue;
      const c = calls.get(s);
      if (!c) continue;
      if (!inShortDeltaZone(c)) continue;
      if (!isLiquid(c)) continue;
      const d = Math.abs(Math.abs(c.delta) - targetDelta);
      if (d < bestDeltaDist) { bestDeltaDist = d; SC = c; scStrike = s; }
    }
    if (!SC) continue;
    const sellSC = getSellPrice(SC);
    if (sellSC == null) continue;

    const lcStrike = pickWingStrike(callStrikes, scStrike, "above", wing);
    if (lcStrike == null) continue;
    const LC = calls.get(lcStrike);
    if (!LC) continue;
    if (!isLiquid(LC)) continue;            // long call тоже ликвидный
    const buyLC = getBuyPrice(LC);
    if (buyLC == null) continue;

    const credit = (sellSP - buyLP) + (sellSC - buyLC);
    if (credit <= 0) continue;

    const wingPut  = spStrike - lpStrike;
    const wingCall = lcStrike - scStrike;
    const wingMax  = Math.max(wingPut, wingCall);
    const premium       = credit * 100;
    const capitalAtRisk = wingMax * 100 - premium;
    if (capitalAtRisk <= 0) continue;

    // Винрейт: вероятность нахождения между SP и SC = 1 − |Δ SP| − |Δ SC|.
    const winratePct = (1 - Math.abs(SP.delta) - Math.abs(SC.delta)) * 100;
    if (winratePct <= 0) continue;

    out.push(finalize({
      kind: "iron_condor",
      key: `ic_${spStrike}_${lpStrike}_${scStrike}_${lcStrike}`,
      label: `${lpStrike.toFixed(0)}/${spStrike.toFixed(0)} · ${scStrike.toFixed(0)}/${lcStrike.toFixed(0)}`,
      strikes: [lpStrike, spStrike, scStrike, lcStrike],
      legs: [
        { action: "buy",  type: "put",  strike: lpStrike, price: buyLP },
        { action: "sell", type: "put",  strike: spStrike, price: sellSP },
        { action: "sell", type: "call", strike: scStrike, price: sellSC },
        { action: "buy",  type: "call", strike: lcStrike, price: buyLC },
      ],
      winratePct,
      premium, capitalAtRisk,
      breakevenLow: spStrike - credit,
      breakevenHigh: scStrike + credit,
      maxProfit: premium, maxLoss: capitalAtRisk,
      // Iron Condor — риск ОГРАНИЧЕН большим крылом минус кредит.
      // Цена не может пробить оба крыла одновременно → worst case = большее крыло.
      riskKind: "defined",
      // Сохраняем wing-meta для прозрачности в UI.
      wingPut, wingCall,
      dte,
    }));
  }
  return out;
}

// ============================================================================
// Auto-pick — простые прозрачные правила.
// ============================================================================

function pickStrategy(ivAvgPct, putCallOiRatio) {
  if (ivAvgPct == null) {
    return {
      id: "csp",
      why: "Не удалось оценить ATM IV — CSP как универсальная стратегия продажи премии.",
    };
  }
  if (ivAvgPct >= 60) {
    return {
      id: "iron_condor",
      why: `IV ${ivAvgPct.toFixed(1)}% — очень высокая. Iron Condor продаёт премию с обеих сторон и максимально выигрывает от IV crush.`,
    };
  }
  if (ivAvgPct >= 40) {
    if (putCallOiRatio != null && putCallOiRatio > 1.3) {
      return {
        id: "bear_call",
        why: `IV ${ivAvgPct.toFixed(1)}% + Put/Call OI ${putCallOiRatio.toFixed(2)} — рынок защищается путами, медвежий перекос. Bear Call вытаскивает максимум.`,
      };
    }
    if (putCallOiRatio != null && putCallOiRatio < 0.7) {
      return {
        id: "bull_put",
        why: `IV ${ivAvgPct.toFixed(1)}% + Put/Call OI ${putCallOiRatio.toFixed(2)} — путов мало, бычий перекос. Bull Put получает edge.`,
      };
    }
    return {
      id: "csp",
      why: `IV ${ivAvgPct.toFixed(1)}% — высокая, перекоса нет. CSP даёт чистый theta-decay и готовность купить акцию ниже текущей цены.`,
    };
  }
  if (ivAvgPct < 20) {
    return {
      id: "covered_call",
      why: `IV ${ivAvgPct.toFixed(1)}% — низкая. Если есть 100 акций — Covered Call выжимает theta при дёшево стоящих опционах.`,
    };
  }
  return {
    id: "csp",
    why: `IV ${ivAvgPct.toFixed(1)}% — средняя. CSP как универсал: либо премия, либо акция по выгодной цене.`,
  };
}

const STRATEGY_LABELS = {
  covered_call: "Covered Call",
  csp:          "Cash-Secured Put",
  iron_condor:  "Iron Condor",
  bull_put:     "Bull Put",
  bear_call:    "Bear Call",
};

// ============================================================================
// Plain-language explanation
// ============================================================================

// Шаблоны объяснений строго по STRATEGY_RULES.md — что именно делать,
// откуда деньги, в каком сценарии, чем рискуем. Никаких сокращений.
function buildExplanation(cand, capital, spot, expiry, ticker) {
  const N = Math.max(0, Math.floor(capital / cand.capitalAtRisk));
  const totalPremium = N * cand.premium;
  const totalCapital = N * cand.capitalAtRisk;
  const totalMaxLoss = N * cand.maxLoss;
  const totalMaxProfit = N * cand.maxProfit;

  // Если контрактов 0 — отдельный шаблон-предупреждение.
  if (N === 0) {
    return `На капитал ${fmtUsd(capital, 0)} не хватает: 1 контракт требует ${fmtUsd(cand.capitalAtRisk, 0)}. Увеличьте капитал минимум до ${fmtUsd(cand.capitalAtRisk, 0)} либо выберите другой страйк/стратегию.`;
  }

  if (cand.kind === "covered_call") {
    const K = cand.strikes[0];
    const be = cand.breakevenLow;
    const shares = N * 100;
    const stockCost = shares * spot;
    return [
      `Купите ${shares} ${ctrShareWord(shares)} ${ticker} по ${fmtUsd(spot)} — вложение ${fmtUsd(stockCost, 0)}.`,
      `Продайте ${N} ${callWord(N)} на $${K} с экспирацией ${expiry} — получите премию ${fmtUsd(totalPremium, 0)} сразу.`,
      `Ниже $${K} к дате — премия ваша, акции остаются. Выше $${K} — акции заберут по $${K}, итог = премия + рост до страйка = ${fmtUsd(totalMaxProfit, 0)} (потолок прибыли — выше страйка дохода больше не будет).`,
      `Проданный колл покрыт акциями — неограниченного риска у короткой ноги нет.`,
      `Риск — падение ${ticker}, снижен премией на ${fmtUsd(cand.premium / 100)}/акцию: точка безубытка ${fmtUsd(be)}, в худшем случае (акция в ноль) — ${fmtUsd(totalMaxLoss, 0)}.`,
    ].join(" ");
  }

  if (cand.kind === "csp") {
    const K = cand.strikes[0];
    const be = cand.breakevenLow;
    return [
      `Продайте ${N} ${putWord(N)} на $${K} с экспирацией ${expiry} — премия ${fmtUsd(totalPremium, 0)} сразу, резерв ${fmtUsd(totalCapital, 0)} на возможный выкуп.`,
      `Выше $${K} к дате — премия ваша, резерв освобождается.`,
      `Ниже $${K} — поставят ${N * 100} ${ctrShareWord(N * 100)} по $${K}, реальная цена входа ${fmtUsd(be)} с учётом премии.`,
      `Макс убыток (если акция упадёт к нулю после поставки) — ${fmtUsd(totalMaxLoss, 0)}.`,
      `Готовность купить акции — обязательное условие.`,
    ].join(" ");
  }

  if (cand.kind === "bull_put") {
    const [Ks, Kl] = cand.strikes;
    const be = cand.breakevenLow;
    return [
      `Продайте PUT $${Ks}, одновременно купите PUT $${Kl} — обе ноги на экспирацию ${expiry} (${N} ${spreadWord(N)}).`,
      `Чистый кредит ${fmtUsd(totalPremium, 0)}, залог ${fmtUsd(totalCapital, 0)} (он же макс убыток).`,
      `Выше $${Ks} к дате — весь кредит ваш.`,
      `Ниже $${Kl} — макс убыток ${fmtUsd(totalMaxLoss, 0)}, он ОГРАНИЧЕН: нижний пут защищает.`,
      `Breakeven ${fmtUsd(be)}.`,
    ].join(" ");
  }

  if (cand.kind === "bear_call") {
    const [Ks, Kl] = cand.strikes;
    const be = cand.breakevenLow;
    return [
      `Продайте CALL $${Ks}, одновременно купите CALL $${Kl} — обе ноги на экспирацию ${expiry} (${N} ${spreadWord(N)}).`,
      `Чистый кредит ${fmtUsd(totalPremium, 0)}, залог ${fmtUsd(totalCapital, 0)} (он же макс убыток).`,
      `Ниже $${Ks} к дате — весь кредит ваш.`,
      `Выше $${Kl} — макс убыток ${fmtUsd(totalMaxLoss, 0)}, он ОГРАНИЧЕН: верхний колл защищает.`,
      `Breakeven ${fmtUsd(be)}.`,
    ].join(" ");
  }

  if (cand.kind === "iron_condor") {
    const [KpL, KpS, KcS, KcL] = cand.strikes;
    const beLow = cand.breakevenLow, beHigh = cand.breakevenHigh;
    const wingPutS  = cand.wingPut  != null ? `${cand.wingPut.toFixed(0)}` : "—";
    const wingCallS = cand.wingCall != null ? `${cand.wingCall.toFixed(0)}` : "—";
    return [
      `Продайте PUT $${KpS} и CALL $${KcS}, купите защитные PUT $${KpL} и CALL $${KcL} — все 4 ноги на экспирацию ${expiry} (${N} ${condorWord(N)}).`,
      `Чистый кредит ${fmtUsd(totalPremium, 0)}, залог ${fmtUsd(totalCapital, 0)} = макс убыток (берётся БОЛЬШЕЕ крыло: put $${wingPutS} vs call $${wingCallS}, цена не пробьёт оба сразу).`,
      `Если ${ticker} останется между $${KpS} и $${KcS} к дате — весь кредит ваш.`,
      `Выход за крылья — макс убыток ${fmtUsd(totalMaxLoss, 0)}, ОГРАНИЧЕН конструкцией.`,
      `Зона прибыли (с учётом кредита): ${fmtUsd(beLow)} — ${fmtUsd(beHigh)}.`,
    ].join(" ");
  }

  return "";
}

function ctrShareWord(n) {
  const last = n % 10, last2 = n % 100;
  if (last2 >= 11 && last2 <= 14) return "акций";
  if (last === 1) return "акция";
  if (last >= 2 && last <= 4) return "акции";
  return "акций";
}
function callWord(n) { return n === 1 ? "колл" : (n >= 2 && n <= 4 ? "колла" : "коллов"); }
function putWord(n)  { return n === 1 ? "пут"  : (n >= 2 && n <= 4 ? "пута"  : "путов"); }
function spreadWord(n) { return n === 1 ? "спред" : (n >= 2 && n <= 4 ? "спреда" : "спредов"); }
function condorWord(n) { return n === 1 ? "кондор" : (n >= 2 && n <= 4 ? "кондора" : "кондоров"); }

function ctrWord(n) {
  if (n === 1) return "контракт";
  if (n >= 2 && n <= 4) return "контракта";
  return "контрактов";
}
function dayWord(n) {
  const last = n % 10, last2 = n % 100;
  if (last2 >= 11 && last2 <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

// ============================================================================
// Main component
// ============================================================================

export default function StrategyEngine({ contracts, spot, expiry, ivAvgPct, ticker }) {
  // Капитал ОБЯЗАТЕЛЬНЫЙ для расчёта количества контрактов.
  // Дефолт 50000 — типичный портфель ритейл-инвестора; пользователь правит сразу.
  const [capital, setCapital] = useState(50000);
  // null → используется автоподбор; иначе override от пользователя.
  const [override, setOverride] = useState(null);
  // Сортировка таблицы.
  const [sortMode, setSortMode] = useState("score"); // "score" | "premium"
  // Какой страйк раскрыт.
  const [expanded, setExpanded] = useState(null);

  const dte = useMemo(() => daysUntil(expiry), [expiry]);
  const wing = useMemo(() => defaultWing(spot), [spot]);

  // Put/Call OI ratio для подсказки тренда автоподбору.
  const putCallOiRatio = useMemo(() => {
    let callOi = 0, putOi = 0;
    for (const c of contracts || []) {
      if (c.type === "call") callOi += c.openInterest || 0;
      else if (c.type === "put") putOi += c.openInterest || 0;
    }
    return callOi > 0 ? putOi / callOi : null;
  }, [contracts]);

  const autoPick = useMemo(
    () => pickStrategy(ivAvgPct, putCallOiRatio),
    [ivAvgPct, putCallOiRatio]
  );
  const currentStrategy = override || autoPick.id;

  // Генерация кандидатов для текущей стратегии.
  const allCandidates = useMemo(() => {
    if (!contracts?.length || spot == null || dte == null) return [];
    switch (currentStrategy) {
      case "covered_call": return buildCoveredCalls(contracts, spot, dte);
      case "csp":          return buildCSPs(contracts, spot, dte);
      case "iron_condor":  return buildIronCondors(contracts, spot, dte, wing);
      case "bull_put":     return buildBullPuts(contracts, spot, dte, wing);
      case "bear_call":    return buildBearCalls(contracts, spot, dte, wing);
      default: return [];
    }
  }, [contracts, spot, dte, wing, currentStrategy]);

  // Бывший фильтр по винрейту (с авто-поднятием порога) убран — дельта-зона
  // 0.10–0.45 + ликвидность уже отсекают весь мусор и оставляют 5-30 строк
  // на ликвидном тикере. Порог винрейта прятал практичные страйки.
  const filtered = useMemo(() => ({ rows: allCandidates }), [allCandidates]);

  // Сортировка.
  const sorted = useMemo(() => {
    const arr = [...filtered.rows];
    if (sortMode === "premium") {
      arr.sort((a, b) => b.premium - a.premium);
    } else {
      arr.sort((a, b) => b.scoreWinYield - a.scoreWinYield);
    }
    return arr;
  }, [filtered.rows, sortMode]);

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>
      {/* Капитал */}
      <div style={S.capitalRow}>
        <div>
          <div style={S.capitalLabel}>Капитал, $</div>
          <input
            type="number"
            value={capital}
            min={0}
            step={1000}
            onChange={(e) => setCapital(Math.max(0, parseFloat(e.target.value) || 0))}
            style={S.capitalInput}
          />
        </div>
        <div style={S.capitalMeta}>
          <div style={S.metaRow}><span style={S.metaKey}>Дата</span><span style={S.metaVal}>{expiry || "—"}</span></div>
          <div style={S.metaRow}><span style={S.metaKey}>До экспирации</span><span style={S.metaVal}>{dte != null ? `${dte} ${dayWord(dte)}` : "—"}</span></div>
          <div style={S.metaRow}><span style={S.metaKey}>Spot</span><span style={S.metaVal}>{spot != null ? fmtUsd(spot) : "—"}</span></div>
          <div style={S.metaRow}><span style={S.metaKey}>ATM IV</span><span style={S.metaVal}>{ivAvgPct != null ? fmtPct(ivAvgPct) : "—"}</span></div>
          <div style={S.metaRow}><span style={S.metaKey}>Put/Call OI</span><span style={S.metaVal}>{putCallOiRatio != null ? putCallOiRatio.toFixed(2) : "—"}</span></div>
        </div>
      </div>

      {/* Автоподбор */}
      <div style={S.autoBox}>
        <div style={S.autoLabel}>Автоподбор</div>
        <div style={S.autoTitle}>{STRATEGY_LABELS[autoPick.id]}</div>
        <div style={S.autoWhy}>{autoPick.why}</div>
        {override && override !== autoPick.id && (
          <div style={S.autoOverrideNote}>
            Сейчас отображается «{STRATEGY_LABELS[override]}» (override).{" "}
            <button style={S.linkBtn} onClick={() => setOverride(null)}>вернуть автоподбор</button>
          </div>
        )}
      </div>

      {/* Табы стратегий */}
      <div style={S.tabs}>
        {Object.entries(STRATEGY_LABELS).map(([id, label]) => {
          const active = id === currentStrategy;
          return (
            <button
              key={id}
              onClick={() => setOverride(id)}
              style={active ? S.tabActive : S.tab}
            >
              {label}
              {id === autoPick.id && <span style={S.tabPin}>авто</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar — сортировка */}
      <div style={S.toolbar}>
        <button
          style={sortMode === "score" ? S.sortBtnActive : S.sortBtn}
          onClick={() => setSortMode("score")}
        >
          По винрейт × доходность
        </button>
        <button
          style={sortMode === "premium" ? S.sortBtnActive : S.sortBtn}
          onClick={() => setSortMode("premium")}
        >
          По премии $
        </button>
        <div style={S.thresholdNote}>
          Дельта-зона 0.10–0.45 · ликвидность OI ≥ 50 · цена Mid(bid,ask)
        </div>
        <div style={S.thresholdNote}>
          {sorted.length} {sorted.length === 1 ? "вариант" : sorted.length < 5 ? "варианта" : "вариантов"}
        </div>
      </div>

      {/* Таблица страйков */}
      {sorted.length === 0 ? (
        <div style={S.emptyBox}>
          Нет ликвидных страйков в дельта-зоне 0.10–0.45 для выбранной стратегии.
          Возможные причины: тикер маловолатильный (премии копеечные за пределами ATM),
          выбрана очень дальняя/ближняя дата с тонкой ликвидностью, или
          выбран спред-вариант (Vertical / Iron Condor), где не хватает страйков
          для крыльев нужной ширины.
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Страйк(и)</th>
                <th style={S.thNum} title="Оценка вероятности по дельте short-ноги; не точный win rate">≈ Винрейт</th>
                <th style={S.thNum}>Премия</th>
                <th style={S.thNum}>Доходность годовых</th>
                <th style={S.thNum}>Breakeven</th>
                <th style={S.thNum}>Макс прибыль</th>
                <th style={S.thNum}>Макс убыток</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <RowAndDetail
                  key={c.key}
                  c={c}
                  expanded={expanded === c.key}
                  onToggle={() => setExpanded(expanded === c.key ? null : c.key)}
                  capital={capital}
                  spot={spot}
                  expiry={expiry}
                  ticker={ticker}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compliance */}
      <div style={S.compliance}>
        Винрейт — расчётная вероятность на основе дельты опциона, не гарантия
        результата. Аналитический инструмент, не инвестиционная рекомендация.
      </div>
    </div>
  );
}

// Строка таблицы + раскрывающаяся карточка (две trs).
function RowAndDetail({ c, expanded, onToggle, capital, spot, expiry, ticker }) {
  const winColor = c.winratePct >= 80 ? C.marketUp
                : c.winratePct >= 65 ? C.marketUp
                : c.winratePct >= 50 ? C.marketWarning
                : C.marketDown;
  const beStr = c.breakevenHigh != null
    ? `${fmtUsd(c.breakevenLow, 0)}–${fmtUsd(c.breakevenHigh, 0)}`
    : fmtUsd(c.breakevenLow);

  return (
    <>
      <tr
        style={expanded ? S.trActive : S.tr}
        onClick={onToggle}
      >
        <td style={S.tdLeft}>{c.label}</td>
        <td style={{ ...S.tdNum, color: winColor, fontWeight: 600 }}>≈ {fmtPct(c.winratePct)}</td>
        <td style={S.tdNum}>{fmtUsd(c.premium, 0)}</td>
        <td style={S.tdNum}>{fmtPct(c.annualizedPct)}</td>
        <td style={S.tdNum}>{beStr}</td>
        <td style={S.tdNum}>{fmtUsd(c.maxProfit, 0)}</td>
        <td style={S.tdNum}>{fmtUsd(c.maxLoss, 0)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={S.detailCell}>
            <DetailCard c={c} capital={capital} spot={spot} expiry={expiry} ticker={ticker} />
          </td>
        </tr>
      )}
    </>
  );
}

// Лейбл колонки «Макс убыток» подстраивается под характер риска:
// ownership — Covered Call (риск владения акцией, не убыток стратегии)
// obligation — CSP (обязательство купить)
// defined — Credit spreads / Iron Condor (ограничено конструкцией)
function riskLabel(kind) {
  switch (kind) {
    case "ownership":  return "Риск владения акцией (сниженный премией)";
    case "obligation": return "Макс риск (обязательство покупки)";
    case "defined":    return "Макс убыток (ограничен конструкцией)";
    default:           return "Макс убыток";
  }
}

function DetailCard({ c, capital, spot, expiry, ticker }) {
  const N = Math.max(0, Math.floor(capital / c.capitalAtRisk));
  const usedCapital = N * c.capitalAtRisk;
  const remaining   = Math.max(0, capital - usedCapital);
  const explain = buildExplanation(c, capital, spot, expiry, ticker || "акция");
  const enough = N > 0;

  return (
    <div style={S.detailWrap}>
      <div style={S.detailLeft}>
        <div style={S.bigWinLabel}>Вероятность (по δ short-ноги)</div>
        <div style={S.bigWinVal}>≈ {fmtPct(c.winratePct)}</div>
        <div style={S.bigWinSub}>Приближение через дельту, не точный win rate</div>

        {/* Расчёт позиции — для Covered Call показываем ОБА денежных потока
            (покупка акций + продажа коллов) явно. Для остальных — обычный
            блок «занято / остаётся». */}
        {c.kind === "covered_call" && enough ? (
          <CoveredCallCashFlow c={c} capital={capital} spot={spot} N={N} ticker={ticker} />
        ) : (
          <div style={enough ? S.contractsBlock : S.contractsBlockWarn}>
            {enough ? (
              <>
                <div style={S.contractsLine}>
                  <span style={S.contractsBig}>{N}</span>
                  <span style={S.contractsBigSub}>{contractWord(N)} под {fmtUsd(capital, 0)}</span>
                </div>
                <div style={S.contractsMeta}>
                  Занято <span style={S.contractsMetaNum}>{fmtUsd(usedCapital, 0)}</span> ·
                  {" "}Остаётся <span style={S.contractsMetaNum}>{fmtUsd(remaining, 0)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={S.contractsWarnTitle}>Капитала недостаточно</div>
                <div style={S.contractsWarnBody}>
                  На 1 контракт требуется <span style={S.contractsMetaNum}>{fmtUsd(c.capitalAtRisk, 0)}</span>,
                  у вас <span style={S.contractsMetaNum}>{fmtUsd(capital, 0)}</span>. Увеличьте капитал
                  минимум до <span style={S.contractsMetaNum}>{fmtUsd(c.capitalAtRisk, 0)}</span> или
                  выберите другой страйк / стратегию.
                </div>
              </>
            )}
          </div>
        )}

        <div style={S.detailMetricRow}>
          <div>
            <div style={S.detailMetricKey}>Премия / контракт</div>
            <div style={S.detailMetricVal}>{fmtUsd(c.premium, 0)}</div>
          </div>
          <div>
            <div style={S.detailMetricKey}>Залог / контракт</div>
            <div style={S.detailMetricVal}>{fmtUsd(c.capitalAtRisk, 0)}</div>
          </div>
        </div>
        <div style={S.detailMetricRow}>
          <div>
            <div style={S.detailMetricKey}>Доходность за сделку</div>
            <div style={S.detailMetricVal}>{fmtPct(c.yieldPct)}</div>
          </div>
          <div>
            <div style={S.detailMetricKey}>Годовых</div>
            <div style={S.detailMetricVal}>{fmtPct(c.annualizedPct)}</div>
          </div>
        </div>
        <div style={S.detailMetricRow}>
          <div>
            <div style={S.detailMetricKey}>Breakeven</div>
            <div style={S.detailMetricVal}>
              {c.breakevenHigh != null
                ? `${fmtUsd(c.breakevenLow, 0)} – ${fmtUsd(c.breakevenHigh, 0)}`
                : fmtUsd(c.breakevenLow)}
            </div>
          </div>
          <div>
            <div style={S.detailMetricKey}>{c.kind === "covered_call" ? "Потолок прибыли (выше K)" : "Защита / Зона прибыли"}</div>
            <div style={S.detailMetricVal}>
              {c.kind === "covered_call"
                ? `$${c.strikes[0]} (выше — дохода не будет)`
                : (c.breakevenHigh != null ? "в коридоре" : "до short-страйка")}
            </div>
          </div>
        </div>
        {enough && (
          <div style={S.detailMetricRow}>
            <div>
              <div style={S.detailMetricKey}>Макс прибыль на портфель</div>
              <div style={{ ...S.detailMetricVal, color: C.marketUp }}>{fmtUsd(N * c.maxProfit, 0)}</div>
            </div>
            <div>
              <div style={S.detailMetricKey}>{riskLabel(c.riskKind)}</div>
              <div style={{ ...S.detailMetricVal, color: C.marketDown }}>{fmtUsd(N * c.maxLoss, 0)}</div>
            </div>
          </div>
        )}
      </div>
      <div style={S.detailRight}>
        <div style={S.explainLabel}>Что делать</div>
        <div style={S.explainBody}>{explain}</div>
        <div style={S.legsBox}>
          <div style={S.legsLabel}>Ноги сделки</div>
          {c.legs.map((leg, i) => (
            <div key={i} style={S.legRow}>
              <span style={leg.action === "sell" ? S.legSell : S.legBuy}>
                {leg.action === "sell" ? "ПРОДАТЬ" : "КУПИТЬ"}
              </span>
              <span style={S.legType}>{leg.type.toUpperCase()}</span>
              <span style={S.legStrike}>{fmtUsd(leg.strike, 2)}</span>
              <span style={S.legPrice}>@ {fmtUsd(leg.price, 2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function contractWord(n) {
  if (n === 1) return "контракт";
  if (n >= 2 && n <= 4) return "контракта";
  return "контрактов";
}

// Специальный блок для Covered Call — два явных денежных потока:
// 1) покупка акций (расход), 2) продажа коллов (доход сразу).
// Остаток подаётся честно: «меньше цены 100 акций, коллом не покрывается».
function CoveredCallCashFlow({ c, capital, spot, N, ticker }) {
  // prem за акцию = premium per contract / 100.
  const premPerShare = c.premium / 100;
  const shares       = N * 100;
  const stockCost    = shares * spot;
  const premIncome   = N * c.premium;
  const remainder    = capital - stockCost;
  const t            = ticker || "акции";

  return (
    <div style={S.ccCash}>
      <div style={S.ccCashHeader}>
        <span style={S.ccCashHeadBig}>{N}</span>
        <span style={S.ccCashHeadSub}>
          {contractWord(N)} ({shares} {ctrShareWord(shares)} под {fmtUsd(capital, 0)})
        </span>
      </div>

      {/* Расход — покупка акций */}
      <div style={S.ccCashFlow}>
        <div style={S.ccCashFlowLabel}>Покупка акций (расход)</div>
        <div style={S.ccCashFlowRow}>
          <span style={S.ccCashFlowFormula}>
            {shares} × {fmtUsd(spot)}
          </span>
          <span style={S.ccCashFlowAmountOut}>
            −{fmtUsd(stockCost, 0)}
          </span>
        </div>
      </div>

      {/* Доход — премия от продажи коллов */}
      <div style={S.ccCashFlow}>
        <div style={S.ccCashFlowLabel}>Продажа коллов (доход сразу)</div>
        <div style={S.ccCashFlowRow}>
          <span style={S.ccCashFlowFormula}>
            {N} × {fmtUsd(c.premium, 0)}
          </span>
          <span style={S.ccCashFlowAmountIn}>
            +{fmtUsd(premIncome, 0)}
          </span>
        </div>
      </div>

      {/* Итог по входу */}
      <div style={S.ccCashSummary}>
        Итог входа: вложено <span style={S.ccCashSummaryNum}>{fmtUsd(stockCost, 0)}</span>
        {" "}в {t}, получено премии{" "}
        <span style={{ ...S.ccCashSummaryNum, color: C.marketUp }}>{fmtUsd(premIncome, 0)}</span>
      </div>

      {/* Остаток — честное объяснение */}
      <div style={S.ccCashRest}>
        Остаток <span style={S.ccCashRestNum}>{fmtUsd(remainder, 0)}</span>
        {" "}— меньше цены 100 акций (${fmtUsd(spot * 100, 0)}), коллом не покрывается.
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const S = {
  wrap: {
    background: C.bgAlt,
    border: `1px solid ${C.divider}`,
    borderRadius: 18,
    padding: "22px 24px 24px",
    marginTop: 16,
    fontFamily: FONT_SANS,
    color: C.textPrimary,
  },

  // Капитал
  capitalRow: {
    display: "flex",
    gap: 24,
    alignItems: "stretch",
    marginBottom: 18,
    flexWrap: "wrap",
  },
  capitalLabel: { color: C.textSecondary, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  capitalInput: {
    background: C.bgMain, color: C.textWhite,
    border: `1px solid ${C.divider}`, borderRadius: 8,
    padding: "10px 14px",
    fontSize: 22, fontWeight: 600,
    fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
    width: 200, outline: "none",
  },
  capitalMeta: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "6px 18px",
    background: C.bgMain, border: `1px solid ${C.divider}`,
    borderRadius: 8, padding: "10px 14px",
    flex: 1, minWidth: 280,
  },
  metaRow: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 },
  metaKey: { color: C.textSecondary },
  metaVal: { color: C.textPrimary, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },

  // Автоподбор
  autoBox: {
    background: C.bgMain, border: `1px solid ${C.divider}`,
    borderLeft: `3px solid ${C.emerald}`,
    borderRadius: 10, padding: "14px 18px", marginBottom: 14,
  },
  autoLabel: { color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2 },
  autoTitle: { color: C.textWhite, fontSize: 16, fontWeight: 600, marginTop: 4 },
  autoWhy:   { color: C.textPrimary, fontSize: 12, lineHeight: 1.55, marginTop: 6 },
  autoOverrideNote: { color: C.textSecondary, fontSize: 11, marginTop: 8 },
  linkBtn: {
    background: "transparent", border: "none", color: C.marketInfo,
    cursor: "pointer", padding: 0, fontSize: 11, textDecoration: "underline",
    fontFamily: FONT_SANS,
  },

  // Табы
  tabs: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 },
  tab: {
    padding: "8px 14px", background: "transparent",
    color: C.textSecondary, border: `1px solid ${C.divider}`,
    borderRadius: 6, fontSize: 12, fontWeight: 500,
    cursor: "pointer", fontFamily: FONT_SANS,
    display: "inline-flex", alignItems: "center", gap: 6,
  },
  tabActive: {
    padding: "8px 14px", background: C.emerald,
    color: C.textWhite, border: `1px solid ${C.emerald}`,
    borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: FONT_SANS,
    display: "inline-flex", alignItems: "center", gap: 6,
  },
  tabPin: {
    fontSize: 9, padding: "1px 6px",
    background: "rgba(255,255,255,0.12)",
    borderRadius: 3, letterSpacing: 0.8, textTransform: "uppercase",
  },

  // Toolbar
  toolbar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  sortBtn: {
    padding: "7px 12px", background: "transparent",
    color: C.textSecondary, border: `1px solid ${C.divider}`,
    borderRadius: 6, fontSize: 11, fontWeight: 500,
    cursor: "pointer", fontFamily: FONT_SANS,
  },
  sortBtnActive: {
    padding: "7px 12px", background: C.bgMain,
    color: C.textWhite, border: `1px solid ${C.petrol}`,
    borderRadius: 6, fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: FONT_SANS,
  },
  thresholdNote: { color: C.textSecondary, fontSize: 11, marginLeft: "auto", fontFamily: FONT_SANS },

  // Таблица
  emptyBox: { padding: "20px 24px", color: C.textSecondary, fontSize: 13, background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 10, lineHeight: 1.5 },
  tableWrap: { background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 10, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  thLeft: { textAlign: "left", padding: "10px 14px", color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.divider}`, fontFamily: FONT_SANS },
  thNum:  { textAlign: "right", padding: "10px 14px", color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.divider}`, fontFamily: FONT_SANS },
  tr: { cursor: "pointer", borderBottom: `1px solid ${C.divider}` },
  trActive: { cursor: "pointer", background: C.bgAlt, borderBottom: `1px solid ${C.divider}` },
  tdLeft: { padding: "11px 14px", color: C.textWhite, fontFamily: FONT_MONO, fontSize: 12, fontVariantNumeric: "tabular-nums" },
  tdNum:  { padding: "11px 14px", textAlign: "right", color: C.textPrimary, fontFamily: FONT_MONO, fontSize: 12, fontVariantNumeric: "tabular-nums" },

  // Детальная карточка
  detailCell: { background: C.bgAlt, padding: 0, borderBottom: `1px solid ${C.divider}` },
  detailWrap: { display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 2fr", gap: 18, padding: "20px 22px" },
  detailLeft: { background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "18px 20px" },
  detailRight:{ background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "18px 20px" },
  bigWinLabel:{ color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2 },
  bigWinVal:  { color: C.textWhite, fontSize: 36, fontWeight: 600, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5, marginTop: 4 },
  bigWinSub:  { color: C.textMute, fontSize: 10, fontFamily: FONT_SANS, fontStyle: "italic", marginBottom: 14 },

  // Расчёт контрактов — отдельный блок с явным «занято / остаётся».
  contractsBlock: {
    background: C.bgAlt, border: `1px solid ${C.divider}`,
    borderLeft: `3px solid ${C.emerald}`,
    borderRadius: 8, padding: "10px 14px",
    marginBottom: 14,
  },
  contractsBlockWarn: {
    background: C.bgAlt, border: `1px solid ${C.divider}`,
    borderLeft: `3px solid ${C.marketWarning}`,
    borderRadius: 8, padding: "10px 14px",
    marginBottom: 14,
  },
  contractsLine: { display: "flex", alignItems: "baseline", gap: 8 },
  contractsBig:  { color: C.textWhite, fontSize: 24, fontWeight: 600, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  contractsBigSub:{ color: C.textSecondary, fontSize: 11 },
  contractsMeta: { color: C.textSecondary, fontSize: 11, marginTop: 4, fontFamily: FONT_SANS },
  contractsMetaNum: { color: C.textPrimary, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  contractsWarnTitle: { color: C.marketWarning, fontSize: 12, fontWeight: 600, marginBottom: 4 },
  contractsWarnBody:  { color: C.textSecondary, fontSize: 11, lineHeight: 1.5 },

  // Covered Call — спец-блок с двумя денежными потоками.
  ccCash: {
    background: C.bgAlt, border: `1px solid ${C.divider}`,
    borderLeft: `3px solid ${C.petrol}`,
    borderRadius: 8, padding: "12px 14px",
    marginBottom: 14,
  },
  ccCashHeader: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 },
  ccCashHeadBig: { color: C.textWhite, fontSize: 24, fontWeight: 600, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  ccCashHeadSub: { color: C.textSecondary, fontSize: 11 },

  ccCashFlow:        { borderTop: `1px solid ${C.divider}`, paddingTop: 8, paddingBottom: 6 },
  ccCashFlowLabel:   { color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  ccCashFlowRow:     { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  ccCashFlowFormula: { color: C.textPrimary, fontSize: 13, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  ccCashFlowAmountOut: { color: C.marketDown, fontSize: 16, fontWeight: 600, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  ccCashFlowAmountIn:  { color: C.marketUp,   fontSize: 16, fontWeight: 600, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },

  ccCashSummary:    { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.divider}`, color: C.textPrimary, fontSize: 12, lineHeight: 1.55 },
  ccCashSummaryNum: { color: C.textWhite, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontWeight: 600 },

  ccCashRest:    { marginTop: 8, color: C.textSecondary, fontSize: 11, lineHeight: 1.5, fontStyle: "italic" },
  ccCashRestNum: { color: C.textPrimary, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontStyle: "normal" },
  detailMetricRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 },
  detailMetricKey: { color: C.textSecondary, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  detailMetricVal: { color: C.textWhite, fontSize: 16, fontWeight: 600, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  explainLabel: { color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2 },
  explainBody: { color: C.textPrimary, fontSize: 13, lineHeight: 1.6, marginTop: 6, marginBottom: 16 },
  legsBox: { borderTop: `1px solid ${C.divider}`, paddingTop: 12 },
  legsLabel: { color: C.textSecondary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 },
  legRow: { display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 12, fontFamily: FONT_MONO },
  legSell: { color: C.marketDown, fontWeight: 600, fontSize: 10, letterSpacing: 0.6 },
  legBuy:  { color: C.marketInfo, fontWeight: 600, fontSize: 10, letterSpacing: 0.6 },
  legType: { color: C.textSecondary },
  legStrike: { color: C.textWhite, fontVariantNumeric: "tabular-nums" },
  legPrice:  { color: C.textPrimary, fontVariantNumeric: "tabular-nums" },

  // Compliance
  compliance: {
    marginTop: 18, padding: "12px 16px",
    background: C.bgMain, border: `1px solid ${C.divider}`,
    borderRadius: 8,
    color: C.textSecondary, fontSize: 11, lineHeight: 1.5,
    fontFamily: FONT_SANS, fontStyle: "italic",
  },
};
