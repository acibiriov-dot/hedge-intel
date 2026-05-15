"use client";
import { useState, useRef } from "react";

const ENGINES = [
  { id: "core",        num: "01", label: "Core Intelligence",  icon: "⚡" },
  { id: "ticker",      num: "02", label: "Ticker Analysis",    icon: "📊" },
  { id: "technical",   num: "03", label: "Technical Engine",   icon: "📈" },
  { id: "options",     num: "04", label: "Options & Flow",     icon: "🎯" },
  { id: "smartmoney",  num: "05", label: "Smart Money",        icon: "🏦" },
  { id: "intermarket", num: "06", label: "Intermarket",        icon: "🌐" },
  { id: "altdata",     num: "07", label: "Alternative Data",   icon: "🔍" },
  { id: "probability", num: "08", label: "Probability Model",  icon: "🎲" },
  { id: "narrative",   num: "09", label: "Narrative Velocity", icon: "📡" },
  { id: "telegram",    num: "10", label: "Telegram Alpha",     icon: "✈️" },
];

const getNow = () => new Date().toLocaleString("ru-RU", {
  day: "2-digit", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
});

const getMasterSystem = () => `Ты — AI Hedge Fund Intelligence Operating System.
Дата: ${getNow()} (Москва)
Правила:
- Используй веб-поиск для РЕАЛЬНЫХ актуальных данных
- Указывай источник для ключевых цифр
- Максимум 400 слов на ответ
- Только русский язык
- НИКОГДА не выдумывай цены и цифры
- Tone: elite hedge fund intelligence desk`;

const PROMPTS = {
  core: (t) => `Найди через веб-поиск: полное название компании ${t}, текущая цена, market cap, главные новости за 30 дней.

## КОМПАНИЯ
Полное название и тикер · Цена $X (источник) · Market cap · Сектор

## ЧТО РЫНОК НЕ ВИДИТ
2-3 скрытых возможности которые рынок недооценивает

## ТОП-3 КАТАЛИЗАТОРА
Реальные события с датами из поиска

## ВЕРДИКТ
weak/interesting/strong/asymmetric + 2 предложения обоснования`,

  ticker: (t) => `Найди через веб-поиск: цена ${t} сейчас, 52W High/Low, analyst price targets, последний earnings report.

## ДАННЫЕ
Цена $X · 52W High/Low · Market cap · Analyst target средний/высокий

## ПОЧЕМУ ИНТЕРЕСНО
3-4 предложения на основе найденных данных

## БЛИЖАЙШИЕ СОБЫТИЯ
Реальные даты из поиска

## VERDICT
Оценка + обоснование`,

  technical: (t) => `Найди технические данные ${t}: текущая цена, объём, уровни SMA 50 и 200.

## ТЕХНИЧЕСКАЯ КАРТИНА
Тренд · SMA50 $X · SMA200 $X · Momentum

## КЛЮЧЕВЫЕ УРОВНИ
Поддержка $X · Сопротивление $X · Entry $X · Stop $X

## SMART MONEY
Accumulation или distribution по объёму и поведению цены?

## ВЫВОД
Bullish/Bearish/Neutral + конкретный entry уровень`,

  options: (t) => `Найди опционные данные ${t}: implied volatility, put/call ratio, необычная активность.

## OPTIONS СТРУКТУРА
IV % · Put/Call ratio · Крупнейшие OI уровни и страйки

## SQUEEZE ВЕРОЯТНОСТЬ
Short float % · Gamma squeeze / Short squeeze сигналы

## 2 КОНКРЕТНЫЕ СТРАТЕГИИ
Стратегия 1: тип, страйк $X, экспирация дата, премия ~$X
Стратегия 2: тип, страйк $X, экспирация дата, детали

## ВЫВОД`,

  smartmoney: (t) => `Найди: последние 13F изменения по ${t}, insider trades за 90 дней, short interest %.

## ИНСТИТУЦИОНАЛЫ
Кто купил и кто продал в последних 13F? Конкретные фонды.

## SHORT INTEREST
Short float % · Days to cover · Изменение vs прошлый месяц

## INSIDER ACTIVITY
Покупки или продажи менеджмента за последние 90 дней

## ВЫВОД
Smart money: accumulating / distributing / neutral`,

  intermarket: (t) => `Найди текущие macro данные: Fed funds rate, DXY уровень, US 10Y Treasury yield, VIX.

## MACRO СЕЙЧАС
Fed rate X% · DXY X · 10Y yield X% · VIX X — все с источниками

## ВЛИЯНИЕ НА ${t}
Конкретно как текущая macro среда помогает или мешает ${t}

## HIDDEN MACRO SIGNAL
Один неочевидный macro фактор влияющий на ${t}

## ВЫВОД
Macro tailwind / headwind / neutral`,

  altdata: (t) => `Найди альтернативные данные по ${t}: открытые вакансии LinkedIn, партнёрства и контракты за 90 дней.

## HIRING SIGNAL
Количество вакансий · Ключевые направления · Что говорит о стратегии

## КОНТРАКТЫ И ПАРТНЁРСТВА
Реальные из поиска за последние 3 месяца с суммами

## DIGITAL FOOTPRINT
Web traffic, GitHub, developer activity если применимо

## ТОП СИГНАЛ
Главный альтернативный сигнал который рынок игнорирует`,

  probability: (t) => `На основе доступных данных по ${t} построй реалистичные сценарии:

## СЦЕНАРИИ
🐻 BEAR (X%): конкретный триггер · цель $X · timing
📊 BASE (X%): конкретный триггер · цель $X · timing
🐂 BULL (X%): конкретный триггер · цель $X · timing
🚀 ASYMMETRIC (X%): black swan событие · цель $X

## REFLEXIVITY
FOMO trigger уровень · Panic trigger уровень

## ВЫВОД
Expected value · Лучший entry · Conviction: low/medium/high/very high`,

  narrative: (t) => `Найди текущий нарратив вокруг ${t} в Bloomberg/Reuters, X/Twitter, Reddit за последние 2 недели.

## НАРРАТИВ СЕЙЧАС
Доминирующий нарратив · Кто двигает (institutional/retail/media) · Crowded или early?

## MOMENTUM
Растёт или затухает интерес? На каком этапе хайп-цикла Gartner?

## CATALYST FOR MAINSTREAM
Что сделает ${t} известным широкой аудитории?

## ВЫВОД
Stage: early/building/peak/saturated + time to mainstream`,
};

