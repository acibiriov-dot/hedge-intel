"use client";
import { useEffect, useMemo, useState } from "react";

// Same access gate as other private pages.
const KEY_ACCESS = "hi_access";
const PASSWORD   = "okiinvest2026";

// ---------------------------------------------------------------------------
// Strategy catalog — 13 strategies × 3 levels.
//
// Field shape:
//   direction : array of "bullish" | "bearish" | "neutral"
//   style     : "income" | "growth" | "hedge"
//   level     : "simple" | "medium" | "complex"
//   ivEnv     : "high" | "low" | "any"  (for the IV-environment filter)
//   winrate   : [min, max]               (percent, inclusive)
//   legs      : 1-4
//   summary   : one-sentence plain-language description
//   bestEnv   : when the strategy works best
//   calcLink  : where the "OPEN CALCULATOR" button takes the user
// ---------------------------------------------------------------------------

const STRATEGIES = [
  // ----- SIMPLE -----
  {
    id: "covered_call", num: 1, name: "Covered Call",
    direction: ["bullish", "neutral"], style: "income", level: "simple", ivEnv: "high",
    winrate: [75, 85], legs: 1,
    summary: "Держишь акцию + продаёшь колл выше рынка.",
    bestEnv: "Высокая IV, боковой тренд или умеренный рост.",
    calcLink: "/covered-call",
  },
  {
    id: "cash_secured_put", num: 2, name: "Cash-Secured Put",
    direction: ["bullish", "neutral"], style: "income", level: "simple", ivEnv: "high",
    winrate: [70, 80], legs: 1,
    summary: "Продаёшь пут + держишь кэш на покупку акции по страйку.",
    bestEnv: "Высокая IV, хочешь купить акцию дешевле текущей цены.",
    calcLink: "/smart-strategy",
  },
  {
    id: "long_call", num: 3, name: "Long Call",
    direction: ["bullish"], style: "growth", level: "simple", ivEnv: "low",
    winrate: [35, 45], legs: 1,
    summary: "Покупаешь колл — право купить акцию по фиксированной цене.",
    bestEnv: "Низкая IV, ожидаешь сильный рост базиса.",
    calcLink: "/smart-strategy",
  },
  {
    id: "long_put", num: 4, name: "Long Put",
    direction: ["bearish"], style: "hedge", level: "simple", ivEnv: "low",
    winrate: [35, 45], legs: 1,
    summary: "Покупаешь пут — право продать акцию по фиксированной цене.",
    bestEnv: "Низкая IV, ожидаешь падение базиса.",
    calcLink: "/smart-strategy",
  },
  {
    id: "protective_put", num: 5, name: "Protective Put",
    direction: ["bullish"], style: "hedge", level: "simple", ivEnv: "any",
    winrate: [60, 70], legs: 2,
    summary: "Держишь акцию + покупаешь пут как страховку от падения.",
    bestEnv: "Любая IV — это страховка позиции, не направленная ставка.",
    calcLink: "/smart-strategy",
  },

  // ----- MEDIUM -----
  {
    id: "bull_call_spread", num: 6, name: "Bull Call Spread",
    direction: ["bullish"], style: "growth", level: "medium", ivEnv: "any",
    winrate: [45, 55], legs: 2,
    summary: "Покупаешь колл + продаёшь колл выше — ограниченная прибыль, ограниченный риск.",
    bestEnv: "Умеренный рост, ограниченный бюджет на премию.",
    calcLink: "/smart-strategy",
  },
  {
    id: "bear_put_spread", num: 7, name: "Bear Put Spread",
    direction: ["bearish"], style: "hedge", level: "medium", ivEnv: "any",
    winrate: [45, 55], legs: 2,
    summary: "Покупаешь пут + продаёшь пут ниже — ставка на умеренное падение.",
    bestEnv: "Умеренное падение базиса, ограниченный бюджет.",
    calcLink: "/smart-strategy",
  },
  {
    id: "short_strangle", num: 8, name: "Short Strangle",
    direction: ["neutral"], style: "income", level: "medium", ivEnv: "high",
    winrate: [70, 80], legs: 2,
    summary: "Продаёшь OTM колл + OTM пут — прибыль если акция в коридоре.",
    bestEnv: "Высокая IV, ожидаешь боковой рынок до экспирации.",
    calcLink: "/smart-strategy",
  },
  {
    id: "short_straddle", num: 9, name: "Short Straddle",
    direction: ["neutral"], style: "income", level: "medium", ivEnv: "high",
    winrate: [65, 75], legs: 2,
    summary: "Продаёшь ATM колл + ATM пут — максимум премии за счёт максимума риска.",
    bestEnv: "Очень высокая IV, обычно перед известным событием с переоценённой неопределённостью.",
    calcLink: "/smart-strategy",
  },
  {
    id: "calendar_spread", num: 10, name: "Calendar Spread",
    direction: ["neutral"], style: "income", level: "medium", ivEnv: "low",
    winrate: [55, 65], legs: 2,
    summary: "Продаёшь ближнюю экспирацию + покупаешь ту же страйк-цену на дальней.",
    bestEnv: "Низкая front-IV и высокая back-IV — играешь на term structure.",
    calcLink: "/smart-strategy",
  },

  // ----- COMPLEX -----
  {
    id: "iron_condor", num: 11, name: "Iron Condor",
    direction: ["neutral"], style: "income", level: "complex", ivEnv: "high",
    winrate: [65, 75], legs: 4,
    summary: "Bull Put Spread + Bear Call Spread — прибыль в широком коридоре с ограниченным риском.",
    bestEnv: "Высокая IV, уверенный боковик до экспирации.",
    calcLink: "/smart-strategy",
  },
  {
    id: "iron_butterfly", num: 12, name: "Iron Butterfly",
    direction: ["neutral"], style: "income", level: "complex", ivEnv: "high",
    winrate: [60, 70], legs: 4,
    summary: "Продаёшь ATM straddle + покупаешь дальние крылья — максимум премии в точке.",
    bestEnv: "Очень высокая IV, точный прогноз закрытия около ATM.",
    calcLink: "/smart-strategy",
  },
  {
    id: "jade_lizard", num: 13, name: "Jade Lizard",
    direction: ["bullish", "neutral"], style: "income", level: "complex", ivEnv: "high",
    winrate: [70, 80], legs: 3,
    summary: "Продаёшь пут + продаёшь call-spread — премия покрывает риск вверх, открыт риск вниз.",
    bestEnv: "Высокая IV, умеренно бычий взгляд с готовностью купить базис.",
    calcLink: "/smart-strategy",
  },

  // ----- Added so that Market Regime "Best" lists can map to actual cards -----
  {
    id: "bull_put_spread", num: 14, name: "Bull Put Spread",
    direction: ["bullish"], style: "income", level: "medium", ivEnv: "high",
    winrate: [60, 70], legs: 2,
    summary: "Продаёшь пут + покупаешь пут ниже — премия с ограниченным риском.",
    bestEnv: "Высокая IV, умеренно бычий взгляд, нужен ограниченный max loss.",
    calcLink: "/smart-strategy",
  },
  {
    id: "long_straddle", num: 15, name: "Long Straddle",
    direction: ["neutral"], style: "growth", level: "medium", ivEnv: "low",
    winrate: [35, 45], legs: 2,
    summary: "Покупаешь ATM колл + ATM пут — прибыль от сильного движения в любую сторону.",
    bestEnv: "Низкая IV перед событием (earnings, FDA), ожидаешь резкое движение без понимания направления.",
    calcLink: "/smart-strategy",
  },
];

