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

  useEffect(() => {
    try { setHasAccess(localStorage.getItem(KEY_ACCESS) === "1"); } catch {}
  }, []);

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
        <a href="/dashboard"      style={S.navLink}>Dashboard</a>
        <a href="/covered-call"   style={S.navLink}>Decision Engine</a>
        <a href="/smart-strategy" style={S.navLink}>Smart Strategy</a>
        <a href="/options"        style={S.navLink}>Options Desk</a>
        <button style={S.navLink} onClick={logout}>Logout</button>
      </div>

      <div style={S.heading}>
        <div style={S.brand}>STRATEGY LIBRARY</div>
        <div style={S.brandSub}>13 options strategies · simple → complex</div>
      </div>

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
              {items.map((s) => <StrategyCard key={s.id} s={s} />)}
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

function StrategyCard({ s }) {
  const wColor = winrateColor(s.winrate);
  const dirs = s.direction.map(directionTag);
  const styl = styleTag(s.style);
  const lvl  = levelTag(s.level);
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={S.cardNum}>{String(s.num).padStart(2, "0")}</div>
        <div style={S.cardName}>{s.name}</div>
        <div style={{ ...S.winrate, color: wColor, borderColor: wColor }}>
          ● {s.winrate[0]}-{s.winrate[1]}%
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
};