function getTelegramPrompt(t, ctx) {
  return `Ты создаёшь профессиональный Telegram пост для инвестиционного канала @OKI_invest.
Дата: ${getNow()}

КОНТЕКСТ АНАЛИЗА (используй данные из ВСЕХ секций):
${ctx}

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
1. Цену бери ТОЛЬКО из [Ticker Analysis] — реальная текущая цена
2. Таргеты аналитиков — из [Ticker Analysis] или [Core Intelligence]
3. Опционные стратегии — из [Options & Flow] с реальными страйками
4. Риски — из [Probability Model]
5. Нарратив — из [Narrative Velocity]
6. Smart money данные — из [Smart Money]
7. НЕ ВЫДУМЫВАЙ данные. Только реальные цифры из контекста выше.
8. Каждый пункт ▸ должен содержать конкретную цифру из контекста.

ФОРМАТ (строго соблюдай структуру канала @OKI_invest):

🧠 [ТЕМА] DIGEST · [подзаголовок]
⠀
[Крючок 1-2 предложения — почему это важно прямо сейчас]
⠀
① ${t} · [Реальное полное название]
⠀
💲 Цена ~$[РЕАЛЬНАЯ ЦЕНА] · Таргет $[РЕАЛЬНЫЙ] · Апсайд +X%
⠀
[1-2 предложения суть идеи]
⠀
▸ [конкретный факт + реальная цифра из контекста]
▸ [конкретный факт + реальная цифра из контекста]
▸ [конкретный факт + реальная цифра из контекста]
▸ [конкретный факт + реальная цифра из контекста]
▸ [конкретный факт + реальная цифра из контекста]
⠀
⚠️ Риски: [конкретные риски с цифрами из Probability модуля]
⠀
⚙️ Опционные стратегии
⠀
[Стратегия 1 из Options модуля — страйк, экспирация, ~премия]
⠀
[Стратегия 2 из Options модуля — страйк, экспирация, детали]
⠀
👉 [Итоговый вывод 1-2 предложения]
⠀
#${t} #инвестиции #акции #опционы
⠀
*Не является инвестиционной рекомендацией. DYOR.*

---
## TELEGRAM POST
[только пост выше без этой строки]

## POSTER BRIEF
7 конкретных тезисов с реальными цифрами для комикс-постера:
1.
2.
3.
4.
5.
6.
7.`;
}

