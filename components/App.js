"use client";
import { useState, useRef } from "react";

const ENGINES = [
  { id: "core",        num: "01", label: "Основной анализ",  icon: "⚡" },
  { id: "ticker",      num: "02", label: "Анализ тикера",    icon: "📊" },
  { id: "technical",   num: "03", label: "Технический анализ",   icon: "📈" },
  { id: "options",     num: "04", label: "Опционы и поток",     icon: "🎯" },
  { id: "smartmoney",  num: "05", label: "Умные деньги",        icon: "🏦" },
  { id: "intermarket", num: "06", label: "Межрыночный анализ",        icon: "🌐" },
  { id: "altdata",     num: "07", label: "Альтернативные данные",   icon: "🔍" },
  { id: "probability", num: "08", label: "Модель вероятностей",  icon: "🎲" },
  { id: "narrative",   num: "09", label: "Нарратив", icon: "📡" },
  { id: "telegram",    num: "10", label: "Telegram пост",     icon: "✈️" },
];

const getNow = () => new Date().toLocaleString("ru-RU", {
  day: "2-digit", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
});

const getMasterSystem = () => `Ты — аналитик элитного хедж-фонда. Пишешь для русскоязычного инвестиционного Telegram-канала.
Дата: ${getNow()} (Москва)

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Используй веб-поиск для получения РЕАЛЬНЫХ актуальных данных
- Указывай источник для ключевых цифр (например: Yahoo Finance, Bloomberg, Reuters)
- Максимум 400 слов на раздел
- СТРОГО только русский язык — никаких английских терминов
- Переводи термины: Market cap → Рыночная капитализация, Revenue → Выручка, Earnings → Прибыль, Guidance → Прогноз, Backlog → Портфель заказов, Float → Доля в обращении, Short interest → Короткие позиции, Implied volatility → Ожидаемая волатильность, Put/Call ratio → Соотношение пут/колл, Open interest → Открытый интерес, Gamma squeeze → Гамма-сжатие, Short squeeze → Принудительное закрытие шортов, Institutional → Институциональный, Accumulation → Накопление, Distribution → Распределение, Bullish → Бычий, Bearish → Медвежий, Catalyst → Катализатор, Upside → Потенциал роста, Downside → Потенциал снижения, Target price → Целевая цена, Rating → Рейтинг, Upgrade → Повышение рейтинга, Downgrade → Понижение рейтинга
- НИКОГДА не выдумывай цены, цифры и события
- Тон: профессиональный, конкретный, без воды`;