// ---------------------------------------------------------------------------
// Filter definitions (display labels + match predicates)
// ---------------------------------------------------------------------------

const FILTER_DIRECTION = [
  { v: "all",     label: "Все" },
  { v: "bullish", label: "Bullish" },
  { v: "bearish", label: "Bearish" },
  { v: "neutral", label: "Neutral" },
];
const FILTER_STYLE = [
  { v: "all",    label: "Все" },
  { v: "income", label: "Income" },
  { v: "growth", label: "Growth" },
  { v: "hedge",  label: "Hedge" },
];
const FILTER_LEVEL = [
  { v: "all",     label: "Все" },
  { v: "simple",  label: "Simple" },
  { v: "medium",  label: "Medium" },
  { v: "complex", label: "Complex" },
];
const FILTER_IV = [
  { v: "all",  label: "Все" },
  { v: "high", label: "Высокая IV" },
  { v: "low",  label: "Низкая IV" },
];

const LEVEL_GROUPS = [
  { v: "simple",  label: "01 · Simple (1-2 ноги)" },
  { v: "medium",  label: "02 · Medium (2-4 ноги)" },
  { v: "complex", label: "03 · Complex (4 ноги)" },
];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MARKET REGIME ENGINE
// ---------------------------------------------------------------------------
// SPY is the regime gauge — its PCR + chain-mean IV map to one of 6 regimes.
// The "Best" list per regime references strategy NAMES so Edge Score can
// detect membership without an extra mapping table.

