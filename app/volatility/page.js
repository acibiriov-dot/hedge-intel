"use client";
import { useEffect, useMemo, useState } from "react";

// Shared access gate with other private hedge-intel pages.
const KEY_ACCESS = "hi_access";
const PASSWORD   = "okiinvest2026";

// IV thresholds — same convention used on /smart-strategy для consistency.
// Прим: IV из Massive API приходит в долях (0.35 = 35%) — нормализуем
// при отображении: ivPct = iv * 100.
const IV_LOW_PCT  = 20;
const IV_HIGH_PCT = 40;

// ===========================================================================

export default function VolatilityLab() {
  // Access gate
  const [hasAccess, setHasAccess]         = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Data state
  const [ticker, setTicker]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [data, setData]       = useState(null); // { ticker, underlyingPrice, contracts, base }

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

  async function analyze() {
    setError(""); setData(null);
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Введи тикер"); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/options-chain?ticker=${encodeURIComponent(t)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!j.contracts?.length) throw new Error("Нет контрактов в опционной цепочке");
      setData(j);
    } catch (e) {
      setError(e.message || "Ошибка");
    }
    setLoading(false);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Derived: nearest expiration, ATM strike, IV-overview metrics,
  // ATM call/put greeks, sorted chain rows.
  const derived = useMemo(() => deriveAnalysis(data), [data]);

  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>VOLATILITY LAB</h1>
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
        <a href="/strategies"     style={S.navLink}>Strategies</a>
        <a href="/covered-call"   style={S.navLink}>Decision Engine</a>
        <a href="/smart-strategy" style={S.navLink}>Smart Strategy</a>
        <a href="/options"        style={S.navLink}>Options Desk</a>
        <button style={S.navLink} onClick={logout}>Logout</button>
      </div>

      <div style={S.heading}>
        <div style={S.brand}>VOLATILITY LAB</div>
        <div style={S.brandSub}>
          IV analytics · options chain · Massive (formerly Polygon) API
        </div>
      </div>

      {/* Input */}
      <div style={S.inputRow}>
        <input
          style={S.inpTicker}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading) analyze(); }}
          placeholder="AAPL"
          maxLength={10}
        />
        <button style={S.btnEmerald} onClick={analyze} disabled={loading}>
          {loading ? "ANALYZING…" : "АНАЛИЗИРОВАТЬ"}
        </button>
        {data?.underlyingPrice != null && (
          <div style={S.spotPill}>
            <div style={S.spotLabel}>SPOT</div>
            <div style={S.spotVal}>${data.underlyingPrice.toFixed(2)}</div>
          </div>
        )}
      </div>

      {error && <div style={S.error}>{error}</div>}

      {data && derived && (
        <>
          {/* A. IV OVERVIEW */}
          <SectionTitle num="01" name="IV Overview" hint={`nearest expiry · ${derived.expiry}`} />
          <IvOverview iv={derived.ivAvg} />

          {/* B. ATM Greeks */}
          <SectionTitle
            num="02"
            name="ATM Greeks"
            hint={derived.atmStrike != null ? `Strike $${derived.atmStrike.toFixed(2)}` : ""}
          />
          <AtmGreeks atmCall={derived.atmCall} atmPut={derived.atmPut} spot={data.underlyingPrice} />

          {/* C. Chain table */}
          <SectionTitle
            num="03"
            name="Options Chain"
            hint={`${derived.chainRows.length} rows · ${derived.expiry} · BE via Black-Scholes`}
          />
          <ChainTable rows={derived.chainRows} atmStrike={derived.atmStrike} spot={data.underlyingPrice} />

          {/* D. Recommendation */}
          <SectionTitle num="04" name="Strategy Recommendation" />
          <Recommendation iv={derived.ivAvg} />
        </>
      )}
    </div>
  );
}

// ============================================================================
// Derivation
// ============================================================================

