"use client";
import { useEffect, useMemo, useState } from "react";

// Persisted keys — shared with the main App.js so a user who set tokens there
// doesn't have to set them again here.
const KEY_FINVIZ    = "hi_finviz_key";
const KEY_ANTHROPIC = "hi_anthropic_key";

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
ВАЖНО: [главный риск одним предложением]`;

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
  // ----- credentials -----
  const [finvizKey, setFinvizKey]       = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");

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
  const [anomalies, setAnomalies]       = useState([]);  // global top-10 by score
  const [tickerStats, setTickerStats]   = useState({});
  const [scanLoading, setScanLoading]   = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanError, setScanError]       = useState("");

  // ----- Claude interaction -----
  const [busyInterpretId, setBusyInterpretId] = useState(null);
  const [busyStrategyTicker, setBusyStrategyTicker] = useState(null);
  const [resultPanel, setResultPanel] = useState(null);

  // Load persisted keys + compute expiry dropdown on mount (client-only).
  useEffect(() => {
    try {
      setFinvizKey(localStorage.getItem(KEY_FINVIZ) || "");
      setAnthropicKey(localStorage.getItem(KEY_ANTHROPIC) || "");
    } catch {}
    setExpiryOptions(computeExpiryOptions(new Date(), 6));
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
    setSingleError("");
    if (!ticker.trim())     { setSingleError("Введи тикер"); return; }
    if (!finvizKey.trim())  { setSingleError("Введи Finviz Elite token"); return; }
    setSingleLoading(true);
    setSingleAnomalies([]);
    setSingleStats(null);
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

  // ----- watchlist scan -----
  async function scanWatchlist() {
    setScanError("");
    if (!finvizKey.trim()) { setScanError("Введи Finviz Elite token"); return; }
    setScanLoading(true);
    setAnomalies([]);
    setTickerStats({});
    setScanProgress({ done: 0, total: WATCHLIST.length });

    // Parallel fetches; per-ticker failure doesn't abort the scan.
    // NOTE: scan never passes the `expiry` param — we want the FULL chain so
    // PCR and OI-magnet calcs are aggregate. Horizon filtering is applied
    // CLIENT-side after we have all the data.
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

    const today = new Date();
    const all = [];
    const statsMap = {};
    for (const { ticker: tk, rows: chainRows } of results) {
      if (!chainRows.length) continue;
      const stats = chainStats(chainRows);
      const scored = detectAnomalies(chainRows, stats, horizon, today);
      statsMap[tk] = {
        pcr:           stats.pcr,
        maxOIStrike:   stats.maxOIStrike,
        maxOI:         stats.maxOI,
        anomalyCount:  scored.length,
        dominant:      dominantSignal(stats, scored.length),
      };
      for (const a of scored) all.push({ ticker: tk, ...a });
    }
    all.sort((a, b) => b.score - a.score);
    // Global top-N across all watchlist tickers.
    setAnomalies(all.slice(0, TOP_N));
    setTickerStats(statsMap);
    setScanProgress(null);
    setScanLoading(false);
  }

  // ----- Claude interpretation: plain-language template, no jargon -----
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
          apiKey: anthropicKey.trim(),
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
  async function buildStrategy(t, contractsList = null) {
    if (!anthropicKey.trim()) {
      setResultPanel({ title: "Ошибка", text: "Введи Anthropic API key наверху страницы.", loading: false });
      return;
    }
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
      `Тикер: $${t}`,
      `Топ-${top5.length} аномальных контрактов (ВСЕ колонки из Finviz CSV):`,
      "",
      contractsBlock,
      "",
      "Выбери лучший контракт для стратегии и предложи план по шаблону из system prompt.",
      "Все цифры в стратегии — точные значения из данных или расчёты по правилам.",
    ].join("\n");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: anthropicKey.trim(),
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

  return (
    <div style={S.page}>
      <h1 style={S.title}>Опционный деск</h1>
      <p style={S.subtitle}>
        Скоринг 0-100 · 🐂 / 🐻 / ⚡ сигналы · Claude-интерпретация простым языком ·
        конструктор стратегий с реальными деньгами.
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

      {/* ===== Section 1: Watchlist scan ===== */}
      <h2 style={S.h2}>1 · Watchlist скан</h2>
      <p style={S.note}>
        Скоринг 0-100: Vol/OI &gt; 10× (+40), &gt; 5× (+25) · IV &gt; 80% (+20), &gt; 50% (+10) ·
        Vol топ-5% (+20), топ-10% (+10) · экспирация &gt; 7 дней (+10).
        Top-{TOP_N} по Score. Тикеры: {WATCHLIST.join(", ")}.
      </p>
      <div style={S.row}>
        <button style={S.btn} onClick={scanWatchlist} disabled={scanLoading}>
          {scanLoading ? "Сканирую…" : "Сканировать watchlist"}
        </button>
        {scanProgress ? (
          <span style={S.progress}>{scanProgress.done}/{scanProgress.total} тикеров</span>
        ) : null}
        {anomalies.length > 0 ? (
          <span style={S.count}>Топ-{anomalies.length} из {anomalyTickers.length} тикеров</span>
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

      {/* Top-3 spotlight (subset of top-10) */}
      {anomalies.length > 0 ? (
        <>
          <h3 style={S.h3Section}>Топ-3 интересных аномалии</h3>
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

      {/* Top-N anomaly table */}
      {anomalies.length > 0 ? (
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
  page:       { background: "#0d0e10", color: "#e6e6e6", minHeight: "100vh", padding: "24px 32px 64px", fontFamily: "system-ui, sans-serif" },
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
};