const REGIMES = {
  risk_on: {
    id: "risk_on", label: "RISK-ON MOMENTUM", icon: "●", color: "#10b981",
    rule: "PCR bullish + IV normal/low",
    best: ["Covered Call", "Bull Call Spread", "Cash-Secured Put"],
  },
  cautious_bull: {
    id: "cautious_bull", label: "CAUTIOUS BULLISH", icon: "●", color: "#f59e0b",
    rule: "PCR bullish + IV high",
    best: ["Cash-Secured Put", "Jade Lizard", "Bull Put Spread"],
  },
  neutral_range: {
    id: "neutral_range", label: "NEUTRAL RANGE", icon: "○", color: "#7a8b83",
    rule: "PCR neutral + IV high",
    best: ["Iron Condor", "Short Strangle", "Iron Butterfly"],
  },
  defensive: {
    id: "defensive", label: "DEFENSIVE", icon: "●", color: "#ef4444",
    rule: "PCR bearish + IV normal",
    best: ["Bear Put Spread", "Long Put", "Protective Put"],
  },
  high_fear: {
    id: "high_fear", label: "HIGH FEAR", icon: "●", color: "#ef4444",
    rule: "PCR bearish + IV high",
    best: ["Long Put", "Bear Put Spread", "Calendar Spread"],
  },
  volatility_compression: {
    id: "volatility_compression", label: "VOLATILITY COMPRESSION", icon: "◇", color: "#3b82f6",
    rule: "PCR neutral + IV low",
    best: ["Long Call", "Long Straddle", "Calendar Spread"],
  },
};

function deriveRegime(pcr, ivPct) {
  if (pcr == null || !Number.isFinite(ivPct)) return null;
  const bullish = pcr < 0.7;
  const bearish = pcr > 1.3;
  const neutral = !bullish && !bearish;
  const high = ivPct > 50;
  const low  = ivPct < 25;
  const normal = !high && !low;

  if (bullish && (normal || low)) return REGIMES.risk_on;
  if (bullish && high)            return REGIMES.cautious_bull;
  if (neutral && high)            return REGIMES.neutral_range;
  if (bearish && normal)          return REGIMES.defensive;
  if (bearish && high)            return REGIMES.high_fear;
  if (neutral && low)             return REGIMES.volatility_compression;
  // Fallbacks for combos not in the spec:
  if (bearish && low)             return REGIMES.defensive;
  if (neutral && normal)          return REGIMES.neutral_range;
  return null;
}

// ---------------------------------------------------------------------------
// SPY data helpers (re-used minimal versions from /options + /smart-strategy)
// ---------------------------------------------------------------------------