function deriveAnalysis(data) {
  if (!data?.contracts?.length) return null;
  const spot = data.underlyingPrice;

  // Step 1: pick nearest expiration (earliest date ≥ today)
  const today = new Date().toISOString().slice(0, 10);
  const byExpiry = new Map();
  for (const c of data.contracts) {
    if (!c.expiration) continue;
    if (c.expiration < today) continue;
    if (!byExpiry.has(c.expiration)) byExpiry.set(c.expiration, []);
    byExpiry.get(c.expiration).push(c);
  }
  if (!byExpiry.size) {
    // Edge case: all contracts are in past — fall back to all
    const exp = [...new Set(data.contracts.map((c) => c.expiration).filter(Boolean))].sort()[0];
    if (!exp) return null;
    byExpiry.set(exp, data.contracts.filter((c) => c.expiration === exp));
  }
  const expiries = [...byExpiry.keys()].sort();
  const nearest = expiries[0];
  const nearChain = byExpiry.get(nearest);

  // Step 2: ATM strike — closest strike to spot. If spot unknown,
  // pick median strike as a fallback so the page still renders.
  const strikes = [...new Set(nearChain.map((c) => c.strike).filter((s) => Number.isFinite(s)))].sort((a, b) => a - b);
  let atmStrike = null;
  if (spot != null && strikes.length) {
    atmStrike = strikes.reduce((best, s) =>
      Math.abs(s - spot) < Math.abs(best - spot) ? s : best,
      strikes[0]
    );
  } else if (strikes.length) {
    atmStrike = strikes[Math.floor(strikes.length / 2)];
  }

  // Step 3: ATM call & put
  const atmCall = nearChain.find((c) => c.strike === atmStrike && c.type === "call") || null;
  const atmPut  = nearChain.find((c) => c.strike === atmStrike && c.type === "put")  || null;

  // Step 4: IV average across ATM call+put (closer to market expectation than
  // the entire chain — IV smile distorts wing strikes).
  const ivVals = [atmCall?.iv, atmPut?.iv].filter((v) => v != null && v > 0);
  const ivAvgRaw = ivVals.length ? ivVals.reduce((a, b) => a + b, 0) / ivVals.length : null;
  const ivAvg = ivAvgRaw != null ? ivAvgRaw * 100 : null;  // → percent

  // Step 5: chain rows sorted by strike, with type-order calls→puts on same strike
  const chainRows = [...nearChain]
    .filter((c) => Number.isFinite(c.strike) && c.type)
    .sort((a, b) => {
      if (a.strike !== b.strike) return a.strike - b.strike;
      return a.type === "call" ? -1 : 1;  // call before put at same strike
    });

  return {
    expiry: nearest,
    atmStrike,
    atmCall,
    atmPut,
    ivAvg,
    chainRows,
    expiries,
  };
}

// ============================================================================
// Black-Scholes (теоретическая цена опциона)
// ============================================================================
// Massive Starter план НЕ отдаёт bid/ask / mark price → break_even_price из
// контракта обычно null. Считаем теоретическую цену сами через BS, потом
// breakeven = strike ± theoretical (call/put соответственно).
//
// Стандартная закрытая формула. CDF нормального распределения через
// erf-аппроксимацию Abramowitz & Stegun 7.1.26 (max error ≈ 1.5e-7,
// заведомо достаточно для отображения брейкивена с двумя знаками).

const RISK_FREE = 0.05;  // ~ставка US Treasury 10Y, обычная конвенция для BS

function erf(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function blackScholesPrice(S, K, T, r, sigma, type) {
  // Guards: BS не определён для T<=0, sigma<=0, K<=0, S<=0.
  if (!(T > 0) || !(sigma > 0) || !(K > 0) || !(S > 0)) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === "call") {
    return S * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
  }
  if (type === "put") {
    return K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1);
  }
  return null;
}

