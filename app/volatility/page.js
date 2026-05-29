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
  //
  // Архитектура: один initial fetch на тикер (без expiry) даёт meta
  // (underlyingPrice, expirations[], defaultExpiry) + contracts для default.
  // На смену даты в селекторе — per-expiry fetch (с expiry param), который
  // тянет Finviz e=date с реальными греками и кладёт contracts в кэш.
  // Один раз запросили — больше не повторяем.
  const [ticker, setTicker]   = useState("");
  const [loading, setLoading] = useState(false);       // initial fetch
  const [error, setError]     = useState("");
  const [meta, setMeta]       = useState(null);        // {ticker, underlyingPrice, expirations[], defaultExpiry}
  const [contractsByExpiry, setContractsByExpiry] = useState(new Map()); // expiry → contracts[]
  const [selectedExpiry, setSelectedExpiry]       = useState(null);
  const [expiryLoading, setExpiryLoading]         = useState(null); // null | "YYYY-MM-DD"
  const [expiryError, setExpiryError]             = useState("");

  // Когда приходит initial response → выбираем default expiry.
  useEffect(() => {
    if (!meta?.expirations?.length) { setSelectedExpiry(null); return; }
    setSelectedExpiry(meta.defaultExpiry || pickDefaultExpiry(meta.expirations));
  }, [meta]);

  // Когда меняется выбранная дата — если контрактов для неё нет в кэше,
  // тянем per-expiry endpoint. Контракты для default ложатся в кэш ещё в
  // analyze(), поэтому при первом рендере доп. запроса не будет.
  useEffect(() => {
    if (!ticker || !selectedExpiry) return;
    if (contractsByExpiry.has(selectedExpiry)) return;
    let cancelled = false;
    (async () => {
      setExpiryLoading(selectedExpiry);
      setExpiryError("");
      try {
        const r = await fetch(
          `/api/options-chain?ticker=${encodeURIComponent(ticker)}&expiry=${encodeURIComponent(selectedExpiry)}`
        );
        const j = await r.json();
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setContractsByExpiry((prev) => {
          const next = new Map(prev);
          next.set(selectedExpiry, j.contracts || []);
          return next;
        });
        // Если per-expiry endpoint вернул свежий underlyingPrice — обновим.
        if (j.underlyingPrice != null) {
          setMeta((prev) => prev ? { ...prev, underlyingPrice: j.underlyingPrice } : prev);
        }
      } catch (e) {
        if (!cancelled) setExpiryError(e.message || "Ошибка загрузки цепочки");
      } finally {
        if (!cancelled) setExpiryLoading(null);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker, selectedExpiry, contractsByExpiry]);

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
    setError(""); setMeta(null);
    setContractsByExpiry(new Map());
    setSelectedExpiry(null);
    setExpiryError("");
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Введи тикер"); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/options-chain?ticker=${encodeURIComponent(t)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!j.expirations?.length) throw new Error("Нет экспираций в опционной цепочке");
      // Кэшируем contracts для default expiry — initial response уже их вернул.
      const initialMap = new Map();
      if (j.expiry && j.contracts?.length) initialMap.set(j.expiry, j.contracts);
      setContractsByExpiry(initialMap);
      setMeta({
        ticker: j.ticker,
        underlyingPrice: j.underlyingPrice,
        expirations: j.expirations,
        defaultExpiry: j.defaultExpiry || j.expiry || null,
      });
    } catch (e) {
      setError(e.message || "Ошибка");
    }
    setLoading(false);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Derived: ATM strike, IV-overview, ATM call/put greeks, sorted chain rows.
  // Зависит от contracts для выбранной даты И underlyingPrice.
  const derived = useMemo(() => {
    if (!meta || !selectedExpiry) return null;
    const contracts = contractsByExpiry.get(selectedExpiry);
    if (!contracts) return null;
    return deriveAnalysis(contracts, selectedExpiry, meta.underlyingPrice);
  }, [meta, selectedExpiry, contractsByExpiry]);

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

      {/* Input row 1: ticker + analyze */}
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
      </div>

      {/* Big ticker + spot price — отображается крупно сразу после загрузки.
          Источник цены — Finviz quote_export (priority: finviz → massive → fmp). */}
      {meta?.ticker && (
        <div style={S.priceHeader}>
          <div style={S.priceTicker}>{meta.ticker}</div>
          <div style={S.priceValue}>
            {meta.underlyingPrice != null ? `$${meta.underlyingPrice.toFixed(2)}` : "—"}
          </div>
          <div style={S.priceLabel}>SPOT PRICE</div>
        </div>
      )}

      {/* Input row 2: expiry selector (отображается после загрузки) */}
      {meta?.expirations?.length > 0 && (
        <ExpirySelector
          expirations={meta.expirations}
          selected={selectedExpiry}
          onChange={setSelectedExpiry}
          loadingExpiry={expiryLoading}
        />
      )}

      {error && <div style={S.error}>{error}</div>}
      {expiryError && <div style={S.error}>{expiryError}</div>}
      {expiryLoading && !derived && (
        <div style={S.empty}>Загружаю цепочку для {expiryLoading}…</div>
      )}

      {meta && derived && (
        <>
          {/* A. IV OVERVIEW */}
          <SectionTitle
            num="01"
            name="IV Overview"
            hint={`${derived.expiry} · ${derived.daysToExpiry}d to expiry`}
          />
          <IvOverview iv={derived.ivAvg} />

          {/* B. ATM Greeks */}
          <SectionTitle
            num="02"
            name="ATM Greeks"
            hint={derived.atmStrike != null ? `Strike $${derived.atmStrike.toFixed(2)}` : ""}
          />
          <AtmGreeks atmCall={derived.atmCall} atmPut={derived.atmPut} />

          {/* C. Chain table */}
          <SectionTitle
            num="03"
            name="Options Chain"
            hint={`${derived.chainRows.length} rows · ${derived.expiry} (${derived.daysToExpiry}d) · BE via Finviz`}
          />
          <ChainTable rows={derived.chainRows} atmStrike={derived.atmStrike} />

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

// Сегодня в локальном time-zone, формат YYYY-MM-DD — для сравнения с
// expiration_date (Massive отдаёт в этом же формате).
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Дней между сегодня и ISO-датой (whole days, может быть 0 для today).
function daysUntilIso(iso) {
  if (!iso) return null;
  const today = new Date(todayIso() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.max(0, Math.round((target - today) / 86400000));
}

// Default expiry per spec:
//   1) today, если volumeSum > 0 (liquid 0DTE — SPX/SPY)
//   2) nearest future с volumeSum > 0
//   3) если ни у кого нет volume (probe вне торгов) — nearest future с oiSum > 0
//   4) первое доступное по дате
// expirations: [{expiry, contractCount, volumeSum, oiSum, callOi, putOi}]
function pickDefaultExpiry(expirations) {
  if (!expirations?.length) return null;
  const t = todayIso();

  // Step 1: today exists AND liquid?
  const todayE = expirations.find((e) => e.expiry === t);
  if (todayE && todayE.volumeSum > 0) return t;

  // Step 2: nearest future expiry with non-zero volume
  const futureWithVol = expirations
    .filter((e) => e.expiry >= t && e.volumeSum > 0)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  if (futureWithVol) return futureWithVol.expiry;

  // Step 3: same but with OI > 0 (off-hours probe — volumes are 0 чаще всего)
  const futureWithOi = expirations
    .filter((e) => e.expiry >= t && e.oiSum > 0)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  if (futureWithOi) return futureWithOi.expiry;

  // Step 4: any future expiry; иначе самая поздняя из прошлого
  const future = expirations.filter((e) => e.expiry >= t)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  return future?.expiry || expirations[expirations.length - 1].expiry;
}

function deriveAnalysis(contracts, selectedExpiry, spot) {
  if (!Array.isArray(contracts) || !contracts.length) return null;
  if (!selectedExpiry) return null;

  // Per-expiry endpoint возвращает только контракты для одной даты,
  // но если данные пришли смешанные (например initial response) — фильтруем.
  const chainAt = contracts.filter((c) => c.expiration === selectedExpiry);
  if (!chainAt.length) return null;

  // ATM strike — closest to spot. Fallback: median strike (если spot=null,
  // потому что FMP key умер и Massive Starter не отдаёт underlying.price).
  const strikes = [...new Set(chainAt.map((c) => c.strike).filter((s) => Number.isFinite(s)))]
    .sort((a, b) => a - b);
  let atmStrike = null;
  if (spot != null && strikes.length) {
    atmStrike = strikes.reduce(
      (best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best),
      strikes[0]
    );
  } else if (strikes.length) {
    atmStrike = strikes[Math.floor(strikes.length / 2)];
  }

  // ATM call & put для выбранной экспирации.
  const atmCall = chainAt.find((c) => c.strike === atmStrike && c.type === "call") || null;
  const atmPut  = chainAt.find((c) => c.strike === atmStrike && c.type === "put")  || null;

  // IV среднее по ATM call+put (рыночное ожидание для выбранного horizon).
  const ivVals = [atmCall?.iv, atmPut?.iv].filter((v) => v != null && v > 0);
  const ivAvgRaw = ivVals.length ? ivVals.reduce((a, b) => a + b, 0) / ivVals.length : null;
  const ivAvg = ivAvgRaw != null ? ivAvgRaw * 100 : null; // → percent

  // Chain rows: sort by strike, calls перед puts на одном страйке.
  const chainRows = [...chainAt]
    .filter((c) => Number.isFinite(c.strike) && c.type)
    .sort((a, b) => {
      if (a.strike !== b.strike) return a.strike - b.strike;
      return a.type === "call" ? -1 : 1;
    });

  return {
    expiry: selectedExpiry,
    daysToExpiry: daysUntilIso(selectedExpiry),
    atmStrike,
    atmCall,
    atmPut,
    ivAvg,
    chainRows,
  };
}

// ============================================================================
// Breakeven из реальной премии (Finviz Elite)
// ============================================================================
// /api/options-chain параллельно тянет Finviz Elite options chain и
// присоединяет реальную премию опциона к каждому контракту:
//   contract.marketPremium  — число $ (Last Close / Mid / Bid / Ask)
//   contract.premiumSource  — из какого поля Finviz взялась цена
//
// BE = strike ± premium. Если premium отсутствует (Finviz не вернул
// matching row или контракт illiquid с пустыми котировками) — null,
// рендерим "—". Никаких theoretical price'ов: только real market data.

function computeBreakeven(contract) {
  if (!contract) return null;
  if (contract.marketPremium == null) return null;
  if (!Number.isFinite(contract.strike)) return null;
  if (contract.type === "call") return contract.strike + contract.marketPremium;
  if (contract.type === "put")  return contract.strike - contract.marketPremium;
  return null;
}

// ============================================================================
// Sub-components
// ============================================================================

// ExpirySelector — нативный <select> + контекстные стат (OI, volume) рядом.
// "0DTE" tag для today, чтобы пользователь видел liquid 0DTE даже если
// дефолт пошёл не на today.
function ExpirySelector({ expirations, selected, onChange, loadingExpiry }) {
  const sel = expirations.find((e) => e.expiry === selected) || null;
  const t = todayIso();
  return (
    <div style={S.expiryRow}>
      <div style={S.expiryLabel}>EXPIRY</div>
      <select
        style={S.expirySelect}
        value={selected || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={!!loadingExpiry}
      >
        {expirations.map((e) => {
          const d = daysUntilIso(e.expiry);
          const tag = e.expiry === t ? " · 0DTE" : "";
          const liq = e.volumeSum > 0 ? "" : (e.oiSum > 0 ? " · no vol" : " · no OI");
          return (
            <option key={e.expiry} value={e.expiry}>
              {e.expiry} ({d}d){tag}{liq}
            </option>
          );
        })}
      </select>
      {loadingExpiry && <div style={S.expiryStats}>загружаю…</div>}
      {!loadingExpiry && sel && (
        <div style={S.expiryStats}>
          <span>{sel.contractCount} contracts</span>
          <span style={S.expiryStatsSep}>·</span>
          <span>vol {fmtIntShort(sel.volumeSum)}</span>
          <span style={S.expiryStatsSep}>·</span>
          <span>OI {fmtIntShort(sel.oiSum)}</span>
          <span style={S.expiryStatsSep}>·</span>
          <span>P/C OI {(sel.putOi / Math.max(1, sel.callOi)).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function fmtIntShort(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

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

function AtmGreeks({ atmCall, atmPut }) {
  const beCall = computeBreakeven(atmCall);
  const beP    = computeBreakeven(atmPut);
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

function ChainTable({ rows, atmStrike }) {
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
            <th style={S.thNum}>Premium</th>
            <th style={S.thNum}>Breakeven</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isAtm = r.strike === atmStrike;
            const rowStyle = isAtm ? S.trAtm : (i % 2 ? S.trAlt : S.tr);
            const typeColor = r.type === "call" ? "#10b981" : "#ef4444";
            // BE = strike ± marketPremium (Finviz). Null если Finviz не дал
            // matching row → колонка "—".
            const be = computeBreakeven(r);
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
                <td style={S.tdNum} title={r.premiumSource ? `source: ${r.premiumSource}` : ""}>
                  {r.marketPremium != null ? "$" + r.marketPremium.toFixed(2) : "—"}
                </td>
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

  // Expiry selector — отдельная строка ниже ticker'а, появляется после загрузки.
  expiryRow:    { display: "flex", gap: 12, alignItems: "center", marginBottom: 16, padding: "10px 14px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2 },
  expiryLabel:  { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, textTransform: "uppercase" },
  expirySelect: { padding: "8px 12px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 13, fontFamily: FONT_MONO, cursor: "pointer", minWidth: 240 },
  expiryStats:  { display: "flex", alignItems: "center", gap: 6, color: C.textDim, fontSize: 11, fontFamily: FONT_MONO, marginLeft: "auto", fontVariantNumeric: "tabular-nums" },
  expiryStatsSep: { color: C.textMute },
  spotPill: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 18px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 4, marginLeft: "auto" },
  spotLabel:{ color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO },
  spotVal:  { color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },

  // Большая шапка с ценой акции — стоит сразу после input row, отдельной
  // полосой. Цель: цену видно с первого взгляда, не глядя в ATM таблицу.
  priceHeader: { display: "flex", alignItems: "baseline", gap: 18, padding: "14px 18px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, marginBottom: 16 },
  priceTicker: { color: C.emerald, fontSize: 28, fontWeight: 700, letterSpacing: 2, fontFamily: FONT_MONO },
  priceValue:  { color: "#fff", fontSize: 32, fontWeight: 700, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  priceLabel:  { color: C.textMute, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, marginLeft: "auto" },

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