function extractPost(raw) {
  if (typeof raw !== "string") return "";
  const m = raw.match(/##\s*TELEGRAM POST\s*([\s\S]*?)(?=##\s*POSTER BRIEF|$)/i);
  return m ? m[1].trim() : raw.slice(0, 2000).trim();
}

function extractBrief(raw) {
  if (typeof raw !== "string") return "";
  const m = raw.match(/##\s*POSTER BRIEF\s*([\s\S]*?)$/i);
  return m ? m[1].trim() : raw.slice(-600).trim();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function App() {
  const [ticker, setTicker] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("@OKI_invest");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({});
  const [statuses, setStatuses] = useState({});
  const [posterUrl, setPosterUrl] = useState(null);
  const [posterLoading, setPosterLoading] = useState(false);
  const [tgStatus, setTgStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [appError, setAppError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editablePost, setEditablePost] = useState("");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState("");
  const dataRef = useRef({});
  const abortRef = useRef(null);

  const doneCount = Object.values(statuses).filter(s => ["done","timeout","error"].includes(s)).length;
  const allDone = doneCount === ENGINES.length;
  const pct = Math.round((doneCount / ENGINES.length) * 100);

  async function callEngine(prompt, useSearch) {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        system: getMasterSystem(),
        messages: [{ role: "user", content: prompt }],
        useSearch,
      }),
    });
    if (res.status === 429) return "__RATE_LIMIT__";
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Server error");
    }
    const data = await res.json();
    return data.text || "Анализ завершён.";
  }

  async function runEngine(eng, t, maxRetries) {
    setStatuses(p => ({ ...p, [eng.id]: "running" }));
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (abortRef.current?.signal.aborted) {
        setStatuses(p => ({ ...p, [eng.id]: "error" }));
        return;
      }
      try {
        const result = await callEngine(PROMPTS[eng.id](t), true);
        if (result === "__RATE_LIMIT__") {
          if (attempt < maxRetries) { await sleep(7000 + attempt * 5000); continue; }
          const msg = "⚠️ Rate limit. Нажми ↺ Повтор через минуту.";
          dataRef.current[eng.id] = msg;
          setResults(p => ({ ...p, [eng.id]: msg }));
          setStatuses(p => ({ ...p, [eng.id]: "error" }));
          return;
        }
        dataRef.current[eng.id] = result;
        setResults(p => ({ ...p, [eng.id]: result }));
        setStatuses(p => ({ ...p, [eng.id]: "done" }));
        if (!activeTab) setActiveTab(eng.id);
        return;
      } catch (err) {
        if (attempt < maxRetries) { await sleep(3000); continue; }
        const msg = "Ошибка: " + (err.message || "неизвестно");
        dataRef.current[eng.id] = msg;
        setResults(p => ({ ...p, [eng.id]: msg }));
        setStatuses(p => ({ ...p, [eng.id]: "error" }));
      }
    }
  }

  async function run() {
    if (!ticker.trim() || !apiKey.trim()) return;
    const t = ticker.trim().toUpperCase();
    setRunning(true);
    setResults({});
    dataRef.current = {};
    setActiveTab(null);
    setStatuses(Object.fromEntries(ENGINES.map(e => [e.id, "pending"])));
    setPosterUrl(null);
    setTgStatus(null);
    setAppError(null);
    setShowPreview(false);
    abortRef.current = new AbortController();

    const mainEngines = ENGINES.slice(0, 9);

    try {
      for (let i = 0; i < mainEngines.length; i += 3) {
        if (abortRef.current.signal.aborted) break;
        const batch = mainEngines.slice(i, i + 3);
        setPhase("Группа " + (Math.floor(i/3)+1) + "/3: " + batch.map(e => e.label.split(" ")[0]).join(", "));
        await Promise.all(batch.map(eng => runEngine(eng, t, 2)));
        if (i + 3 < mainEngines.length) await sleep(2000);
      }

      if (!abortRef.current.signal.aborted) {
        const tgEng = ENGINES[9];
        setPhase("Создаю Telegram пост...");
        setStatuses(p => ({ ...p, [tgEng.id]: "running" }));
        setActiveTab(tgEng.id);

        const ctx = mainEngines.map(e =>
          "[" + e.label + "]:\n" + (dataRef.current[e.id] || "нет данных").slice(0, 900)
        ).join("\n\n---\n\n");

        try {
          const result = await callEngine(getTelegramPrompt(t, ctx), false);
          dataRef.current[tgEng.id] = result;
          setResults(p => ({ ...p, [tgEng.id]: result }));
          setStatuses(p => ({ ...p, [tgEng.id]: "done" }));
        } catch (err) {
          setStatuses(p => ({ ...p, [tgEng.id]: "error" }));
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") setAppError(err.message);
    }

    setRunning(false);
    setPhase("");
  }

  async function retryEngine(engId) {
    const eng = ENGINES.find(e => e.id === engId);
    if (!eng || !ticker.trim() || !apiKey.trim()) return;
    const t = ticker.trim().toUpperCase();

    if (engId === "telegram") {
      setStatuses(p => ({ ...p, telegram: "running" }));
      setActiveTab("telegram");
      const mainEngines = ENGINES.slice(0, 9);
      const ctx = mainEngines.map(e =>
        "[" + e.label + "]:\n" + (dataRef.current[e.id] || "нет данных").slice(0, 900)
      ).join("\n\n---\n\n");
      try {
        const result = await callEngine(getTelegramPrompt(t, ctx), false);
        dataRef.current.telegram = result;
        setResults(p => ({ ...p, telegram: result }));
        setStatuses(p => ({ ...p, telegram: "done" }));
      } catch {
        setStatuses(p => ({ ...p, telegram: "error" }));
      }
    } else {
      await runEngine(eng, t, 3);
    }
  }

  async function genPoster() {
    if (!openaiKey || !dataRef.current.telegram) return;
    setPosterLoading(true);
    setPosterUrl(null);
    setAppError(null);
    try {
      const brief = extractBrief(dataRef.current.telegram);
      const prompt = `Marvel Comics style poster — vibrant, dynamic, bold headlines, action illustrations, comic panels. Title: ${ticker.toUpperCase()}. 5-6 panels each = one investment insight. Final verdict at bottom. Watermark: @OKI_invest. Content: ${brief}`;

      const res = await fetch("/api/poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiKey, prompt }),
      });
      const data = await res.json();
      if (!res.ok) { setAppError("Ошибка постера: " + (data.error || "неизвестно")); return; }
      if (data.data?.[0]?.b64_json) setPosterUrl("data:image/png;base64," + data.data[0].b64_json);
      else if (data.data?.[0]?.url) setPosterUrl(data.data[0].url);
      else setAppError("Постер не получен.");
    } catch (err) {
      setAppError("Ошибка постера: " + err.message);
    }
    setPosterLoading(false);
  }

  function openPreview() {
    const post = extractPost(dataRef.current.telegram || "");
    setEditablePost(post + "\n⠀\n[Подписаться на канал →](https://t.me/OKI_invest)");
    setShowPreview(true);
  }

  async function publish() {
    if (!tgToken || !tgChatId) return;
    setTgStatus("sending");
    setAppError(null);
    try {
      const body = { token: tgToken, chatId: tgChatId, text: editablePost };
      if (posterUrl && posterUrl.startsWith("data:")) {
        body.imageBase64 = posterUrl.split(",")[1];
      }
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "TG error");
      setTgStatus("sent");
      setShowPreview(false);
    } catch (err) {
      setAppError("Ошибка TG: " + err.message);
      setTgStatus("error");
    }
  }

  function copyText() {
    navigator.clipboard?.writeText(editablePost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const lines = ENGINES.map(e =>
      "=".repeat(50) + "\n" + e.num + ". " + e.label.toUpperCase() + "\n" + "=".repeat(50) + "\n\n" + (results[e.id] || "нет данных") + "\n"
    );
    const fileContent = "TICKER: " + ticker.toUpperCase() + "\nDATE: " + getNow() + "\n\n" + lines.join("\n");
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ticker.toUpperCase() + "_analysis.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const getBadge = (id) => {
    const s = statuses[id];
    if (s === "done")    return { text: "✓ Готово",    color: "#27ae60", border: "#27ae60", bg: "#f0fff4" };
    if (s === "running") return { text: "⟳ Анализ",   color: "#2980b9", border: "#3498db", bg: "#ebf5fb" };
    if (s === "timeout") return { text: "⏱ Таймаут",  color: "#e67e22", border: "#f39c12", bg: "#fef9e7" };
    if (s === "error")   return { text: "↺ Ошибка",   color: "#e74c3c", border: "#e74c3c", bg: "#fdf2f2" };
    return { text: "○ Ожидание", color: "#bbb", border: "#e0e0e0", bg: "#fafafa" };
  };

  const activeResult = activeTab && results[activeTab] ? String(results[activeTab]) : null;
  const activeEngine = ENGINES.find(e => e.id === activeTab);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f0", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a1a" }}>

      {/* HEADER */}
      <div style={{ background: "#1a1a2e", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#b8860b,#ffd700)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◈</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#ffd700", letterSpacing: 3 }}>HEDGE INTEL</div>
            <div style={{ fontSize: 10, color: "#8888aa", letterSpacing: 1 }}>ОКИ · REAL-TIME · BATCH 3×3</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, color: "#6666aa" }}>{getNow()}</div>
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: showSettings ? "#ffd700" : "transparent", border: "1px solid " + (showSettings ? "#ffd700" : "#444466"), color: showSettings ? "#1a1a2e" : "#aaaacc", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⚙ Настройки</button>
        </div>
      </div>

      {/* SETTINGS */}
      {showSettings && (
        <div style={{ background: "#fff", borderBottom: "2px solid #e0e0e0", padding: "20px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 4 }}>НАСТРОЙКИ API</div>
          <div style={{ fontSize: 12, color: "#27ae60", marginBottom: 14 }}>⚡ Batch 3×3 · 🔍 Веб-поиск · 🔄 Auto-retry · 🎨 GPT постеры · ✈️ Telegram</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Anthropic API Key *", val: apiKey, set: setApiKey, ph: "sk-ant-...", req: true },
              { label: "OpenAI API Key (постеры)", val: openaiKey, set: setOpenaiKey, ph: "sk-proj-..." },
              { label: "Telegram Bot Token", val: tgToken, set: setTgToken, ph: "1234567890:ABC..." },
              { label: "Telegram Chat ID", val: tgChatId, set: setTgChatId, ph: "@OKI_invest" },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: f.req ? "#c0392b" : "#555", marginBottom: 6 }}>{f.label}</label>
                <input type="password" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{ width: "100%", border: "1.5px solid " + (f.req && !f.val ? "#e74c3c" : "#d0d0d0"), borderRadius: 6, padding: "9px 12px", fontSize: 13, background: "#fafafa", boxSizing: "border-box", outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {apiKey && <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>✓ Anthropic</span>}
            {openaiKey && <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>✓ OpenAI</span>}
            {tgToken && <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>✓ Telegram</span>}
          </div>
        </div>
      )}

      {/* INPUT */}
      <div style={{ padding: "28px 24px 20px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>Введи тикер для анализа</div>
          <div style={{ fontSize: 13, color: "#888" }}>🔍 Веб-поиск · ⚡ Batch 3×3 · 🔄 Auto-retry · ~4-5 минут</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && !running && run()} placeholder="NBIS" maxLength={10}
            style={{ flex: 1, border: "2px solid " + (ticker ? "#1a1a2e" : "#d0d0d0"), borderRadius: 10, padding: "14px 20px", fontSize: 28, fontWeight: 700, letterSpacing: 8, textAlign: "center", color: "#1a1a2e", background: "#fff", outline: "none" }} />
          <button onClick={running ? () => { abortRef.current?.abort(); setRunning(false); } : run}
            disabled={!ticker.trim() || (!running && !apiKey.trim())}
            style={{ background: running ? "#e74c3c" : (apiKey && ticker) ? "#1a1a2e" : "#ccc", color: "#fff", border: "none", borderRadius: 10, padding: "14px 24px", fontSize: 14, fontWeight: 700, cursor: (apiKey && ticker) || running ? "pointer" : "not-allowed", minWidth: 110 }}>
            {running ? "⏹ Стоп" : "▶ Анализ"}
          </button>
        </div>
        {!apiKey && <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#856404", textAlign: "center" }}>⚠️ Добавь Anthropic API key в Настройки</div>}
        {appError && <div style={{ background: appError.startsWith("✓") ? "#d4edda" : "#fce4e4", border: "1px solid " + (appError.startsWith("✓") ? "#c3e6cb" : "#e74c3c"), borderRadius: 8, padding: "10px 14px", fontSize: 13, color: appError.startsWith("✓") ? "#155724" : "#c0392b", marginTop: 8 }}>{appError}</div>}

        {(running || doneCount > 0) && (
          <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: "#1a1a2e" }}>{running ? "⚡ " + (phase || "Анализирую...") : "✓ Анализ завершён"}</span>
              <span style={{ color: "#888" }}>{doneCount}/{ENGINES.length}</span>
            </div>
            <div style={{ height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: "linear-gradient(90deg,#1a1a2e,#4a90e2)", borderRadius: 3, transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}
      </div>

      {/* TABS + RESULTS */}
      {Object.keys(results).length > 0 && (
        <div style={{ padding: "0 24px", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", background: "#fff", borderRadius: "10px 10px 0 0", border: "1px solid #e0e0e0", borderBottom: "none", padding: "8px 8px 0" }}>
            {ENGINES.map(eng => {
              const s = statuses[eng.id];
              const hasDone = !!results[eng.id];
              const isSel = activeTab === eng.id;
              return (
                <button key={eng.id} onClick={() => hasDone && setActiveTab(eng.id)}
                  style={{ background: isSel ? "#1a1a2e" : s === "running" ? "#ebf5fb" : "transparent", color: isSel ? "#fff" : s === "running" ? "#2980b9" : hasDone ? "#333" : "#bbb", border: "none", borderRadius: "6px 6px 0 0", padding: "7px 10px", cursor: hasDone ? "pointer" : "default", fontSize: 11, fontWeight: isSel ? 700 : 500, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                  <span>{eng.icon}</span><span>{eng.num}</span>
                  {s === "running" && <span style={{ width: 6, height: 6, background: "#3498db", borderRadius: "50%", display: "inline-block" }} />}
                  {s === "done" && <span style={{ color: isSel ? "#7fff7f" : "#27ae60", fontSize: 10 }}>✓</span>}
                  {s === "error" && <span style={{ color: "#e74c3c", fontSize: 10 }}>↺</span>}
                </button>
              );
            })}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: "0 0 10px 10px", minHeight: 400, maxHeight: 560, overflowY: "auto", padding: "20px 24px" }}>
            {activeResult ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 18 }}>{activeEngine?.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>{activeEngine?.label}</span>
                  <span style={{ fontSize: 11, color: "#27ae60", background: "#f0fff0", padding: "2px 8px", borderRadius: 4, border: "1px solid #c3e6cb" }}>🔍 веб-поиск</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.8, color: "#2a2a2a", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{activeResult}</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, color: "#bbb", gap: 8 }}>
                <div style={{ fontSize: 32 }}>👆</div>
                <div style={{ fontSize: 14 }}>Выбери модуль выше</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACTIONS */}
      {allDone && !showPreview && (
        <div style={{ padding: "16px 24px", maxWidth: 960, margin: "0 auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {openaiKey && (
            <button onClick={genPoster} disabled={posterLoading} style={{ background: posterLoading ? "#95a5a6" : "#27ae60", color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: posterLoading ? "not-allowed" : "pointer" }}>
              {posterLoading ? "⟳ Генерирую постер..." : "🎨 Создать постер"}
            </button>
          )}
          <button onClick={openPreview} style={{ background: "#f39c12", color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>👁 Предпросмотр поста</button>
          <button onClick={download} style={{ background: "#fff", color: "#555", border: "1.5px solid #d0d0d0", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>↓ Скачать отчёт</button>
        </div>
      )}

      {/* POSTER */}
      {posterUrl && !showPreview && (
        <div style={{ padding: "0 24px 16px", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <img src={posterUrl} alt="poster" style={{ width: 200, borderRadius: 8, border: "1px solid #e0e0e0" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Постер готов · {ticker.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>gpt-image-1 · Marvel стиль · @OKI_invest</div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={posterUrl} download={ticker + "_poster.png"} style={{ background: "#1a1a2e", color: "#fff", padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>↓ Скачать</a>
                <button onClick={openPreview} style={{ background: "#f39c12", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>👁 Предпросмотр</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW */}
      {showPreview && (
        <div style={{ padding: "0 24px 24px", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ background: "#fff", border: "2px solid #f39c12", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ background: "#f39c12", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>👁 Предпросмотр · @OKI_invest</div>
              <button onClick={() => setShowPreview(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: posterUrl ? "220px 1fr" : "1fr" }}>
              {posterUrl && (
                <div style={{ padding: 16, borderRight: "1px solid #f0f0f0", background: "#fafafa" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>ПОСТЕР</div>
                  <img src={posterUrl} alt="poster" style={{ width: "100%", borderRadius: 8 }} />
                </div>
              )}
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>ТЕКСТ — РЕДАКТИРУЙ ПЕРЕД ПУБЛИКАЦИЕЙ</div>
                  <textarea value={editablePost} onChange={e => setEditablePost(e.target.value)}
                    style={{ width: "100%", minHeight: 420, border: "1.5px solid #d0d0d0", borderRadius: 8, padding: 14, fontSize: 13, fontFamily: "system-ui", lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                  <div style={{ fontSize: 11, color: "#aaa", textAlign: "right", marginTop: 4 }}>{editablePost.length} символов</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tgToken ? (
                    <button onClick={publish} disabled={tgStatus === "sending" || tgStatus === "sent"}
                      style={{ flex: 1, background: tgStatus === "sent" ? "#27ae60" : tgStatus === "error" ? "#e74c3c" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: tgStatus === "sending" || tgStatus === "sent" ? "not-allowed" : "pointer" }}>
                      {tgStatus === "sent" ? "✓ Опубликовано в @OKI_invest" : tgStatus === "sending" ? "⟳ Отправляю..." : tgStatus === "error" ? "✗ Ошибка" : "✈️ Опубликовать в @OKI_invest"}
                    </button>
                  ) : (
                    <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "11px 16px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠️ Добавь Telegram токен в Настройки</div>
                  )}
                  <button onClick={copyText} style={{ background: copied ? "#27ae60" : "#fff", color: copied ? "#fff" : "#555", border: "1.5px solid " + (copied ? "#27ae60" : "#d0d0d0"), borderRadius: 8, padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", minWidth: 110 }}>
                    {copied ? "✓ Скопировано" : "⎘ Копировать"}
                  </button>
                </div>
                {tgStatus === "sent" && (
                  <div style={{ background: "#d4edda", border: "1px solid #c3e6cb", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#155724", textAlign: "center", fontWeight: 600 }}>✓ Пост опубликован в @OKI_invest</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ENGINE GRID */}
      {Object.keys(statuses).length > 0 && (
        <div style={{ padding: "0 24px 32px", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {ENGINES.map(eng => {
              const b = getBadge(eng.id);
              const hasDone = !!results[eng.id];
              return (
                <div key={eng.id} onClick={() => hasDone && setActiveTab(eng.id)}
                  style={{ background: b.bg, border: "1.5px solid " + b.border, borderRadius: 8, padding: "10px 8px", textAlign: "center", cursor: hasDone ? "pointer" : "default", transition: "all 0.3s" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{eng.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#1a1a2e" }}>{eng.num}</div>
                  <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>{eng.label.split(" ")[0]}</div>
                  <div style={{ marginTop: 6, fontSize: 9, color: b.color, fontWeight: 700 }}>{b.text}</div>
                  {statuses[eng.id] === "error" && !running && (
                    <button onClick={e => { e.stopPropagation(); retryEngine(eng.id); }}
                      style={{ marginTop: 4, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 4, padding: "2px 8px", fontSize: 9, color: "#856404", cursor: "pointer", fontWeight: 700 }}>
                      ↺ Повтор
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        input:focus { border-color: #1a1a2e !important; box-shadow: 0 0 0 3px rgba(26,26,46,.1); }
        textarea:focus { border-color: #f39c12 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 2px; }
      `}</style>
    </div>
  );
}