// Compute breakeven for a single contract using BS theoretical price.
// Returns null if any input is missing — caller renders "—".
function computeBreakeven(contract, spot) {
  if (!contract || !spot) return null;
  if (contract.iv == null || contract.iv <= 0) return null;
  if (!Number.isFinite(contract.strike) || !contract.expiration) return null;

  // Days to expiration (whole days, floored at 0).
  const today = new Date();
  const exp = new Date(contract.expiration + "T00:00:00Z");
  const ms = exp - today;
  const days = Math.max(0, Math.round(ms / 86400000));
  const T = days / 365;
  if (T <= 0) return null;

  const theoretical = blackScholesPrice(spot, contract.strike, T, RISK_FREE, contract.iv, contract.type);
  if (theoretical == null || theoretical <= 0) return null;

  if (contract.type === "call") return contract.strike + theoretical;
  if (contract.type === "put")  return contract.strike - theoretical;
  return null;
}

// ============================================================================
// Sub-components
// ============================================================================

function SectionTitle({ num, name, hint }) {
  return (
    <div style={S.sectionTitle}>
      <span style={S.sectionNum}>{num}</span>
      <span style={S.sectionName}>{name}</span>
      {hint && <span style={S.sectionHint}>{hint}</span>}
    </div>
  );
}

function ivColor(ivPct) {
  if (ivPct == null) return "#7a8b83";
  if (ivPct < IV_LOW_PCT)  return "#10b981";  // emerald — низкая
  if (ivPct < IV_HIGH_PCT) return "#f59e0b";  // amber — нормальная
  return "#ef4444";                            // red — высокая
}
function ivLabel(ivPct) {
  if (ivPct == null) return "—";
  if (ivPct < IV_LOW_PCT)  return "LOW · покупать опционы";
  if (ivPct < IV_HIGH_PCT) return "NORMAL · нейтральная среда";
  return "HIGH · продавать премию";
}
function ivStrategyHint(ivPct) {
  if (ivPct == null) return "Недостаточно данных для рекомендации.";
  if (ivPct < IV_LOW_PCT) {
    return "Опционы дёшевы относительно ожидаемого движения. Долгие позиции (long call/put, debit spreads) дают благоприятное соотношение цена/потенциал. Theta-decay не критичен на коротких сроках.";
  }
  if (ivPct < IV_HIGH_PCT) {
    return "IV в середине диапазона — направленные ставки сопоставимы с покупкой акции/шорта. Стратегии вроде vertical spreads дают баланс — ограниченный риск, отделённый theta от direction.";
  }
  return "Опционы дороги — премия зашита в цену. Продажа опционов (covered call, cash-secured put, iron condor) получает максимальный edge от theta-decay и IV crush. Покупка опционов невыгодна.";
}

function IvOverview({ iv }) {
  const color = ivColor(iv);
  return (
    <div style={S.ivBox}>
      <div style={S.ivLeft}>
        <div style={S.ivLabel}>ATM IMPLIED VOLATILITY</div>
        <div style={{ ...S.ivVal, color }}>
          {iv != null ? iv.toFixed(1) + "%" : "—"}
        </div>
        <div style={{ ...S.ivBadge, color, borderColor: color }}>
          {ivLabel(iv)}
        </div>
      </div>
      <div style={S.ivRight}>
        <div style={S.ivExplainTitle}>ЧТО ЭТО ЗНАЧИТ</div>
        <div style={S.ivExplain}>{ivStrategyHint(iv)}</div>
      </div>
    </div>
  );
}

const GREEK_HINTS = {
  delta: "Изменение цены опциона при движении акции на $1. Δ 0.5 = $0.50 на каждый $1 базиса.",
  gamma: "Скорость изменения Delta. Высокая Γ = Delta быстро меняется → позиция нестабильна.",
  theta: "Сколько премии теряется каждый день от течения времени. Для покупателя — расход.",
  vega:  "Чувствительность к IV. Vega 0.10 = ±$0.10 на каждый ±1% IV.",
};