function num(v) {
  if (v == null || v === "") return Number.NaN;
  const n = parseFloat(String(v).replace("%", "").replace(",", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

function isCall(r) { return (r.Type || "").toLowerCase() === "call"; }
function isPut(r)  { return (r.Type || "").toLowerCase() === "put"; }

function computePCR(rows) {
  let callVol = 0, putVol = 0;
  for (const r of rows) {
    const v = num(r.Volume);
    if (!Number.isFinite(v)) continue;
    if (isCall(r)) callVol += v;
    else if (isPut(r)) putVol += v;
  }
  return callVol > 0 ? putVol / callVol : null;
}

function meanIV(rows) {
  const ivs = rows.map((r) => num(r.IV)).filter((v) => Number.isFinite(v) && v > 0);
  if (!ivs.length) return null;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

function meanOI(rows) {
  const ois = rows.map((r) => num(r["Open Int."])).filter((v) => Number.isFinite(v) && v > 0);
  if (!ois.length) return null;
  return ois.reduce((a, b) => a + b, 0) / ois.length;
}

function pcrDirection(pcr) {
  if (pcr == null) return null;
  if (pcr < 0.7)   return "bullish";
  if (pcr > 1.3)   return "bearish";
  return "neutral";
}

function ivLevel(ivPct) {
  if (!Number.isFinite(ivPct)) return null;
  if (ivPct > 50) return "high";
  if (ivPct < 25) return "low";
  return "normal";
}

// ---------------------------------------------------------------------------
// EDGE SCORE — strategy-vs-regime fit, 0-100
// ---------------------------------------------------------------------------
//   base = 75 if strategy in regime.best, else 35
//   +15 if strategy.ivEnv matches market IV (or strategy is "any")
//   +10 if strategy.direction includes PCR-derived market direction
//   +10 if underlying liquid (meanOI > 500)

function computeEdgeScore(strategy, ctx) {
  if (!ctx || !ctx.regime) return null;
  const inBest = ctx.regime.best.includes(strategy.name);
  let score = inBest ? 75 : 35;

  const mIV = ivLevel(ctx.iv);
  const ivMatch = strategy.ivEnv === "any" || strategy.ivEnv === mIV ||
                  (strategy.ivEnv === "high" && mIV === "high") ||
                  (strategy.ivEnv === "low"  && mIV === "low");
  if (ivMatch) score += 15;

  const mDir = pcrDirection(ctx.pcr);
  if (mDir && strategy.direction.includes(mDir)) score += 10;

  if (ctx.oi != null && ctx.oi > 500) score += 10;

  return Math.min(100, score);
}

function edgeColor(score) {
  if (score == null) return "#7a8b83";
  if (score > 75) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Card winrate color
// ---------------------------------------------------------------------------

function winrateColor([lo, hi]) {
  const avg = (lo + hi) / 2;
  if (avg > 70) return "#10b981"; // emerald
  if (avg >= 55) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

function directionTag(d) {
  if (d === "bullish") return { label: "BULLISH", color: "#10b981" };
  if (d === "bearish") return { label: "BEARISH", color: "#ef4444" };
  return { label: "NEUTRAL", color: "#7a8b83" };
}

function styleTag(s) {
  if (s === "income") return { label: "INCOME", color: "#10b981" };
  if (s === "growth") return { label: "GROWTH", color: "#f59e0b" };
  return { label: "HEDGE", color: "#7a8b83" }; // hedge
}

function levelTag(l) {
  if (l === "simple")  return { label: "SIMPLE",  color: "#7a8b83" };
  if (l === "medium")  return { label: "MEDIUM",  color: "#f59e0b" };
  return { label: "COMPLEX", color: "#ef4444" };
}

// ===========================================================================

export default function StrategyLibrary() {
  // ----- access gate -----
  const [hasAccess, setHasAccess]         = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ----- SPY market data (drives regime + edge score) -----
  const [spyData, setSpyData] = useState(null);  // {pcr, iv, oi, regime, currentPrice}
  const [spyError, setSpyError] = useState(null);
  const [spyLoading, setSpyLoading] = useState(false);

  // ----- FMP earnings calendar (next 7 days for watchlist) -----
  const [earnings, setEarnings] = useState(null);  // {items: [...]} or null
  const [earningsError, setEarningsError] = useState(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsIVs, setEarningsIVs] = useState({}); // {ticker: meanIV}

  useEffect(() => {
    try { setHasAccess(localStorage.getItem(KEY_ACCESS) === "1"); } catch {}
  }, []);

  // Fetch SPY chain → regime (only after login, on mount).
  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    async function loadSpy() {
      setSpyLoading(true); setSpyError(null);
      try {
        const r = await fetch("/api/finviz-options", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: "SPY" }),
        });
        const data = await r.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const rows = data.rows || [];
        const pcr = computePCR(rows);
        const iv  = meanIV(rows);
        const oi  = meanOI(rows);
        const regime = deriveRegime(pcr, iv);
        setSpyData({ pcr, iv, oi, regime, rowCount: rows.length });
      } catch (e) {
        if (!cancelled) setSpyError(e.message || "network");
      } finally {
        if (!cancelled) setSpyLoading(false);
      }
    }
    loadSpy();
    return () => { cancelled = true; };
  }, [hasAccess]);

  // Fetch FMP earnings calendar (next 7 days, watchlist tickers only).
  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    async function loadEarnings() {
      setEarningsLoading(true); setEarningsError(null);
      try {
        const r = await fetch("/api/fmp-earnings", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error || "FMP earnings failed");
        setEarnings({ items: data.items || [] });
      } catch (e) {
        if (!cancelled) setEarningsError(e.message || "network");
      } finally {
        if (!cancelled) setEarningsLoading(false);
      }
    }
    loadEarnings();
    return () => { cancelled = true; };
  }, [hasAccess]);

  // For each earnings ticker — fetch its chain in parallel (max 8) to display
  // current IV. Best-effort; tickers without chain data just show "—".
  useEffect(() => {
    if (!earnings || !earnings.items.length) return;
    let cancelled = false;
    const tickers = [...new Set(earnings.items.map((e) => e.symbol))].slice(0, 8);
    Promise.all(tickers.map(async (t) => {
      try {
        const r = await fetch("/api/finviz-options", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: t }),
        });
        const data = await r.json();
        const iv = meanIV(data.rows || []);
        return [t, iv];
      } catch {
        return [t, null];
      }
    })).then((pairs) => {
      if (cancelled) return;
      const map = {};
      for (const [t, iv] of pairs) map[t] = iv;
      setEarningsIVs(map);
    });
    return () => { cancelled = true; };
  }, [earnings]);

  // Edge Score context derived from SPY data.
  const edgeCtx = useMemo(() => {
    if (!spyData || !spyData.regime) return null;
    return { regime: spyData.regime, pcr: spyData.pcr, iv: spyData.iv, oi: spyData.oi };
  }, [spyData]);

  function tryLogin() {
    if (passwordInput === PASSWORD) {
      try { localStorage.setItem(KEY_ACCESS, "1"); } catch {}
      setHasAccess(true); setPasswordError(""); setPasswordInput("");
    } else { setPasswordError("Неверный пароль"); }
  }
  function logout() {
    try { localStorage.removeItem(KEY_ACCESS); } catch {}
    setHasAccess(false); setPasswordInput("");
  }

  // ----- filter state -----
  const [fDir,   setFDir]   = useState("all");
  const [fStyle, setFStyle] = useState("all");
  const [fLevel, setFLevel] = useState("all");
  const [fIv,    setFIv]    = useState("all");

  const filtered = useMemo(() => {
    return STRATEGIES.filter((s) => {
      if (fDir   !== "all" && !s.direction.includes(fDir)) return false;
      if (fStyle !== "all" && s.style !== fStyle)          return false;
      if (fLevel !== "all" && s.level !== fLevel)          return false;
      if (fIv    !== "all" && s.ivEnv !== fIv)             return false;
      return true;
    });
  }, [fDir, fStyle, fLevel, fIv]);

  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>STRATEGY LIBRARY</h1>
          <p style={S.subtitle}>Authentication required.</p>
          <input
            style={{ ...S.inp, marginTop: 12, width: "100%" }}
            type="password" value={passwordInput} placeholder="passphrase" autoFocus
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") tryLogin(); }}
          />
          {passwordError && <div style={S.errorInline}>{passwordError}</div>}
          <button style={{ ...S.btnEmerald, marginTop: 12 }} onClick={tryLogin}>ENTER</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.topBar}>
        <a href="/briefing"       style={S.navLink}>Briefing</a>
        <a href="/dashboard"      style={S.navLink}>Dashboard</a>
        <a href="/covered-call"   style={S.navLink}>Decision Engine</a>
        <a href="/smart-strategy" style={S.navLink}>Smart Strategy</a>
        <a href="/options"        style={S.navLink}>Options Desk</a>
        <button style={S.navLink} onClick={logout}>Logout</button>
      </div>

      <div style={S.heading}>
        <div style={S.brand}>STRATEGY LIBRARY</div>
        <div style={S.brandSub}>15 options strategies · simple → complex · live edge vs SPY regime</div>
      </div>

      {/* ===== MARKET REGIME ENGINE ===== */}
      <RegimePanel spyData={spyData} loading={spyLoading} error={spyError} />

      {/* ===== EARNINGS THIS WEEK ===== */}
      <EarningsSection
        earnings={earnings}
        ivMap={earningsIVs}
        loading={earningsLoading}
        error={earningsError}
      />

      {/* ===== Filter bar ===== */}
      <div style={S.filterBar}>
        <FilterGroup label="Direction" value={fDir}   set={setFDir}   options={FILTER_DIRECTION} />
        <FilterGroup label="Style"     value={fStyle} set={setFStyle} options={FILTER_STYLE} />
        <FilterGroup label="Level"     value={fLevel} set={setFLevel} options={FILTER_LEVEL} />
        <FilterGroup label="IV env"    value={fIv}    set={setFIv}    options={FILTER_IV} />
        <div style={S.filterCount}>
          {filtered.length}/{STRATEGIES.length} STRATEGIES
        </div>
      </div>

      {/* ===== Groups by level ===== */}
      {LEVEL_GROUPS.map((g) => {
        const items = filtered.filter((s) => s.level === g.v);
        if (!items.length) return null;
        return (
          <section key={g.v} style={{ marginTop: 28 }}>
            <div style={S.sectionTitle}>
              <span style={S.sectionName}>{g.label}</span>
              <span style={S.sectionHint}>{items.length} {items.length === 1 ? "strategy" : "strategies"}</span>
            </div>
            <div style={S.grid}>
              {items.map((s) => <StrategyCard key={s.id} s={s} edgeCtx={edgeCtx} />)}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div style={S.empty}>
          Под текущие фильтры ничего не подходит. Сбрось фильтры.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function FilterGroup({ label, value, set, options }) {
  return (
    <div style={S.filterGroup}>
      <div style={S.filterLabel}>{label}</div>
      <div style={S.filterPills}>
        {options.map((o) => {
          const active = o.v === value;
          return (
            <button
              key={o.v}
              onClick={() => set(o.v)}
              style={active ? S.filterPillActive : S.filterPill}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StrategyCard({ s, edgeCtx }) {
  const wColor = winrateColor(s.winrate);
  const dirs = s.direction.map(directionTag);
  const styl = styleTag(s.style);
  const lvl  = levelTag(s.level);
  const edge = computeEdgeScore(s, edgeCtx);
  const eColor = edgeColor(edge);
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={S.cardNum}>{String(s.num).padStart(2, "0")}</div>
        <div style={S.cardName}>{s.name}</div>
        <div style={S.cardHeadRight}>
          <div style={{ ...S.winrate, color: wColor, borderColor: wColor }}>
            ● {s.winrate[0]}-{s.winrate[1]}%
          </div>
          {edge != null && (
            <div style={S.edgeBox}>
              <div style={{ ...S.edgeNum, color: eColor }}>{edge}</div>
              <div style={S.edgeLabel}>EDGE</div>
            </div>
          )}
        </div>
      </div>

      <div style={S.tagRow}>
        {dirs.map((d, i) => (
          <span key={i} style={{ ...S.tag, color: d.color, borderColor: d.color }}>{d.label}</span>
        ))}
        <span style={{ ...S.tag, color: styl.color, borderColor: styl.color }}>{styl.label}</span>
        <span style={{ ...S.tag, color: lvl.color, borderColor: lvl.color }}>{lvl.label}</span>
        <span style={S.tagMuted}>{s.legs} {s.legs === 1 ? "LEG" : "LEGS"}</span>
      </div>

      <div style={S.summary}>{s.summary}</div>

      <div style={S.envBox}>
        <div style={S.envKey}>BEST ENVIRONMENT</div>
        <div style={S.envText}>{s.bestEnv}</div>
      </div>

      <a href={s.calcLink} style={S.cardBtn}>OPEN CALCULATOR →</a>
    </div>
  );
}

// ----- MARKET REGIME panel -----

function RegimePanel({ spyData, loading, error }) {
  if (loading) {
    return <div style={S.regimeWrapMuted}>Loading SPY regime…</div>;
  }
  if (error) {
    return (
      <div style={{ ...S.regimeWrapMuted, color: "#ef4444" }}>
        Regime fetch failed: {error}
      </div>
    );
  }
  if (!spyData || !spyData.regime) {
    return <div style={S.regimeWrapMuted}>Regime unavailable — insufficient SPY data.</div>;
  }
  const r = spyData.regime;
  return (
    <div style={{ ...S.regimeWrap, borderColor: r.color }}>
      <div style={S.regimeLeft}>
        <div style={S.regimeLabel}>MARKET REGIME · SPY</div>
        <div style={{ ...S.regimeName, color: r.color }}>
          {r.icon} {r.label}
        </div>
        <div style={S.regimeRule}>{r.rule}</div>
        <div style={S.regimeStats}>
          PCR <b style={{ color: "#e6e6e6" }}>{spyData.pcr?.toFixed(2) || "—"}</b>
          {"  ·  "}
          mean IV <b style={{ color: "#e6e6e6" }}>{spyData.iv?.toFixed(1) || "—"}%</b>
          {"  ·  "}
          chain <b style={{ color: "#e6e6e6" }}>{spyData.rowCount}</b> contracts
        </div>
      </div>
      <div style={S.regimeRight}>
        <div style={S.regimeLabel}>BEST STRATEGIES NOW</div>
        <div style={S.regimeBest}>
          {r.best.map((name) => (
            <span key={name} style={{ ...S.regimeBestTag, color: r.color, borderColor: r.color }}>
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----- EARNINGS THIS WEEK -----

function fmtEarningsDate(s) {
  // FMP returns "YYYY-MM-DD". Show as "DD.MM".
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}.${m[2]}`;
}

function daysFromNowTo(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const today = new Date();
  const tDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - tDay) / 86400000);
}

function bmoAmcLabel(time) {
  const t = (time || "").toLowerCase();
  if (t === "bmo") return "BMO";
  if (t === "amc") return "AMC";
  return "—";
}

function recommendEarningsStrategy(dte) {
  if (dte == null) return { name: "—", reason: "" };
  if (dte < 0)        return { name: "Covered Call", reason: "Earnings прошли — IV рухнула, продаём дешёвую защиту." };
  if (dte <= 2)       return { name: "Long Straddle", reason: "1-2 дня до отчёта — ставка на сюрприз в любую сторону." };
  if (dte <= 7)       return { name: "Iron Condor / Short Strangle", reason: "5-7 дней — продаём высокую IV до её краша." };
  return { name: "Wait", reason: "Слишком рано для earnings-плея, IV ещё не накачана." };
}

function EarningsSection({ earnings, ivMap, loading, error }) {
  if (loading) {
    return (
      <section style={{ marginTop: 20 }}>
        <div style={S.sectionTitle}>
          <span style={S.sectionName}>EARNINGS THIS WEEK</span>
          <span style={S.sectionHint}>loading…</span>
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section style={{ marginTop: 20 }}>
        <div style={S.sectionTitle}>
          <span style={S.sectionName}>EARNINGS THIS WEEK</span>
        </div>
        <div style={S.earningsError}>
          {error.includes("FMP_API_KEY") ? (
            <>
              <b>FMP_API_KEY не задан на Vercel.</b> Получи бесплатный ключ на
              <a href="https://site.financialmodelingprep.com/developer/docs" target="_blank" rel="noopener noreferrer" style={{ color: "#10b981" }}>{" "}financialmodelingprep.com{" "}</a>
              (free tier: 250 calls/day) и добавь как FMP_API_KEY в Project Settings → Environment Variables.
            </>
          ) : (
            <>Earnings fetch failed: {error}</>
          )}
        </div>
      </section>
    );
  }
  if (!earnings || !earnings.items.length) {
    return (
      <section style={{ marginTop: 20 }}>
        <div style={S.sectionTitle}>
          <span style={S.sectionName}>EARNINGS THIS WEEK</span>
          <span style={S.sectionHint}>watchlist · next 7 days</span>
        </div>
        <div style={S.earningsEmpty}>Нет отчётов из watchlist в ближайшие 7 дней.</div>
      </section>
    );
  }
  // Sort by date asc, then by symbol.
  const items = [...earnings.items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.symbol < b.symbol ? -1 : 1;
  });
  return (
    <section style={{ marginTop: 20 }}>
      <div style={S.sectionTitle}>
        <span style={S.sectionName}>EARNINGS THIS WEEK</span>
        <span style={S.sectionHint}>{items.length} · watchlist · next 7 days</span>
      </div>
      <div style={S.earningsGrid}>
        {items.map((e) => {
          const dte = daysFromNowTo(e.date);
          const rec = recommendEarningsStrategy(dte);
          const iv = ivMap[e.symbol];
          return (
            <div key={e.symbol + e.date} style={S.earningsCard}>
              <div style={S.earningsHead}>
                <div style={S.earningsTicker}>${e.symbol}</div>
                <div style={S.earningsDate}>
                  {fmtEarningsDate(e.date)}
                  <span style={{ marginLeft: 6, color: "#7a8b83", fontSize: 10 }}>
                    {bmoAmcLabel(e.time)}
                  </span>
                </div>
              </div>
              <div style={S.earningsDte}>
                {dte == null ? "—" : dte === 0 ? "today" : dte > 0 ? `T-${dte}` : `T+${-dte}`}
              </div>
              <div style={S.earningsRec}>{rec.name}</div>
              <div style={S.earningsReason}>{rec.reason}</div>
              <div style={S.earningsMeta}>
                <span>IV: <b style={{ color: "#e6e6e6" }}>{Number.isFinite(iv) ? iv.toFixed(1) + "%" : "—"}</b></span>
                {e.epsEstimated != null && (
                  <span>EPS est: <b style={{ color: "#e6e6e6" }}>${e.epsEstimated.toFixed(2)}</b></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// Styles — mirror /covered-call (Bloomberg × Apple)
// ============================================================================

const C = {
  bg:       "#0a1a12",
  bgPanel:  "#0f1f17",
  bgCell:   "#0a1610",
  border:   "#1f2a25",
  borderHi: "#2a3a33",
  emerald:  "#10b981",
  amber:    "#f59e0b",
  red:      "#ef4444",
  text:     "#e6e6e6",
  textDim:  "#7a8b83",
  textMute: "#4a5a53",
};
const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif";

const S = {
  page: {
    background: C.bg, color: C.text, minHeight: "100vh",
    padding: "20px 32px 80px", fontFamily: FONT_SANS,
    position: "relative", maxWidth: 1400, margin: "0 auto",
  },
  topBar: {
    position: "absolute", top: 14, right: 24,
    display: "flex", gap: 4, alignItems: "center",
  },
  navLink: {
    padding: "5px 11px", background: "transparent", color: C.textDim,
    border: `1px solid ${C.border}`, borderRadius: 2,
    fontSize: 10, fontWeight: 600, textDecoration: "none",
    letterSpacing: 0.8, textTransform: "uppercase",
    fontFamily: FONT_MONO, cursor: "pointer",
  },
  heading:  { marginTop: 32, marginBottom: 20 },
  brand:    { fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: 2, fontFamily: FONT_MONO },
  brandSub: { fontSize: 11, color: C.textDim, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" },

  lockBox: { maxWidth: 360, margin: "12vh auto 0", padding: "26px 30px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 4 },
  title:    { margin: 0, fontSize: 18, color: C.text, letterSpacing: 1.5, fontFamily: FONT_MONO, fontWeight: 700 },
  subtitle: { margin: "6px 0 0", color: C.textDim, fontSize: 12, letterSpacing: 0.5 },
  inp:        { padding: "9px 12px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 13, fontFamily: FONT_MONO },
  btnEmerald: { padding: "12px 26px", background: C.emerald, color: "#000", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: FONT_MONO },
  errorInline: { color: C.red, marginTop: 8, fontSize: 12 },

  // Filter bar
  filterBar: {
    display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end",
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2,
    padding: "16px 20px",
  },
  filterGroup:  { display: "flex", flexDirection: "column", gap: 6 },
  filterLabel:  { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT_MONO },
  filterPills:  { display: "flex", gap: 4 },
  filterPill:   { padding: "5px 10px", background: "transparent", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: FONT_MONO, cursor: "pointer" },
  filterPillActive: { padding: "5px 10px", background: C.emerald, color: "#000", border: `1px solid ${C.emerald}`, borderRadius: 2, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: FONT_MONO, cursor: "pointer" },
  filterCount:  { marginLeft: "auto", color: C.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, alignSelf: "center" },

  // Section
  sectionTitle: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  sectionName:  { color: C.text, fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT_MONO },
  sectionHint:  { color: C.textDim, fontSize: 11, marginLeft: "auto", fontFamily: FONT_MONO },

  // Grid
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 },

  // Card
  card: {
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2,
    padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
  },
  cardHead: { display: "flex", alignItems: "baseline", gap: 12 },
  cardNum:  { color: C.emerald, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO },
  cardName: { color: C.text, fontSize: 17, fontWeight: 700, letterSpacing: 0.5, fontFamily: FONT_MONO, flex: 1 },
  winrate:  { padding: "3px 8px", border: "1px solid", borderRadius: 2, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, fontFamily: FONT_MONO, whiteSpace: "nowrap" },

  tagRow:   { display: "flex", flexWrap: "wrap", gap: 5 },
  tag:      { padding: "2px 7px", border: "1px solid", borderRadius: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, fontFamily: FONT_MONO },
  tagMuted: { padding: "2px 7px", border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, fontFamily: FONT_MONO, color: C.textMute },

  summary:  { color: C.text, fontSize: 13, lineHeight: 1.5, fontFamily: FONT_SANS },

  envBox:   { background: C.bgCell, border: `1px solid ${C.border}`, borderRadius: 2, padding: "10px 12px" },
  envKey:   { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4, fontFamily: FONT_MONO },
  envText:  { color: C.text, fontSize: 12, lineHeight: 1.5, fontFamily: FONT_SANS },

  cardBtn:  {
    marginTop: "auto",
    display: "block", textAlign: "center",
    padding: "10px 14px", background: "transparent", color: C.emerald,
    border: `1px solid ${C.emerald}`, borderRadius: 2,
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
    fontFamily: FONT_MONO, textDecoration: "none",
  },

  empty: { padding: 48, color: C.textDim, fontSize: 13, textAlign: "center", marginTop: 24, fontFamily: FONT_MONO, letterSpacing: 0.5 },

  // ----- Market Regime panel -----
  regimeWrap: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
    background: C.bgPanel, border: "2px solid", borderRadius: 2,
    padding: "20px 24px", marginBottom: 20,
  },
  regimeWrapMuted: {
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2,
    padding: "16px 20px", marginBottom: 20,
    color: C.textDim, fontSize: 12, fontFamily: FONT_MONO, letterSpacing: 0.5,
  },
  regimeLeft:   { display: "flex", flexDirection: "column", gap: 8 },
  regimeRight:  { display: "flex", flexDirection: "column", gap: 8, borderLeft: `1px solid ${C.border}`, paddingLeft: 24 },
  regimeLabel:  { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, textTransform: "uppercase" },
  regimeName:   { fontSize: 22, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO },
  regimeRule:   { color: C.textDim, fontSize: 11, fontFamily: FONT_MONO, letterSpacing: 0.5 },
  regimeStats:  { color: C.textDim, fontSize: 11, fontFamily: FONT_MONO, marginTop: 2 },
  regimeBest:   { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 },
  regimeBestTag:{
    padding: "5px 10px", border: "1px solid", borderRadius: 2,
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    fontFamily: FONT_MONO,
  },

  // ----- Edge score badge on cards -----
  cardHeadRight: { display: "flex", alignItems: "center", gap: 8 },
  edgeBox:    { display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 8px", border: `1px solid ${C.border}`, borderRadius: 2 },
  edgeNum:    { fontSize: 18, fontWeight: 800, fontFamily: FONT_MONO, lineHeight: 1 },
  edgeLabel:  { color: C.textMute, fontSize: 7, fontWeight: 700, letterSpacing: 1, marginTop: 2, fontFamily: FONT_MONO },

  // ----- Earnings section -----
  earningsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 12 },
  earningsCard: { background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 },
  earningsHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  earningsTicker: { color: "#10b981", fontSize: 16, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: 1 },
  earningsDate:   { color: C.text, fontSize: 12, fontFamily: FONT_MONO },
  earningsDte:    { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, textTransform: "uppercase" },
  earningsRec:    { color: C.text, fontSize: 13, fontWeight: 600, fontFamily: FONT_MONO },
  earningsReason: { color: C.textDim, fontSize: 11, lineHeight: 1.4, fontFamily: FONT_SANS },
  earningsMeta:   { display: "flex", gap: 14, fontSize: 11, color: C.textDim, fontFamily: FONT_MONO, marginTop: "auto", paddingTop: 6, borderTop: `1px solid ${C.border}` },
  earningsEmpty:  { padding: "16px 20px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, color: C.textDim, fontSize: 12, fontFamily: FONT_MONO, marginBottom: 12 },
  earningsError:  { padding: "12px 16px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, color: C.textDim, fontSize: 11, fontFamily: FONT_MONO, lineHeight: 1.6, marginBottom: 12 },
};
