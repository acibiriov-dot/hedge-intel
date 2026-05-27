"use client";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Legend,
} from "recharts";

// Same access gate as other private pages.
const KEY_ACCESS = "hi_access";
const PASSWORD   = "okiinvest2026";

// Score weighting — see ШАГ 2.
const W_ANNUAL = 0.4;
const W_THETA  = 0.3;
const W_PROBIT = 0.3;

// Tier thresholds.
const TOP_PCT    = 0.20;  // top 20% by Score → BEST RISK/REWARD
const BOTTOM_PCT = 0.20;  // bottom 20% → AGGRESSIVE INCOME

// ---------- numeric / date helpers ----------

function num(v) {
  if (v == null || v === "") return Number.NaN;
  const n = parseFloat(String(v).replace("%", "").replace(",", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

function parseExpiry(s) {
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
  const sign = v < 0 ? "-" : "";
  return sign + "$" + Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

function fmtMoneyBig(v) {
  if (!Number.isFinite(v)) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(v, digits = 1, signed = false) {
  if (!Number.isFinite(v)) return "—";
  const s = (signed && v >= 0 ? "+" : "") + v.toFixed(digits) + "%";
  return s;
}

// ---------- strike scoring ----------

function isCall(r) { return (r.Type || "").toLowerCase() === "call"; }

/** Score = annualYield×0.4 + thetaEff×0.3 − probITM×0.3. */
function scoreContract(metrics) {
  return metrics.annualYield * W_ANNUAL
       + metrics.thetaEff   * W_THETA
       - metrics.probITM    * W_PROBIT;
}

/** Build candidate list of OTM calls with computed metrics. */
function buildCandidates(rows, currentPrice, today) {
  const cands = [];
  for (const r of rows) {
    if (!isCall(r)) continue;
    const strike = num(r.Strike);
    const bid    = num(r.Bid);
    const delta  = num(r.Delta);
    const theta  = num(r.Theta);
    const iv     = num(r.IV);
    const oi     = num(r["Open Int."]);
    const vol    = num(r.Volume);
    const exp    = parseExpiry(r.Expiry);
    if (!Number.isFinite(strike) || strike <= currentPrice) continue; // OTM only
    if (!Number.isFinite(bid) || bid <= 0) continue;
    if (!Number.isFinite(delta) || !Number.isFinite(theta) || !exp) continue;
    const dte = daysBetween(exp, today);
    if (dte < 1) continue;

    const premYield   = (bid / currentPrice) * 100;
    const annualYield = premYield * (365 / dte);
    const probITM     = Math.abs(delta) * 100;
    const thetaEff    = (Math.abs(theta) / bid) * 100; // % of premium decayed per day
    const m = {
      raw: r,
      strike, bid, delta, theta, iv, oi, vol, exp, dte,
      premYield, annualYield, probITM, thetaEff,
    };
    m.score = scoreContract(m);
    cands.push(m);
  }
  return cands;
}

/** Assign tier to each candidate by Score quintile. Returns array sorted by Score desc. */
function classifyCandidates(cands) {
  if (!cands.length) return [];
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const n = sorted.length;
  const topN    = Math.max(1, Math.ceil(n * TOP_PCT));
  const bottomN = Math.max(1, Math.ceil(n * BOTTOM_PCT));
  return sorted.map((c, i) => ({
    ...c,
    tier: i < topN ? "best" : (i >= n - bottomN ? "aggressive" : "balanced"),
  }));
}

// ---------- IV intelligence ----------

function meanIV(rows) {
  const ivs = rows.map((r) => num(r.IV)).filter((v) => Number.isFinite(v) && v > 0);
  if (!ivs.length) return null;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

function ivVerdict(strikeIV, chainIV) {
  if (!Number.isFinite(strikeIV) || !Number.isFinite(chainIV) || chainIV === 0) {
    return { color: "muted", text: "IV данных недостаточно" };
  }
  const ratio = strikeIV / chainIV;
  if (ratio > 1.3) return {
    color: "good",
    text: "Премии сейчас дорогие — хороший момент для продажи",
    ratio,
  };
  if (ratio < 0.8) return {
    color: "bad",
    text: "Covered Call сейчас неэффективен — IV слишком низкая",
    ratio,
  };
  return { color: "neutral", text: "IV умеренная — стандартные условия", ratio };
}

// ---------- payoff at expiry ----------

function payoffPoints(currentPrice, strike, bid) {
  const lo = currentPrice * 0.70;
  const hi = currentPrice * 1.30;
  const steps = 81;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const px = lo + (hi - lo) * (i / (steps - 1));
    // Covered Call P&L at expiry, per 100 shares:
    //   if px <= strike: (px - currentPrice + bid) × 100
    //   if px >  strike: (strike - currentPrice + bid) × 100  (capped)
    const cc = px <= strike
      ? (px - currentPrice + bid) * 100
      : (strike - currentPrice + bid) * 100;
    const bh = (px - currentPrice) * 100;
    out.push({ price: parseFloat(px.toFixed(2)), cc: Math.round(cc * 100) / 100, bh: Math.round(bh * 100) / 100 });
  }
  return out;
}

// ===========================================================================

export default function CoveredCall() {
  // ----- access gate -----
  const [hasAccess, setHasAccess]         = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ----- data state -----
  const [ticker, setTicker]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [data, setData]       = useState(null); // {currentPrice, change, rows, fetched}
  const [selectedKey, setSelectedKey] = useState(null);

  // ----- AI -----
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText]       = useState("");

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
    setError(""); setData(null); setSelectedKey(null); setAiText("");
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Введите тикер"); return; }
    setLoading(true);
    try {
      const [optRes, qRes] = await Promise.all([
        fetch("/api/finviz-options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: t }) }),
        fetch("/api/finviz-quote",   { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: t }) }),
      ]);
      const optData = await optRes.json();
      const qData   = await qRes.json();
      if (optData.error) throw new Error("Опционы: " + optData.error);
      if (qData.error)   throw new Error("Котировки: " + qData.error);
      const rows = optData.rows || [];
      const qRows = qData.rows || [];
      if (!rows.length)  throw new Error("Опционная цепочка пуста");
      if (!qRows.length) throw new Error("Нет данных по цене");

      const last = qRows[qRows.length - 1];
      const prev = qRows.length > 1 ? qRows[qRows.length - 2] : null;
      const currentPrice = num(last.Close);
      if (!Number.isFinite(currentPrice)) throw new Error("Не удалось прочитать текущую цену");
      const prevClose = prev ? num(prev.Close) : Number.NaN;
      const change = Number.isFinite(prevClose) ? ((currentPrice - prevClose) / prevClose) * 100 : null;

      setData({
        ticker: t, currentPrice, change, rows,
        fetched: new Date(),
      });
    } catch (e) {
      setError(e.message || "Ошибка при загрузке");
    }
    setLoading(false);
  }

  // ----- derived: candidates + chain IV -----

  const today = useMemo(() => new Date(), [data]);
  const candidates = useMemo(() => {
    if (!data) return [];
    return classifyCandidates(buildCandidates(data.rows, data.currentPrice, today));
  }, [data, today]);
  const chainIV = useMemo(() => data ? meanIV(data.rows) : null, [data]);

  const selected = useMemo(() => {
    if (!selectedKey || !candidates.length) return null;
    return candidates.find((c) => candidateKey(c) === selectedKey) || null;
  }, [selectedKey, candidates]);

  // ----- AI analysis -----

  async function runAI() {
    if (!data || !selected) return;
    setAiLoading(true); setAiText("");
    const m = metricsBlock(selected, data.currentPrice);
    const iv = ivVerdict(selected.iv, chainIV);
    const userMsg = [
      `Тикер: ${data.ticker}, текущая цена: $${data.currentPrice.toFixed(2)}`,
      `Стратегия: Covered Call (продажа OTM колла, удержание 100 акций базиса).`,
      `Контракт: страйк $${selected.strike}, exp ${selected.raw.Expiry} (${selected.dte} дней), Bid $${selected.bid.toFixed(2)}, Delta ${selected.delta.toFixed(3)}, IV ${selected.iv?.toFixed(1)}%.`,
      "",
      "ВСЕ МЕТРИКИ ПОЗИЦИИ:",
      `  • Max Profit: $${m.maxProfit.toFixed(2)}`,
      `  • Annualized Yield: ${m.annualYield.toFixed(1)}%`,
      `  • Downside Protection: ${m.downsideProt.toFixed(2)}%`,
      `  • Probability Profit: ${m.probProfit.toFixed(1)}%`,
      `  • Expected Value: $${m.expectedValue.toFixed(2)}`,
      `  • Theta/день: $${m.thetaPerDay.toFixed(2)}`,
      `  • Breakeven: $${m.breakeven.toFixed(2)}`,
      `  • Return on Capital: ${m.roc.toFixed(2)}%`,
      `  • Score: ${selected.score.toFixed(1)} (категория: ${tierLabel(selected.tier)})`,
      "",
      `IV Intelligence: IV выбранного страйка ${selected.iv?.toFixed(1)}%, средняя IV цепочки ${chainIV?.toFixed(1)}%. Вердикт: ${iv.text}.`,
      "",
      "ОТВЕТЬ СТРОГО ПО ФОРМАТУ:",
      "",
      "Эта сделка подходит инвестору который: [3 пункта простым языком]",
      "Текущий рыночный контекст: [анализ ситуации по PCR/IV/настроениям]",
      "Риски: [конкретные риски этой сделки, не общие слова]",
      "Альтернативы: [если есть лучше — назови; если нет — скажи прямо]",
      "",
      "Только эти 4 раздела. Цифры — только из переданных данных. Без markdown bold-форматирования.",
    ].join("\n");

    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "Ты институциональный аналитик опционных стратегий. Отвечаешь по делу, без воды, на русском. Цифры — только из переданного блока. Без эмодзи в основном тексте.",
          messages: [{ role: "user", content: userMsg }],
          useSearch: false,
        }),
      });
      const j = await r.json();
      setAiText(j.text || j.error || "(пусто)");
    } catch (e) {
      setAiText("Ошибка: " + (e.message || "network"));
    }
    setAiLoading(false);
  }

  // ----- password gate render -----
  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>OPTIONS DECISION ENGINE</h1>
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
        <a href="/strategies"     style={S.navLink}>Strategies</a>
        <a href="/smart-strategy" style={S.navLink}>Smart Strategy</a>
        <a href="/options"        style={S.navLink}>Options Desk</a>
        <button style={S.navLink} onClick={logout}>Logout</button>
      </div>

      <div style={S.heading}>
        <div style={S.brand}>OPTIONS DECISION ENGINE</div>
        <div style={S.brandSub}>Covered Call · institutional grade</div>
      </div>

      {/* ===== Input ===== */}
      <div style={S.inputRow}>
        <input
          style={S.inpTicker}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading) analyze(); }}
          placeholder="TICKER"
          maxLength={10}
        />
        <button style={S.btnEmerald} onClick={analyze} disabled={loading}>
          {loading ? "ANALYZING…" : "ANALYZE"}
        </button>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {data && (
        <>
          {/* ===== Quote bar ===== */}
          <QuoteBar data={data} />

          {/* ===== Strike Ranking ===== */}
          <SectionTitle num="01" name="Smart Strike Ranking" hint={`${candidates.length} OTM calls scored`} />
          {candidates.length === 0 ? (
            <div style={S.empty}>Нет OTM коллов в цепочке.</div>
          ) : (
            <StrikeTable
              candidates={candidates}
              selectedKey={selectedKey}
              onSelect={(c) => { setSelectedKey(candidateKey(c)); setAiText(""); }}
            />
          )}

          {/* ===== Selected: chart, metrics, IV, AI ===== */}
          {selected && (
            <SelectedView
              data={data}
              selected={selected}
              chainIV={chainIV}
              aiText={aiText}
              aiLoading={aiLoading}
              onAI={runAI}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function QuoteBar({ data }) {
  const cost = data.currentPrice * 100;
  const chg = data.change;
  const chgColor = chg == null ? "#888" : chg >= 0 ? "#10b981" : "#ef4444";
  return (
    <div style={S.quoteBar}>
      <div style={S.quoteCell}>
        <div style={S.quoteKey}>SYMBOL</div>
        <div style={S.quoteValBig}>{data.ticker}</div>
      </div>
      <div style={S.quoteCell}>
        <div style={S.quoteKey}>LAST</div>
        <div style={S.quoteValBig}>{fmtMoney(data.currentPrice)}</div>
      </div>
      <div style={S.quoteCell}>
        <div style={S.quoteKey}>CHANGE</div>
        <div style={{ ...S.quoteValBig, color: chgColor }}>
          {chg == null ? "—" : fmtPct(chg, 2, true)}
        </div>
      </div>
      <div style={S.quoteCell}>
        <div style={S.quoteKey}>100 SHARES COST</div>
        <div style={S.quoteValBig}>{fmtMoneyBig(cost)}</div>
      </div>
    </div>
  );
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

function tierLabel(t) {
  if (t === "best")        return "BEST RISK/REWARD";
  if (t === "aggressive")  return "AGGRESSIVE INCOME";
  return "BALANCED";
}
function tierDot(t) {
  if (t === "best")        return { color: "#10b981", label: "●" };
  if (t === "aggressive")  return { color: "#ef4444", label: "●" };
  return { color: "#f59e0b", label: "●" };
}

function candidateKey(c) {
  return `${c.strike}|${c.raw.Expiry}`;
}

function StrikeTable({ candidates, selectedKey, onSelect }) {
  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Tier</th>
            <th style={S.th}>Strike</th>
            <th style={S.th}>Expiry</th>
            <th style={S.thNum}>DTE</th>
            <th style={S.thNum}>Premium</th>
            <th style={S.thNum}>Annual Y%</th>
            <th style={S.thNum}>Prob ITM%</th>
            <th style={S.thNum}>Score</th>
            <th style={S.thNum}>Delta</th>
            <th style={S.thNum}>Theta/day</th>
            <th style={S.thNum}>IV%</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const key = candidateKey(c);
            const isSel = key === selectedKey;
            const dot = tierDot(c.tier);
            return (
              <tr
                key={key}
                style={{ ...S.tr, ...(isSel ? S.trSelected : {}) }}
                onClick={() => onSelect(c)}
              >
                <td style={S.td}>
                  <span style={{ color: dot.color, marginRight: 6 }}>{dot.label}</span>
                  <span style={S.tierLabel}>{tierLabel(c.tier)}</span>
                </td>
                <td style={S.td}>{fmtMoney(c.strike)}</td>
                <td style={S.td}>{c.raw.Expiry}</td>
                <td style={S.tdNum}>{c.dte}</td>
                <td style={S.tdNum}>{fmtMoney(c.bid)}</td>
                <td style={S.tdNum}>{c.annualYield.toFixed(1)}</td>
                <td style={S.tdNum}>{c.probITM.toFixed(1)}</td>
                <td style={{ ...S.tdNum, color: "#10b981", fontWeight: 700 }}>{c.score.toFixed(1)}</td>
                <td style={S.tdNum}>{c.delta.toFixed(3)}</td>
                <td style={S.tdNum}>{fmtMoney(Math.abs(c.theta) * 100)}</td>
                <td style={S.tdNum}>{Number.isFinite(c.iv) ? c.iv.toFixed(1) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function metricsBlock(c, currentPrice) {
  const maxProfit    = (c.strike - currentPrice + c.bid) * 100;
  const annualYield  = c.annualYield;
  const downsideProt = (c.bid / currentPrice) * 100;
  const probProfit   = (1 - Math.abs(c.delta)) * 100;
  const probLoss     = Math.abs(c.delta) * 100;
  const maxLossRef   = (currentPrice - c.bid) * 100; // worst-case if stock → 0
  const expectedValue = (probProfit / 100) * maxProfit - (probLoss / 100) * maxLossRef;
  const thetaPerDay  = Math.abs(c.theta) * 100;
  const breakeven    = currentPrice - c.bid;
  const roc          = (maxProfit / (currentPrice * 100)) * 100;
  return { maxProfit, annualYield, downsideProt, probProfit, expectedValue, thetaPerDay, breakeven, roc };
}

function SelectedView({ data, selected, chainIV, aiText, aiLoading, onAI }) {
  const m = metricsBlock(selected, data.currentPrice);
  const iv = ivVerdict(selected.iv, chainIV);
  const points = useMemo(
    () => payoffPoints(data.currentPrice, selected.strike, selected.bid),
    [data.currentPrice, selected.strike, selected.bid]
  );
  const breakeven = m.breakeven;

  // Y domain bounds for ReferenceArea: span the data range.
  const ccVals = points.map((p) => p.cc);
  const bhVals = points.map((p) => p.bh);
  const yMin = Math.min(...ccVals, ...bhVals);
  const yMax = Math.max(...ccVals, ...bhVals);

  return (
    <>
      {/* ===== Payoff chart ===== */}
      <SectionTitle
        num="02"
        name="Payoff at Expiry"
        hint={`Strike ${fmtMoney(selected.strike)} · ${selected.dte}d to expiry`}
      />
      <div style={S.chartBox}>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={points} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2a25" vertical={false} />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#7a8b83", fontSize: 11 }}
              tickFormatter={(v) => "$" + v.toFixed(0)}
              stroke="#2a3a33"
            />
            <YAxis
              tick={{ fill: "#7a8b83", fontSize: 11 }}
              tickFormatter={(v) => (v >= 0 ? "+$" : "−$") + Math.abs(v).toFixed(0)}
              stroke="#2a3a33"
              width={60}
            />
            {/* Profit / loss zones for the covered call */}
            <ReferenceArea
              y1={0} y2={yMax}
              fill="#10b981" fillOpacity={0.06} stroke="none"
              ifOverflow="extendDomain"
            />
            <ReferenceArea
              y1={yMin} y2={0}
              fill="#ef4444" fillOpacity={0.06} stroke="none"
              ifOverflow="extendDomain"
            />
            <ReferenceLine y={0} stroke="#3a4a43" strokeWidth={1} />
            <ReferenceLine
              x={data.currentPrice}
              stroke="#7a8b83"
              strokeDasharray="2 4"
              label={{ value: "spot", position: "top", fill: "#7a8b83", fontSize: 10 }}
            />
            <ReferenceLine
              x={selected.strike}
              stroke="#10b981"
              strokeDasharray="2 4"
              label={{ value: "strike", position: "top", fill: "#10b981", fontSize: 10 }}
            />
            <ReferenceLine
              x={breakeven}
              stroke="#f59e0b"
              strokeDasharray="2 4"
              label={{ value: "BE", position: "top", fill: "#f59e0b", fontSize: 10 }}
            />
            <Line
              type="linear"
              dataKey="cc"
              stroke="#10b981"
              strokeWidth={2.4}
              dot={false}
              name="Covered Call"
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="bh"
              stroke="#7a8b83"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Buy & Hold"
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{
                background: "#0a1a12", border: "1px solid #2a3a33", borderRadius: 4,
                color: "#e6e6e6", fontSize: 12,
              }}
              labelFormatter={(v) => `Price ${fmtMoney(v)}`}
              formatter={(v, name) => [fmtMoney(v), name === "cc" ? "Covered Call" : "Buy & Hold"]}
            />
            <Legend
              wrapperStyle={{ color: "#7a8b83", fontSize: 11, paddingTop: 6 }}
              iconType="line"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ===== 8 Institutional Metrics ===== */}
      <SectionTitle num="03" name="Institutional Metrics" />
      <div style={S.metricsGrid}>
        <Metric k="Max Profit"          v={fmtMoney(m.maxProfit)}     sub="strike − spot + premium, × 100" />
        <Metric k="Annualized Yield"    v={fmtPct(m.annualYield)}     sub="premium yield × (365 / DTE)" />
        <Metric k="Downside Protection" v={fmtPct(m.downsideProt, 2)} sub="premium / spot" />
        <Metric k="Probability Profit"  v={fmtPct(m.probProfit, 1)}   sub="1 − |delta|" />
        <Metric k="Expected Value"      v={fmtMoney(m.expectedValue)} sub="prob-weighted P/L" />
        <Metric k="Theta / day"         v={fmtMoney(m.thetaPerDay)}   sub="time decay in our favor" />
        <Metric k="Breakeven"           v={fmtMoney(m.breakeven, 2)}  sub="spot − premium" />
        <Metric k="Return on Capital"   v={fmtPct(m.roc, 2)}          sub="max profit / cost basis" />
      </div>

      {/* ===== IV Intelligence ===== */}
      <SectionTitle num="04" name="IV Intelligence" />
      <IvPanel selected={selected} chainIV={chainIV} verdict={iv} />

      {/* ===== AI Analysis ===== */}
      <SectionTitle num="05" name="AI Analysis" />
      <div style={S.aiBox}>
        <button style={S.btnEmerald} onClick={onAI} disabled={aiLoading}>
          {aiLoading ? "RUNNING…" : "RUN AI ANALYSIS"}
        </button>
        {aiText && (
          <div style={S.aiResult}>
            <pre style={S.aiText}>{aiText}</pre>
          </div>
        )}
      </div>
    </>
  );
}

function Metric({ k, v, sub }) {
  return (
    <div style={S.metricCell}>
      <div style={S.metricKey}>{k}</div>
      <div style={S.metricVal}>{v}</div>
      {sub && <div style={S.metricSub}>{sub}</div>}
    </div>
  );
}

function IvPanel({ selected, chainIV, verdict }) {
  const dotColor = verdict.color === "good" ? "#10b981" : verdict.color === "bad" ? "#ef4444" : "#f59e0b";
  return (
    <div style={S.ivPanel}>
      <div style={S.ivGrid}>
        <div style={S.ivCell}>
          <div style={S.ivKey}>STRIKE IV</div>
          <div style={S.ivVal}>{Number.isFinite(selected.iv) ? selected.iv.toFixed(1) + "%" : "—"}</div>
        </div>
        <div style={S.ivCell}>
          <div style={S.ivKey}>CHAIN AVG IV</div>
          <div style={S.ivVal}>{Number.isFinite(chainIV) ? chainIV.toFixed(1) + "%" : "—"}</div>
        </div>
        <div style={S.ivCell}>
          <div style={S.ivKey}>RATIO</div>
          <div style={S.ivVal}>{verdict.ratio ? verdict.ratio.toFixed(2) + "×" : "—"}</div>
        </div>
      </div>
      <div style={{ ...S.ivVerdict, borderColor: dotColor, color: dotColor }}>
        <span style={{ marginRight: 8 }}>●</span>{verdict.text}
      </div>
    </div>
  );
}

// ============================================================================
// Styles — Bloomberg × Apple: dark emerald, graphite, mono numerics
// ============================================================================

const C = {
  bg:       "#0a1a12",  // dark emerald background
  bgPanel:  "#0f1f17",
  bgCell:   "#0a1610",
  border:   "#1f2a25",
  borderHi: "#2a3a33",
  emerald:  "#10b981",
  emeraldD: "#059669",
  amber:    "#f59e0b",
  red:      "#ef4444",
  text:     "#e6e6e6",
  textDim:  "#7a8b83",
  textMute: "#4a5a53",
  graphite: "#1a1a1a",
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
  heading:   { marginTop: 32, marginBottom: 24 },
  brand:     { fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: 2, fontFamily: FONT_MONO },
  brandSub:  { fontSize: 11, color: C.textDim, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" },

  lockBox: {
    maxWidth: 360, margin: "12vh auto 0", padding: "26px 30px",
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 4,
  },
  title:    { margin: 0, fontSize: 18, color: C.text, letterSpacing: 1.5, fontFamily: FONT_MONO, fontWeight: 700 },
  subtitle: { margin: "6px 0 0", color: C.textDim, fontSize: 12, letterSpacing: 0.5 },

  inp:        { padding: "9px 12px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 13, fontFamily: FONT_MONO },
  inpTicker:  { padding: "12px 16px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", width: 220, fontFamily: FONT_MONO, outline: "none" },
  btnEmerald: { padding: "12px 26px", background: C.emerald, color: "#000", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: FONT_MONO },

  errorInline: { color: C.red, marginTop: 8, fontSize: 12 },
  error: { padding: "10px 14px", background: "#1f0a0a", color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, marginTop: 16, fontSize: 12 },

  inputRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16 },

  // Quote bar
  quoteBar: {
    display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2,
    marginTop: 4, marginBottom: 28,
  },
  quoteCell:    { padding: "16px 20px", borderRight: `1px solid ${C.border}` },
  quoteKey:     { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6, fontFamily: FONT_MONO },
  quoteValBig:  { color: C.text, fontSize: 22, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: 0.5 },

  // Section heading
  sectionTitle: { display: "flex", alignItems: "baseline", gap: 12, margin: "32px 0 12px", borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  sectionNum:   { color: C.emerald, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO },
  sectionName:  { color: C.text, fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT_MONO },
  sectionHint:  { color: C.textDim, fontSize: 11, marginLeft: "auto", fontFamily: FONT_MONO },

  empty: { padding: 24, color: C.textDim, fontSize: 12, textAlign: "center" },

  // Table
  tableWrap: { overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 2 },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT_MONO },
  th:    { padding: "10px 12px", background: C.bgPanel, color: C.textDim, textAlign: "left",  borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" },
  thNum: { padding: "10px 12px", background: C.bgPanel, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" },
  tr:    { background: C.bgCell, cursor: "pointer" },
  trSelected: { background: "#0d2a1c", outline: `1px solid ${C.emerald}` },
  td:    { padding: "8px 12px", color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" },
  tdNum: { padding: "8px 12px", color: C.text, borderBottom: `1px solid ${C.border}`, textAlign: "right", whiteSpace: "nowrap" },
  tierLabel: { color: C.textDim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" },

  // Chart
  chartBox: {
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2,
    padding: "12px 14px 6px",
  },

  // Metrics grid 4×2
  metricsGrid: {
    display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2,
  },
  metricCell: { padding: "16px 18px", borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` },
  metricKey:  { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: FONT_MONO },
  metricVal:  { color: C.text, fontSize: 18, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: 0.5 },
  metricSub:  { color: C.textMute, fontSize: 10, marginTop: 6, fontFamily: FONT_MONO },

  // IV panel
  ivPanel:    { background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, padding: "16px 18px" },
  ivGrid:     { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: 14 },
  ivCell:     { borderRight: `1px solid ${C.border}`, paddingRight: 18 },
  ivKey:      { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, fontFamily: FONT_MONO },
  ivVal:      { color: C.text, fontSize: 18, fontWeight: 700, fontFamily: FONT_MONO },
  ivVerdict:  {
    padding: "10px 14px", border: "1px solid", borderRadius: 2,
    fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
    fontFamily: FONT_MONO,
  },

  // AI
  aiBox:    { background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 2, padding: 18 },
  aiResult: { marginTop: 16, background: C.bgCell, border: `1px solid ${C.border}`, borderRadius: 2, padding: "14px 18px" },
  aiText:   { margin: 0, color: C.text, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: FONT_SANS },
};