function GreekRow({ label, value, formatter = (v) => v?.toFixed?.(3) ?? "—" }) {
  return (
    <div style={S.greekRow}>
      <div style={S.greekKey}>{label}</div>
      <div style={S.greekVal}>{value == null ? "—" : formatter(value)}</div>
      <div style={S.greekHint}>{GREEK_HINTS[label.toLowerCase()] || ""}</div>
    </div>
  );
}

function AtmGreeks({ atmCall, atmPut, spot }) {
  const beCall = computeBreakeven(atmCall, spot);
  const beP    = computeBreakeven(atmPut,  spot);
  return (
    <div style={S.greeksGrid}>
      <div style={S.greeksCol}>
        <div style={{ ...S.greeksColHead, color: "#10b981" }}>● CALL · ATM</div>
        {atmCall ? (
          <>
            <GreekRow label="Delta" value={atmCall.delta} />
            <GreekRow label="Gamma" value={atmCall.gamma} formatter={(v) => v.toFixed(4)} />
            <GreekRow label="Theta" value={atmCall.theta} />
            <GreekRow label="Vega"  value={atmCall.vega} />
            <div style={S.greekMeta}>
              IV {atmCall.iv != null ? (atmCall.iv * 100).toFixed(1) + "%" : "—"} ·
              OI {atmCall.openInterest ?? "—"} · BE {beCall != null ? "$" + beCall.toFixed(2) : "—"}
            </div>
          </>
        ) : <div style={S.muted}>Нет ATM-call контракта в цепочке.</div>}
      </div>
      <div style={S.greeksCol}>
        <div style={{ ...S.greeksColHead, color: "#ef4444" }}>● PUT · ATM</div>
        {atmPut ? (
          <>
            <GreekRow label="Delta" value={atmPut.delta} />
            <GreekRow label="Gamma" value={atmPut.gamma} formatter={(v) => v.toFixed(4)} />
            <GreekRow label="Theta" value={atmPut.theta} />
            <GreekRow label="Vega"  value={atmPut.vega} />
            <div style={S.greekMeta}>
              IV {atmPut.iv != null ? (atmPut.iv * 100).toFixed(1) + "%" : "—"} ·
              OI {atmPut.openInterest ?? "—"} · BE {beP != null ? "$" + beP.toFixed(2) : "—"}
            </div>
          </>
        ) : <div style={S.muted}>Нет ATM-put контракта в цепочке.</div>}
      </div>
    </div>
  );
}