const PROMPTS = {
  core: (t) => `Найди через веб-поиск: полное название компании ${t}, текущая цена, рыночная капитализация, главные новости за 30 дней.

## ПРОФИЛЬ КОМПАНИИ
Полное название и тикер · Цена $X (источник) · Рыночная капитализация · Сектор

## ЧТО РЫНОК НЕ ЗАМЕЧАЕТ
2-3 скрытых возможности которые рынок недооценивает прямо сейчас

## ТОП-3 КАТАЛИЗАТОРА
Реальные предстоящие события с датами из поиска

## ВЕРДИКТ
слабая идея / интересно / сильная идея / асимметричная возможность / потенциальный лидер рынка + 2 предложения обоснования`,

  ticker: (t) => `Найди через веб-поиск: цена ${t} сейчас, диапазон за 52 недели, целевые цены аналитиков, последний отчёт о прибыли.

## КЛЮЧЕВЫЕ ДАННЫЕ
Цена $X · Диапазон 52 нед: $X–$X · Рыночная капитализация · Целевая цена аналитиков

## ПОЧЕМУ ЭТО ИНТЕРЕСНО
3-4 предложения на основе найденных реальных данных

## БЛИЖАЙШИЕ СОБЫТИЯ
Реальные даты из поиска — отчёты, конференции, решения регуляторов

## ВЕРДИКТ
Оценка + обоснование`,

  technical: (t) => `Найди технические данные ${t}: текущая цена, объём торгов, уровни скользящих средних.

## ТЕХНИЧЕСКАЯ КАРТИНА
Тренд · СС50 $X · СС200 $X · Импульс движения

## КЛЮЧЕВЫЕ УРОВНИ
Поддержка $X · Сопротивление $X · Точка входа $X · Стоп-лосс $X

## ДЕЙСТВИЯ КРУПНЫХ ИГРОКОВ
Накопление или распределение судя по объёму и поведению цены?

## ВЫВОД
Бычий/Медвежий/Нейтральный + конкретный уровень входа`,

  options: (t) => `Найди данные по опционам ${t}: ожидаемая волатильность, соотношение пут/колл, открытый интерес, необычная активность.

## СТРУКТУРА ОПЦИОННОГО РЫНКА
Ожид. волатильность % · Соотношение пут/колл · Крупнейшие уровни открытого интереса

## ВЕРОЯТНОСТЬ СЖАТИЯ
Доля коротких позиций % · Сигналы гамма-сжатия / принудительного закрытия шортов

## 2 КОНКРЕТНЫЕ СТРАТЕГИИ
Стратегия 1: тип, страйк $X, дата экспирации, примерная премия ~$X
Стратегия 2: тип, страйк $X, дата экспирации, детали

## ВЫВОД`,

  smartmoney: (t) => `Найди: последние изменения позиций крупных фондов по ${t}, сделки инсайдеров за 90 дней, доля коротких позиций.

## ДЕЙСТВИЯ ИНСТИТУЦИОНАЛОВ
Кто из крупных фондов купил и кто продал в последних отчётах?

## КОРОТКИЕ ПОЗИЦИИ
Доля коротких позиций % · Дней до покрытия · Изменение за месяц

## ДЕЙСТВИЯ ИНСАЙДЕРОВ
Покупки или продажи менеджмента за последние 90 дней

## ВЫВОД
Крупные игроки: накапливают / распределяют / нейтральны`,

  intermarket: (t) => `Найди текущие макро данные: ставка ФРС, индекс доллара DXY, доходность 10-летних облигаций США, индекс страха VIX.

## МАКРО КАРТИНА СЕЙЧАС
Ставка ФРС X% · DXY X · Доходность 10 лет X% · VIX X — все с источниками

## ВЛИЯНИЕ НА ${t}
Конкретно как текущая макро среда помогает или мешает ${t}

## СКРЫТЫЙ МАКРО СИГНАЛ
Один неочевидный макро фактор влияющий на ${t}

## ВЫВОД
Макро попутный ветер / встречный ветер / нейтрально для ${t}`,

  altdata: (t) => `Найди альтернативные данные по ${t}: открытые вакансии на LinkedIn, партнёрства и контракты за 90 дней.

## СИГНАЛ ОТ НАЙМА
Количество вакансий · Ключевые направления найма · Что это говорит о стратегии компании

## КОНТРАКТЫ И ПАРТНЁРСТВА
Реальные сделки из поиска за последние 3 месяца с суммами

## ЦИФРОВОЙ СЛЕД
Трафик сайта, активность на GitHub, активность разработчиков если применимо

## ГЛАВНЫЙ СИГНАЛ
Один ключевой альтернативный сигнал который рынок игнорирует`,

  probability: (t) => `На основе доступных данных по ${t} построй реалистичные сценарии:

## СЦЕНАРИИ РАЗВИТИЯ

🐻 МЕДВЕЖИЙ (X%): конкретный триггер · цель $X · срок реализации
📊 БАЗОВЫЙ (X%): конкретный триггер · цель $X · срок реализации
🐂 БЫЧИЙ (X%): конкретный триггер · цель $X · срок реализации
🚀 АСИММЕТРИЧНЫЙ (X%): маловероятное событие · цель $X

## ПСИХОЛОГИЯ РЫНКА
Уровень срабатывания FOMO · Уровень паники и массовых продаж

## ВЫВОД
Ожидаемая доходность · Лучшая точка входа · Уверенность: низкая/средняя/высокая/очень высокая`,

  narrative: (t) => `Найди текущий нарратив вокруг ${t} в Bloomberg, Reuters, X/Twitter, Reddit за последние 2 недели.

## НАРРАТИВ СЕЙЧАС
Доминирующая история · Кто её двигает (институционалы/розница/СМИ) · Переполнен или ещё ранняя стадия?

## ДИНАМИКА ИНТЕРЕСА
Растёт или затухает интерес? На каком этапе цикла хайпа?

## КАТАЛИЗАТОР МАССОВОГО ПРИЗНАНИЯ
Что сделает ${t} известным широкой аудитории инвесторов?

## ВЫВОД
Стадия: ранняя / нарастающая / пиковая / насыщенная + время до мейнстрима`,
};;

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
      for (let i = 0; i < mainEngines.length; i++) {
        if (abortRef.current.signal.aborted) break;
        const eng = mainEngines[i];
        setPhase(eng.num + "/09: " + eng.label);
        await runEngine(eng, t, 3);
        if (i < mainEngines.length - 1) await sleep(1500);
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
          let result = await callEngine(getTelegramPrompt(t, ctx), false);
          // If rate limited, retry once after pause
          if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
            await sleep(10000);
            result = await callEngine(getTelegramPrompt(t, ctx), false);
          }
          if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
            result = "⚠️ Превышен лимит. Нажми ↺ Повтор на модуле 10.";
          }
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
        let result = await callEngine(getTelegramPrompt(t, ctx), false);
        if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
          await sleep(10000);
          result = await callEngine(getTelegramPrompt(t, ctx), false);
        }
        if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
          result = "⚠️ Превышен лимит. Нажми ↺ Повтор ещё раз через минуту.";
        }
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
    if (s === "running") return { text: "⟳ Анализирую",   color: "#2980b9", border: "#3498db", bg: "#ebf5fb" };
    if (s === "timeout") return { text: "⏱ Превышено время",  color: "#e67e22", border: "#f39c12", bg: "#fef9e7" };
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
              { label: "Ключ Anthropic API *", val: apiKey, set: setApiKey, ph: "sk-ant-...", req: true },
              { label: "Ключ OpenAI (постеры)", val: openaiKey, set: setOpenaiKey, ph: "sk-proj-..." },
              { label: "Токен Telegram бота", val: tgToken, set: setTgToken, ph: "1234567890:ABC..." },
              { label: "ID Telegram канала", val: tgChatId, set: setTgChatId, ph: "@OKI_invest" },
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
                <div style={{ fontSize: 14 }}>Выбери раздел выше</div>
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
              {posterLoading ? "⟳ Создаю постер..." : "🎨 Создать постер"}
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
                      {tgStatus === "sent" ? "✓ Опубликовано в @OKI_invest" : tgStatus === "sending" ? "⟳ Публикую..." : tgStatus === "error" ? "✗ Ошибка" : "✈️ Опубликовать в @OKI_invest"}
                    </button>
                  ) : (
                    <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "11px 16px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠️ Добавь Telegram токен в Настройки</div>
                  )}
                  <button onClick={copyText} style={{ background: copied ? "#27ae60" : "#fff", color: copied ? "#fff" : "#555", border: "1.5px solid " + (copied ? "#27ae60" : "#d0d0d0"), borderRadius: 8, padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", minWidth: 110 }}>
                    {copied ? "✓ Скопировано!" : "⎘ Копировать текст"}
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
