"use client";
import { useEffect, useMemo, useState } from "react";

// Persisted keys — shared with the main App.js so a user who set tokens there
// doesn't have to set them again here.
const KEY_FINVIZ    = "hi_finviz_key";
const KEY_ANTHROPIC = "hi_anthropic_key";

// Watchlist scan covers the 10 largest / most-traded names.
const WATCHLIST = ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "TSLA", "IBIT", "SMH", "AMZN", "META"];

// Columns surfaced in single-ticker table — must match Finviz CSV column names.
const COLS = [
  { key: "Strike",       label: "Strike",  numeric: true  },
  { key: "Type",         label: "Type",    numeric: false },
  { key: "Expiry",       label: "Expiry",  numeric: false },
  { key: "Bid",          label: "Bid",     numeric: true  },
  { key: "Ask",          label: "Ask",     numeric: true  },
  { key: "Volume",       label: "Volume",  numeric: true  },
  { key: "Open Int.",    label: "OI",      numeric: true  },
  { key: "IV",           label: "IV",      numeric: true  },
  { key: "Delta",        label: "Delta",   numeric: true  },
];

function num(v) {
  if (v == null || v === "") return Number.NaN;
  const n = parseFloat(String(v).replace("%", "").replace(",", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Per-chain anomaly detection.
 * Returns array of { row, reasons } for contracts matching ANY rule:
 *   - vol > 2 * OI           (real-time entry exceeding standing position)
 *   - IV  > 50               (high implied volatility)
 *   - vol >= 90th percentile (top 10% by volume within this ticker's chain)
 */
function detectAnomalies(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Pre-compute the 90th percentile for volume within this chain.
  const vols = rows.map((r) => num(r["Volume"])).filter((v) => Number.isFinite(v) && v > 0);
  vols.sort((a, b) => a - b);
  const p90 = vols.length > 0
    ? vols[Math.min(vols.length - 1, Math.floor(vols.length * 0.9))]
    : 0;

  const found = [];
  for (const row of rows) {
    const vol = num(row["Volume"]);
    const oi  = num(row["Open Int."]);
    const iv  = num(row["IV"]);
    const reasons = [];
    if (Number.isFinite(vol) && vol > 0 && Number.isFinite(oi) && oi > 0 && vol > 2 * oi) {
      reasons.push("V>2×OI");
    }
    if (Number.isFinite(iv) && iv > 50) {
      reasons.push("IV>50%");
    }
    if (Number.isFinite(vol) && vol > 0 && p90 > 0 && vol >= p90) {
      reasons.push("vol top10%");
    }
    if (reasons.length > 0) {
      found.push({ row, reasons });
    }
  }
  return found;
}

export default function OptionsPage() {
  // ----- credentials (persisted in localStorage) -----
  const [finvizKey, setFinvizKey]       = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

  // ----- single-ticker table state -----
  const [ticker, setTicker]     = useState("");
  const [expiry, setExpiry]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey]   = useState("Volume");
  const [sortDesc, setSortDesc] = useState(true);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // ----- watchlist scan state -----
  const [anomalies, setAnomalies] = useState([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);  // { done, total }
  const [scanError, setScanError] = useState("");

  // ----- Claude interaction state -----
  const [busyInterpretId, setBusyInterpretId] = useState(null);
  const [busyStrategyTicker, setBusyStrategyTicker] = useState(null);
  // Single floating result panel — most recent action wins.
  const [resultPanel, setResultPanel] = useState(null);  // { title, text, loading }

  // Load persisted keys on mount.
  useEffect(() => {
    try {
      setFinvizKey(localStorage.getItem(KEY_FINVIZ) || "");
      setAnthropicKey(localStorage.getItem(KEY_ANTHROPIC) || "");
    } catch {}
  }, []);

  function saveFinvizKey(v) {
    setFinvizKey(v);
    try { v ? localStorage.setItem(KEY_FINVIZ, v) : localStorage.removeItem(KEY_FINVIZ); } catch {}
  }
  function saveAnthropicKey(v) {
    setAnthropicKey(v);
    try { v ? localStorage.setItem(KEY_ANTHROPIC, v) : localStorage.removeItem(KEY_ANTHROPIC); } catch {}
  }

  // ----- single-ticker load -----
  async function load() {
    setError("");
    if (!ticker.trim())     { setError("Введи тикер"); return; }
    if (!finvizKey.trim())  { setError("Введи Finviz Elite token"); return; }
    setLoading(true); setRows([]);
    try {
      const res = await fetch("/api/finviz-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finvizKey: finvizKey.trim(),
          ticker: ticker.trim().toUpperCase(),
          expiry: expiry.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || `HTTP ${res.status}`);
      else setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setError(e.message || "Network error");
    }
    setLoading(false);
  }

  // ----- watchlist scan: parallel fetch across 10 tickers, run anomaly detector locally -----
  async function scanWatchlist() {
    setScanError("");
    if (!finvizKey.trim()) { setScanError("Введи Finviz Elite token"); return; }
    setScanLoading(true);
    setAnomalies([]);
    setScanProgress({ done: 0, total: WATCHLIST.length });

    // Parallel fetches; per-ticker failures don't abort the scan.
    let done = 0;
    const fetchOne = async (t) => {
      try {
        const res = await fetch("/api/finviz-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finvizKey: finvizKey.trim(), ticker: t }),
        });
        const data = await res.json();
        const out = res.ok && !data.error && Array.isArray(data.rows)
          ? { ticker: t, rows: data.rows }
          : { ticker: t, rows: [] };
        done += 1;
        setScanProgress({ done, total: WATCHLIST.length });
        return out;
      } catch {
        done += 1;
        setScanProgress({ done, total: WATCHLIST.length });
        return { ticker: t, rows: [] };
      }
    };
    const results = await Promise.all(WATCHLIST.map(fetchOne));

    // Detect anomalies per chain (each chain's own p90 baseline).
    const allAnomalies = [];
    for (const { ticker: tk, rows: chainRows } of results) {
      for (const a of detectAnomalies(chainRows)) {
        allAnomalies.push({ ticker: tk, row: a.row, reasons: a.reasons });
      }
    }

    // Sort by Volume desc — largest unusual activity first.
    allAnomalies.sort((a, b) => num(b.row["Volume"]) - num(a.row["Volume"]));

    setAnomalies(allAnomalies);
    setScanProgress(null);
    setScanLoading(false);
  }

  // ----- Claude interpretation of a single anomaly -----
  async function interpret(a, aId) {
    if (!anthropicKey.trim()) {
      setResultPanel({ title: "Ошибка", text: "Введи Anthropic API key наверху страницы.", loading: false });
      return;
    }
    setBusyInterpretId(aId);
    const title = `Интерпретация: $${a.ticker} ${a.row.Type} $${a.row.Strike} ${a.row.Expiry}`;
    setResultPanel({ title, text: "", loading: true });

    const c = a.row;
    const userMsg = [
      "Дай интерпретацию опционного контракта на русском.",
      "",
      `Тикер: $${a.ticker}`,
      `Тип: ${c.Type}`,
      `Страйк: $${c.Strike}`,
      `Экспирация: ${c.Expiry}`,
      `Volume: ${c.Volume}`,
      `Open Interest: ${c["Open Int."]}`,
      `IV: ${c.IV}`,
      `Delta: ${c.Delta}`,
      `Bid/Ask: ${c.Bid} / ${c.Ask}`,
      "",
      `Аномалии, по которым контракт попал в выборку: ${a.reasons.join(", ")}`,
      "",
      "Ответь коротко по структуре:",
      "1. Что означает эта позиция (на что ставит покупатель)",
      "2. Кто вероятно покупает (institutional / retail / hedge / market maker)",
      "3. Какое движение базового актива ожидается и за какой срок",
      "4. Risk / reward в общих чертах (без выдуманных цифр)",
      "",
      "Без воды. Без дисклеймеров. Если данных недостаточно — скажи прямо.",
    ].join("\n");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: anthropicKey.trim(),
          system: "Ты — опционный трейдер с 10-летним опытом. Объясняй короткими сильными предложениями на русском. Без воды, без дисклеймеров.",
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

  // ----- Claude strategy builder for one watchlist ticker -----
  async function buildStrategy(t) {
    if (!anthropicKey.trim()) {
      setResultPanel({ title: "Ошибка", text: "Введи Anthropic API key наверху страницы.", loading: false });
      return;
    }
    const tickerAnomalies = anomalies.filter((a) => a.ticker === t).slice(0, 5);
    if (tickerAnomalies.length === 0) {
      setResultPanel({
        title: `Стратегия для $${t}`,
        text: "Нет аномалий для построения стратегии. Запусти скан или выбери другой тикер.",
        loading: false,
      });
      return;
    }
    setBusyStrategyTicker(t);
    const title = `Стратегия для $${t} (на основе ${tickerAnomalies.length} аномалий)`;
    setResultPanel({ title, text: "", loading: true });

    const contractsBlock = tickerAnomalies.map((a, i) => {
      const c = a.row;
      return `${i + 1}. ${c.Type} strike $${c.Strike} exp ${c.Expiry} — vol ${c.Volume}, OI ${c["Open Int."]}, IV ${c.IV}, delta ${c.Delta}, bid/ask ${c.Bid}/${c.Ask}`;
    }).join("\n");

    const userMsg = [
      `Тикер: $${t}`,
      "Топ-5 аномальных опционных контрактов:",
      contractsBlock,
      "",
      "Предложи опционную стратегию на русском. ИСПОЛЬЗУЙ ТОЛЬКО эти 5 контрактов как ноги стратегии.",
      "",
      "Структура ответа:",
      "1. Название стратегии (bull call spread / covered call / iron condor / protective put / и т.д.)",
      "2. Конкретные ноги: какие из 5 контрактов берёшь, long или short",
      "3. Максимальный риск в долларах ИЛИ % от премии",
      "4. Потенциальная прибыль в долларах ИЛИ % от премии",
      "5. Win rate: высокий / средний / низкий + одна фраза почему",
      "6. Точка входа: при каком уровне базового актива входить",
      "7. Точка выхода: take profit и stop loss",
      "",
      "Тон: трейдер на трейдера, без воды. Запрещено выдумывать страйки или экспирации, которых нет в списке.",
    ].join("\n");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: anthropicKey.trim(),
          system: "Ты — опционный стратег. Строй мульти-leg стратегии используя ТОЛЬКО переданные контракты. Запрещено выдумывать страйки, экспирации или цены, которых нет в данных.",
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

  // ----- single-ticker derived views -----
  const visible = useMemo(() => {
    let out = rows;
    if (typeFilter !== "all") {
      out = out.filter((r) => (r.Type || "").toLowerCase() === typeFilter);
    }
    const col = COLS.find((c) => c.key === sortKey);
    if (col) {
      const cmp = col.numeric
        ? (a, b) => (num(a[sortKey]) - num(b[sortKey]))
        : (a, b) => String(a[sortKey]).localeCompare(String(b[sortKey]));
      out = [...out].sort((a, b) => (sortDesc ? -cmp(a, b) : cmp(a, b)));
    }
    return out;
  }, [rows, typeFilter, sortKey, sortDesc]);

  // Unique tickers in the current anomaly set (for strategy buttons).
  const anomalyTickers = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const a of anomalies) {
      if (!seen.has(a.ticker)) { seen.add(a.ticker); out.push(a.ticker); }
    }
    return out;
  }, [anomalies]);

  function setSort(key) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  return (
    <div style={S.page}>
      <h1 style={S.title}>Опционный деск</h1>
      <p style={S.subtitle}>
        Finviz Elite options chain · Watchlist-скан аномалий · Claude-интерпретация · конструктор стратегий.
      </p>

      {/* ===== Credentials ===== */}
      <div style={S.controls}>
        <label style={S.lbl}>
          Finviz Elite token
          <input
            style={S.inp}
            type="password"
            value={finvizKey}
            placeholder="из настроек Hedge Intel"
            onChange={(e) => saveFinvizKey(e.target.value)}
          />
        </label>
        <label style={S.lbl}>
          Anthropic API key
          <input
            style={S.inp}
            type="password"
            value={anthropicKey}
            placeholder="sk-ant-..."
            onChange={(e) => saveAnthropicKey(e.target.value)}
          />
        </label>
      </div>

      {/* ===== Section 1: Watchlist scan ===== */}
      <h2 style={S.h2}>1 · Watchlist скан</h2>
      <p style={S.note}>
        Аномалии = (Volume &gt; 2×OI) ИЛИ (IV &gt; 50%) ИЛИ (Volume в топ-10% цепочки тикера).
        Сканируются: {WATCHLIST.join(", ")}.
      </p>
      <div style={S.row}>
        <button style={S.btn} onClick={scanWatchlist} disabled={scanLoading}>
          {scanLoading ? "Сканирую…" : "Сканировать watchlist"}
        </button>
        {scanProgress ? (
          <span style={S.progress}>
            {scanProgress.done}/{scanProgress.total} тикеров
          </span>
        ) : null}
        {anomalies.length > 0 ? (
          <span style={S.count}>Аномалий: {anomalies.length} ({anomalyTickers.length} тикеров)</span>
        ) : null}
      </div>
      {scanError ? <div style={S.error}>{scanError}</div> : null}

      {/* Strategy chips: one per ticker with anomalies */}
      {anomalyTickers.length > 0 ? (
        <div style={S.chips}>
          <span style={S.chipsLabel}>Построить стратегию:</span>
          {anomalyTickers.map((t) => (
            <button
              key={t}
              style={S.chip}
              onClick={() => buildStrategy(t)}
              disabled={busyStrategyTicker === t}
            >
              {busyStrategyTicker === t ? `…` : `$${t}`}
            </button>
          ))}
        </div>
      ) : null}

      {/* Anomaly table */}
      {anomalies.length > 0 ? (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Ticker","Type","Strike","Expiry","Vol","OI","IV","Δ","Аномалии",""].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a, i) => {
                const aId = `${a.ticker}-${i}`;
                return (
                  <tr key={aId} style={i % 2 ? S.trAlt : S.tr}>
                    <td style={S.tdTicker}>${a.ticker}</td>
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

      {/* ===== Section 2: Single-ticker browser (existing) ===== */}
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
          Expiry (YYYY-MM-DD, опционально)
          <input
            style={S.inp}
            value={expiry}
            placeholder="2026-06-19"
            onChange={(e) => setExpiry(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </label>
        <button style={S.btn} onClick={load} disabled={loading}>
          {loading ? "Загрузка…" : "Загрузить"}
        </button>
      </div>

      <div style={S.filterRow}>
        <span style={S.filterLabel}>Тип:</span>
        {["all", "call", "put"].map((v) => (
          <label key={v} style={S.radioLabel}>
            <input
              type="radio"
              name="type"
              value={v}
              checked={typeFilter === v}
              onChange={() => setTypeFilter(v)}
            />
            {v === "all" ? "Все" : v === "call" ? "Call" : "Put"}
          </label>
        ))}
        <span style={S.count}>Строк: {visible.length}</span>
      </div>

      {error ? <div style={S.error}>{error}</div> : null}

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} style={S.th} onClick={() => setSort(c.key)}>
                  {c.label}
                  {sortKey === c.key ? (sortDesc ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td style={S.tdEmpty} colSpan={COLS.length}>{loading ? "…" : "Нет данных"}</td></tr>
            ) : visible.map((r, i) => (
              <tr key={i} style={i % 2 ? S.trAlt : S.tr}>
                {COLS.map((c) => (
                  <td key={c.key} style={c.numeric ? S.tdNum : S.td}>
                    {r[c.key] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Floating result panel for Claude responses ===== */}
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
  page:       { background: "#0d0e10", color: "#e6e6e6", minHeight: "100vh", padding: "24px 32px 64px", fontFamily: "system-ui, sans-serif" },
  title:      { margin: "0 0 4px", fontSize: 24, color: "#fff" },
  subtitle:   { margin: "0 0 20px", color: "#888", fontSize: 13 },
  h2:         { margin: "24px 0 8px", fontSize: 16, color: "#fff", borderBottom: "1px solid #2a2d33", paddingBottom: 6 },
  h3:         { margin: 0, fontSize: 14, color: "#fff" },
  note:       { margin: "0 0 12px", color: "#888", fontSize: 12 },
  controls:   { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 },
  row:        { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 },
  lbl:        { display: "flex", flexDirection: "column", fontSize: 12, color: "#aaa", gap: 4 },
  inp:        { padding: "8px 10px", background: "#1a1c20", color: "#e6e6e6", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 13, minWidth: 200 },
  btn:        { padding: "9px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnSm:      { padding: "5px 10px", background: "#374151", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: 500 },
  filterRow:  { display: "flex", gap: 16, alignItems: "center", marginBottom: 12, fontSize: 13 },
  filterLabel:{ color: "#888" },
  radioLabel: { display: "flex", gap: 4, alignItems: "center", cursor: "pointer", color: "#ddd" },
  count:      { color: "#666", fontSize: 12 },
  progress:   { color: "#3b82f6", fontSize: 12, fontWeight: 500 },
  chips:      { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12 },
  chipsLabel: { color: "#888", fontSize: 12 },
  chip:       { padding: "5px 12px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontSize: 12, fontWeight: 500 },
  error:      { padding: "8px 12px", background: "#3b1d1d", color: "#ff8888", borderRadius: 4, marginBottom: 12, fontSize: 13 },
  tableWrap:  { overflowX: "auto", border: "1px solid #2a2d33", borderRadius: 6, marginBottom: 12 },
  table:      { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:         { padding: "10px 12px", background: "#1a1c20", color: "#bbb", textAlign: "left", borderBottom: "1px solid #2a2d33", cursor: "pointer", userSelect: "none", fontWeight: 600, whiteSpace: "nowrap" },
  tr:         { background: "#0d0e10" },
  trAlt:      { background: "#121317" },
  td:         { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126" },
  tdNum:      { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  tdTicker:   { padding: "8px 12px", color: "#3b82f6", borderBottom: "1px solid #1f2126", fontWeight: 600 },
  tdEmpty:    { padding: "32px", color: "#666", textAlign: "center" },
  hr:         { border: "none", borderTop: "1px solid #2a2d33", margin: "32px 0" },
  resultPanel:{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a1c20", borderTop: "2px solid #3b82f6", padding: "12px 24px", maxHeight: "40vh", overflowY: "auto", boxShadow: "0 -4px 12px rgba(0,0,0,0.4)" },
  resultHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  resultText: { margin: 0, color: "#e6e6e6", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "system-ui, sans-serif" },
  resultLoading: { color: "#888", fontSize: 13, padding: "8px 0" },
};