function ChainTable({ rows, atmStrike, spot }) {
  if (!rows.length) return <div style={S.empty}>Цепочка пуста.</div>;
  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.thNum}>Strike</th>
            <th style={S.th}>Type</th>
            <th style={S.thNum}>IV %</th>
            <th style={S.thNum}>Delta</th>
            <th style={S.thNum}>Theta</th>
            <th style={S.thNum}>OI</th>
            <th style={S.thNum}>Breakeven</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isAtm = r.strike === atmStrike;
            const rowStyle = isAtm ? S.trAtm : (i % 2 ? S.trAlt : S.tr);
            const typeColor = r.type === "call" ? "#10b981" : "#ef4444";
            // BE via Black-Scholes (Massive Starter не отдаёт break_even_price).
            // null если IV/spot/expiry недоступны — рендерим "—".
            const be = computeBreakeven(r, spot);
            return (
              <tr key={(r.contractTicker || i) + r.type} style={rowStyle}>
                <td style={S.tdNum}>${r.strike?.toFixed(2)}</td>
                <td style={{ ...S.td, color: typeColor, fontWeight: 600 }}>
                  {r.type?.toUpperCase()}
                </td>
                <td style={S.tdNum}>{r.iv != null ? (r.iv * 100).toFixed(1) : "—"}</td>
                <td style={S.tdNum}>{r.delta != null ? r.delta.toFixed(3) : "—"}</td>
                <td style={S.tdNum}>{r.theta != null ? r.theta.toFixed(3) : "—"}</td>
                <td style={S.tdNum}>{r.openInterest ?? "—"}</td>
                <td style={S.tdNum}>{be != null ? "$" + be.toFixed(2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Recommendation({ iv }) {
  if (iv == null) {
    return <div style={S.recBox}><div style={S.muted}>Недостаточно данных IV для рекомендации.</div></div>;
  }
  let title, strategies, reasoning;
  if (iv >= IV_HIGH_PCT) {
    title = "🔥 SELL PREMIUM";
    strategies = [
      ["Covered Call", "продажа OTM колла при наличии 100 акций"],
      ["Cash-Secured Put", "продажа OTM пута с резервом кэша на покупку"],
      ["Iron Condor", "стрэнгл с защитными крыльями — для боковика"],
    ];
    reasoning = "Высокая IV → опционы переоценены. Продавая премию, получаешь edge от theta-decay и неизбежного IV crush после события или просто со временем.";
  } else if (iv < IV_LOW_PCT) {
    title = "📈 BUY PREMIUM";
    strategies = [
      ["Long Call", "ставка на рост базиса (направленная)"],
      ["Long Put",  "ставка на падение базиса (защита/спекуляция)"],
      ["Debit Spreads", "Bull Call Spread / Bear Put Spread — ограниченный риск"],
    ];
    reasoning = "Низкая IV → опционы недооценены. Покупая премию сейчас, ты платишь меньше за тот же экспирационный потенциал. Дополнительный bonus: рост IV сам по себе двигает позицию в плюс (long vega).";
  } else {
    title = "⚖️ NEUTRAL — DIRECTIONAL ONLY";
    strategies = [
      ["Vertical Spreads", "Bull Call / Bear Put — баланс direction vs theta"],
      ["Calendar Spread",  "если ожидается рост IV ближе к событию"],
      ["Stock + Hedge",    "акция + защитный пут (если IV ниже исторической)"],
    ];
    reasoning = "IV в средней зоне — нет явного перекоса для лонга или шорта премии. Лучшие стратегии — те где direction-thesis важнее IV-thesis.";
  }
  return (
    <div style={S.recBox}>
      <div style={S.recTitle}>{title}</div>
      <div style={S.recReason}>{reasoning}</div>
      {strategies.map(([name, desc], i) => (
        <div key={i} style={S.recItem}>
          <div style={S.recItemName}>{name}</div>
          <div style={S.recItemDesc}>{desc}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Styles — dark emerald (matches /covered-call, /strategies, /briefing)
// ============================================================================

const C = {
  bg:       "#0a1a12",
  bgPanel:  "#0f1f17",
  bgCell:   "#0a1610",
  border:   "#1f2a25",
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
  page: { background: C.bg, color: C.text, minHeight: "100vh", padding: "20px 32px 80px", fontFamily: FONT_SANS, position: "relative", maxWidth: 1300, margin: "0 auto" },
  title: { margin: "0 0 4px", fontSize: 26, color: "#fff" },
  subtitle: { margin: "0 0 20px", color: "#888", fontSize: 13 },

  topBar: { position: "absolute", top: 14, right: 24, display: "flex", gap: 4, alignItems: "center" },
  navLink: { padding: "5px 11px", background: "transparent", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 10, fontWeight: 600, textDecoration: "none", letterSpacing: 0.8, textTransform: "uppercase", fontFamily: FONT_MONO, cursor: "pointer" },

  heading: { marginTop: 32, marginBottom: 24 },
  brand:   { fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: 2.5, fontFamily: FONT_MONO },
  brandSub:{ fontSize: 11, color: C.textDim, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" },

  lockBox: { maxWidth: 360, margin: "12vh auto 0", padding: "26px 30px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 4 },
  inp: { padding: "9px 12px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 13, fontFamily: FONT_MONO },
  inpTicker: { padding: "13px 18px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", width: 220, fontFamily: FONT_MONO, outline: "none" },
  btnEmerald: { padding: "13px 28px", background: C.emerald, color: "#000", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: FONT_MONO },

  errorInline: { color: C.red, marginTop: 8, fontSize: 12 },
  error: { padding: "12px 16px", background: "#1f0a0a", color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, marginTop: 16, fontSize: 12, fontFamily: FONT_MONO },

  inputRow: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12 },
  spotPill: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 18px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 4, marginLeft: "auto" },
  spotLabel:{ color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO },
  spotVal:  { color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },

  sectionTitle: { display: "flex", alignItems: "baseline", gap: 12, margin: "32px 0 12px", borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  sectionNum:   { color: C.emerald, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO },
  sectionName:  { color: C.text, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT_MONO },
  sectionHint:  { color: C.textDim, fontSize: 11, marginLeft: "auto", fontFamily: FONT_MONO },

  // IV box
  ivBox:    { display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, padding: "20px 24px" },
  ivLeft:   { display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 },
  ivLabel:  { color: C.textMute, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, textTransform: "uppercase" },
  ivVal:    { fontSize: 52, fontWeight: 800, fontFamily: FONT_MONO, lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  ivBadge:  { padding: "5px 12px", border: "1px solid", borderRadius: 2, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, fontFamily: FONT_MONO, alignSelf: "flex-start" },
  ivRight:  { display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: `1px solid ${C.border}`, paddingLeft: 24 },
  ivExplainTitle: { color: C.textMute, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, marginBottom: 8, textTransform: "uppercase" },
  ivExplain: { color: C.text, fontSize: 13, lineHeight: 1.65, fontFamily: FONT_SANS },

  // Greeks
  greeksGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  greeksCol:    { background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, padding: "16px 18px" },
  greeksColHead:{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` },
  greekRow:     { display: "grid", gridTemplateColumns: "70px 110px 1fr", gap: 14, alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${C.border}` },
  greekKey:     { color: C.textMute, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, fontFamily: FONT_MONO, textTransform: "uppercase" },
  greekVal:     { color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  greekHint:    { color: C.textDim, fontSize: 11, lineHeight: 1.5, fontFamily: FONT_SANS },
  greekMeta:    { color: C.textDim, fontSize: 11, marginTop: 10, fontFamily: FONT_MONO },
  muted:        { color: C.textMute, fontSize: 12, padding: 10 },

  // Chain table
  tableWrap: { overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 2, maxHeight: 480 },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT_MONO },
  th:    { padding: "10px 12px", background: C.bgPanel, color: C.textDim, textAlign: "left",  borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", position: "sticky", top: 0, whiteSpace: "nowrap" },
  thNum: { padding: "10px 12px", background: C.bgPanel, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", position: "sticky", top: 0, whiteSpace: "nowrap" },
  tr:    { background: C.bgCell },
  trAlt: { background: "#0e1d15" },
  trAtm: { background: "rgba(16, 185, 129, 0.12)", outline: `1px solid ${C.emerald}` },
  td:    { padding: "8px 12px", color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" },
  tdNum: { padding: "8px 12px", color: C.text, borderBottom: `1px solid ${C.border}`, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },

  // Recommendation
  recBox:     { background: C.bgPanel, border: `1px solid ${C.emerald}`, borderRadius: 2, padding: "20px 24px" },
  recTitle:   { color: C.emerald, fontSize: 16, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, marginBottom: 12 },
  recReason:  { color: C.text, fontSize: 13, lineHeight: 1.65, fontFamily: FONT_SANS, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` },
  recItem:    { padding: "10px 0", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 },
  recItemName:{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: 0.5 },
  recItemDesc:{ color: C.textDim, fontSize: 13, lineHeight: 1.5, fontFamily: FONT_SANS },

  empty: { padding: 24, color: C.textDim, fontSize: 12, textAlign: "center", fontFamily: FONT_MONO },
};
