"use client";
import { useEffect, useMemo, useState } from "react";

// Reuses the existing Finviz key kept by App.js in localStorage under hi_finviz_key.
const KEY_STORAGE = "hi_finviz_key";

// Columns we surface in the table — order matches the spec.
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
  // Strip "%" so IV sorts numerically.
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

export default function OptionsPage() {
  const [finvizKey, setFinvizKey] = useState("");
  const [ticker, setTicker]       = useState("");
  const [expiry, setExpiry]       = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | call | put
  const [sortKey, setSortKey]     = useState("Volume");
  const [sortDesc, setSortDesc]   = useState(true);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // Pick up persisted Finviz key on mount.
  useEffect(() => {
    try { setFinvizKey(localStorage.getItem(KEY_STORAGE) || ""); } catch {}
  }, []);

  function saveKey(v) {
    setFinvizKey(v);
    try { if (v) localStorage.setItem(KEY_STORAGE, v); else localStorage.removeItem(KEY_STORAGE); } catch {}
  }

  async function load() {
    setError("");
    if (!ticker.trim()) { setError("Введи тикер"); return; }
    if (!finvizKey.trim()) { setError("Введи Finviz Elite token"); return; }
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
      if (!res.ok || data.error) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setRows(Array.isArray(data.rows) ? data.rows : []);
      }
    } catch (e) {
      setError(e.message || "Network error");
    }
    setLoading(false);
  }

  // Filter by type + sort by chosen column.
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

  function setSort(key) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  return (
    <div style={S.page}>
      <h1 style={S.title}>Опционный деск</h1>
      <p style={S.subtitle}>Finviz Elite — options chain, фильтр по Call/Put, сортировка по колонкам.</p>

      <div style={S.controls}>
        <label style={S.lbl}>
          Finviz Elite token
          <input
            style={S.inp}
            type="password"
            value={finvizKey}
            placeholder="из настроек Hedge Intel"
            onChange={(e) => saveKey(e.target.value)}
          />
        </label>
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
            placeholder="например 2026-06-19"
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
    </div>
  );
}

const S = {
  page:       { background: "#0d0e10", color: "#e6e6e6", minHeight: "100vh", padding: "24px 32px", fontFamily: "system-ui, sans-serif" },
  title:      { margin: "0 0 4px", fontSize: 24, color: "#fff" },
  subtitle:   { margin: "0 0 20px", color: "#888", fontSize: 13 },
  controls:   { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 },
  lbl:        { display: "flex", flexDirection: "column", fontSize: 12, color: "#aaa", gap: 4 },
  inp:        { padding: "8px 10px", background: "#1a1c20", color: "#e6e6e6", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 13, minWidth: 200 },
  btn:        { padding: "9px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  filterRow:  { display: "flex", gap: 16, alignItems: "center", marginBottom: 12, fontSize: 13 },
  filterLabel:{ color: "#888" },
  radioLabel: { display: "flex", gap: 4, alignItems: "center", cursor: "pointer", color: "#ddd" },
  count:      { marginLeft: "auto", color: "#666", fontSize: 12 },
  error:      { padding: "8px 12px", background: "#3b1d1d", color: "#ff8888", borderRadius: 4, marginBottom: 12, fontSize: 13 },
  tableWrap:  { overflowX: "auto", border: "1px solid #2a2d33", borderRadius: 6 },
  table:      { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:         { padding: "10px 12px", background: "#1a1c20", color: "#bbb", textAlign: "left", borderBottom: "1px solid #2a2d33", cursor: "pointer", userSelect: "none", fontWeight: 600, whiteSpace: "nowrap" },
  tr:         { background: "#0d0e10" },
  trAlt:      { background: "#121317" },
  td:         { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126" },
  tdNum:      { padding: "8px 12px", color: "#e6e6e6", borderBottom: "1px solid #1f2126", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  tdEmpty:    { padding: "32px", color: "#666", textAlign: "center" },
};
