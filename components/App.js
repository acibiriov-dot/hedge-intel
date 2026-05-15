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

const getMasterSystem = () => `Ты - аналитик элитного хедж-фонда. Пишешь для русскоязычного инвестиционного Telegram-канала.
Дата: ${getNow()} (Москва)

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
- Используй веб-поиск для получения РЕАЛЬНЫХ актуальных данных
- Указывай источник для ключевых цифр (например: Yahoo Finance, Bloomberg, Reuters)
- Максимум 400 слов на раздел
- СТРОГО только русский язык - никаких английских терминов
- Переводи термины: Market cap -> Рыночная капитализация, Revenue -> Выручка, Earnings -> Прибыль, Guidance -> Прогноз, Backlog -> Портфель заказов, Float -> Доля в обращении, Short interest -> Короткие позиции, Implied volatility -> Ожидаемая волатильность, Put/Call ratio -> Соотношение пут/колл, Open interest -> Открытый интерес, Gamma squeeze -> Гамма-сжатие, Short squeeze -> Принудительное закрытие шортов, Institutional -> Институциональный, Accumulation -> Накопление, Distribution -> Распределение, Bullish -> Бычий, Bearish -> Медвежий, Catalyst -> Катализатор, Upside -> Потенциал роста, Downside -> Потенциал снижения, Target price -> Целевая цена, Rating -> Рейтинг, Upgrade -> Повышение рейтинга, Downgrade -> Понижение рейтинга
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
Цена $X · Диапазон 52 нед: $X-$X · Рыночная капитализация · Целевая цена аналитиков

## ПОЧЕМУ ЭТО ИНТЕРЕСНО
3-4 предложения на основе найденных реальных данных

## БЛИЖАЙШИЕ СОБЫТИЯ
Реальные даты из поиска - отчёты, конференции, решения регуляторов

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
Ставка ФРС X% · DXY X · Доходность 10 лет X% · VIX X - все с источниками

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

function getTelegramPrompts(t, ctx) {
  const base = `Создай ТРИ Telegram поста для канала @OKI_invest по тикеру ${t}.
Дата: ${getNow()}

ДАННЫЕ ДЛЯ ПОСТОВ:
${ctx.slice(0, 5000)}

СТРОГО СОБЛЮДАЙ СТРУКТУРУ - три секции с точными заголовками:

## ПОСТ 1
🧠 [ТЕМА] DIGEST · [подзаголовок]

[Крючок - 1-2 предложения]

① ${t} · [Полное название]
💲 Цена ~$X · Таргет $X · Потенциал +X%

▸ [факт + цифра из данных]
▸ [факт + цифра из данных]
▸ [факт + цифра из данных]

👉 Подробный разбор - в следующем посте ↓

## ПОСТ 2
📊 ${t} · Детальный разбор

💰 ФИНАНСЫ И РОСТ
▸ [данные о выручке и росте]
▸ [данные о прогнозе]
▸ [данные об аналитиках]

🏦 ИНСТИТУЦИОНАЛЬНЫЙ КАПИТАЛ
▸ [кто покупает/продаёт]
▸ [короткие позиции]

📊 СЦЕНАРИИ
🐻 Медвежий (X%): [триггер · цель $X]
📊 Базовый (X%): [триггер · цель $X]
🐂 Бычий (X%): [триггер · цель $X]

⚠️ Риски: [конкретно с цифрами]

👉 Торговые стратегии - в следующем посте ↓

## ПОСТ 3
⚙️ ${t} · Торговые стратегии

📈 ТЕХНИЧЕСКИЙ АНАЛИЗ
Тренд: [бычий/медвежий/нейтральный]
Поддержка: $X · Сопротивление: $X · Стоп: $X

⚙️ ОПЦИОННЫЕ СТРАТЕГИИ

Стратегия 1 - [название]
[страйк $X, экспирация дата, премия ~$X, макс прибыль $X]

Стратегия 2 - [название]
[страйк $X, экспирация дата, безубыток $X]

📋 ИТОГ: [2-3 предложения финального вывода]

#${t} #инвестиции #акции #опционы

*Не является инвестиционной рекомендацией. DYOR.*`;
  return base;
}

function cleanForTelegram(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

function extractPost(raw) {
  if (typeof raw !== "string") return "";
  const m = raw.match(/##\s*TELEGRAM POST\s*([\s\S]*?)(?=##\s*POSTER BRIEF|$)/i);
  return m ? m[1].trim() : raw.slice(0, 2000).trim();
}

function extractThreePosts(raw) {
  if (typeof raw !== "string") return { post1: "", post2: "", post3: "" };
  const p1match = raw.match(/##\s*ПОСТ 1[^\n]*\n([\s\S]*?)(?=##\s*ПОСТ 2|$)/i);
  const p2match = raw.match(/##\s*ПОСТ 2[^\n]*\n([\s\S]*?)(?=##\s*ПОСТ 3|$)/i);
  const p3match = raw.match(/##\s*ПОСТ 3[^\n]*\n([\s\S]*?)$/i);
  return {
    post1: p1match ? p1match[1].trim() : "",
    post2: p2match ? p2match[1].trim() : "",
    post3: p3match ? p3match[1].trim() : "",
  };
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
  const [editablePost2, setEditablePost2] = useState("");
  const [editablePost3, setEditablePost3] = useState("");
  const [activePostTab, setActivePostTab] = useState(1);
  const [copied, setCopied] = useState(false);
  const [copied2, setCopied2] = useState(false);
  const [copied3, setCopied3] = useState(false);
  const [tgStatus2, setTgStatus2] = useState(null);
  const [tgStatus3, setTgStatus3] = useState(null);
  const [posterUrl2, setPosterUrl2] = useState(null);
  const [posterLoading2, setPosterLoading2] = useState(false);
  const [posterUrl3, setPosterUrl3] = useState(null);
  const [posterLoading3, setPosterLoading3] = useState(false);
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
    setPosterUrl2(null);
    setPosterUrl3(null);
    setTgStatus(null);
    setTgStatus2(null);
    setTgStatus3(null);
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
        setPhase("Пауза перед созданием поста...");
        await sleep(15000);
        setPhase("Создаю Telegram пост...");
        setStatuses(p => ({ ...p, [tgEng.id]: "running" }));
        setActiveTab(tgEng.id);

        const ctx = mainEngines.map(e =>
          "[" + e.label + "]:\n" + (dataRef.current[e.id] || "нет данных").slice(0, 900)
        ).join("\n\n---\n\n");

        try {
          let result = await callEngine(getTelegramPrompts(t, ctx), false);
          // If rate limited, retry once after pause
          if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
            await sleep(10000);
            result = await callEngine(getTelegramPrompts(t, ctx), false);
          }
          if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
            result = "⚠️ Превышен лимит. Нажми ↺ Повтор на модуле 10.";
          }
          dataRef.current[tgEng.id] = result;
          setResults(p => ({ ...p, [tgEng.id]: result }));
          const tgHasError = result.includes("Превышен лимит") || result.includes("__RATE_LIMIT__") || result.includes("Повтор") || result.includes("rate_limit");
          setStatuses(p => ({ ...p, [tgEng.id]: tgHasError ? "error" : "done" }));
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
        let result = await callEngine(getTelegramPrompts(t, ctx), false);
        if (result === "__RATE_LIMIT__" || result.includes("__RATE_LIMIT__")) {
          await sleep(10000);
          result = await callEngine(getTelegramPrompts(t, ctx), false);
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

  async function buildPoster(promptText, setUrl, setLoading) {
    if (!openaiKey) return;
    setLoading(true);
    try {
      const res = await fetch("/api/poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiKey, prompt: promptText }),
      });
      const data = await res.json();
      if (!res.ok) { setAppError("Ошибка постера: " + (data.error || "неизвестно")); }
      else if (data.data?.[0]?.b64_json) setUrl("data:image/png;base64," + data.data[0].b64_json);
      else if (data.data?.[0]?.url) setUrl(data.data[0].url);
      else setAppError("Постер не получен.");
    } catch (err) { setAppError("Ошибка постера: " + err.message); }
    setLoading(false);
  }

  async function genPoster() {
    const t = ticker.toUpperCase();
    const brief = editablePost.slice(0, 700);
    const prompt = `Editorial comic book infographic poster in dark dramatic style.

EXACT STYLE TO REPRODUCE:
- Dark background with high-contrast vivid illustrations
- Realistic detailed comic art (not cartoon) — like graphic novel editorial
- Large bold Russian title at top with colored highlight blocks (red/yellow)
- Main hero figure: confident businessman/analyst in dramatic pose dominating top section
- Structured information panels below with section headers in bold
- Each panel has detailed scene illustration + Russian text caption
- Small readable Russian text in info panels
- Dramatic lighting, space/financial district backgrounds
- Bottom section: bold conclusion in large text with dramatic framing
- Overall feels like a professional editorial comic magazine spread
- Aspect ratio: tall vertical poster

POSTER SUBJECT: ${t} company — teasер post
Create main character as confident analyst/investor discovering ${t}
Top section: dramatic reveal of the company
Middle panels: 3-4 key facts with illustrations
Bottom: bold conclusion

ALL TEXT MUST BE IN RUSSIAN. Watermark @OKI_invest bottom corner.

KEY FACTS TO ILLUSTRATE:
${brief}`;
    await buildPoster(prompt, setPosterUrl, setPosterLoading);
  }

  async function genPoster2() {
    const t = ticker.toUpperCase();
    const brief = editablePost2.slice(0, 700);
    const prompt = `Editorial comic book infographic poster in dark dramatic style.

EXACT STYLE TO REPRODUCE:
- Dark background with high-contrast vivid illustrations
- Realistic detailed comic art (not cartoon) — like graphic novel editorial
- Large bold Russian title at top: "АНАЛИЗ: ${t}" with colored highlight blocks
- Main hero: analyst with magnifying glass studying financial data
- Structured panels: ФИНАНСЫ, ИНСТИТУЦИОНАЛЫ, СЦЕНАРИИ sections with headers
- Each panel has detailed scene + readable Russian text
- Bull vs bear battle scene, institutional buildings, probability chart
- Bottom: bold verdict in large Russian text
- Professional editorial comic magazine style
- Tall vertical poster format

ALL TEXT IN RUSSIAN. Watermark @OKI_invest bottom corner.

KEY FACTS TO ILLUSTRATE:
${brief}`;
    await buildPoster(prompt, setPosterUrl2, setPosterLoading2);
  }

  async function genPoster3() {
    const t = ticker.toUpperCase();
    const brief = editablePost3.slice(0, 700);
    const prompt = `Editorial comic book infographic poster in dark dramatic style.

EXACT STYLE TO REPRODUCE:
- Dark background with high-contrast vivid illustrations  
- Realistic detailed comic art (not cartoon) — like graphic novel editorial
- Large bold Russian title at top: "СТРАТЕГИЯ: ${t}" with green/gold highlight blocks
- Main hero: confident trader executing strategy in dramatic pose
- Structured panels: ТЕХНИЧЕСКИЙ АНАЛИЗ, СТРАТЕГИЯ 1, СТРАТЕГИЯ 2, ИТОГ sections
- Price levels shown as targets with arrows, options as power-up items
- Detailed financial chart illustrations with support/resistance levels
- Bottom: bold call-to-action in large Russian text
- Professional editorial comic magazine style
- Tall vertical poster format

ALL TEXT IN RUSSIAN. Watermark @OKI_invest bottom corner.

KEY FACTS TO ILLUSTRATE:
${brief}`;
    await buildPoster(prompt, setPosterUrl3, setPosterLoading3);
  }

  async function genAllPosters() {
    setAppError(null);
    await genPoster();
    await new Promise(r => setTimeout(r, 5000));
    await genPoster2();
    await new Promise(r => setTimeout(r, 5000));
    await genPoster3();
  }

  function openPreview() {
    const raw = dataRef.current.telegram || "";
    const posts = extractThreePosts(raw);
    const subscribe = "\n\n[Подписаться на канал →](https://t.me/OKI_invest)";
    setEditablePost(posts.post1 || extractPost(raw));
    setEditablePost2(posts.post2 + subscribe);
    setEditablePost3(posts.post3 + subscribe);
    setActivePostTab(1);
    setTgStatus(null);
    setTgStatus2(null);
    setTgStatus3(null);
    setShowPreview(true);
  }

  async function publish() {
    if (!tgToken || !tgChatId) return;
    setTgStatus("sending");
    setAppError(null);
    try {
      const body = { token: tgToken, chatId: tgChatId, text: cleanForTelegram(editablePost) };
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

  async function publish2() {
    if (!tgToken || !tgChatId) return;
    setTgStatus2("sending");
    try {
      const body2 = { token: tgToken, chatId: tgChatId, text: cleanForTelegram(editablePost2) };
      if (posterUrl2 && posterUrl2.startsWith("data:")) {
        body2.imageBase64 = posterUrl2.split(",")[1];
      }
      const r = await fetch("/api/telegram", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body2),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "TG error");
      setTgStatus2("sent");
    } catch (err) { setAppError("Ошибка TG: " + err.message); setTgStatus2("error"); }
  }

  async function publish3() {
    if (!tgToken || !tgChatId) return;
    setTgStatus3("sending");
    try {
      const body3 = { token: tgToken, chatId: tgChatId, text: cleanForTelegram(editablePost3) };
      if (posterUrl3 && posterUrl3.startsWith("data:")) {
        body3.imageBase64 = posterUrl3.split(",")[1];
      }
      const r = await fetch("/api/telegram", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body3),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "TG error");
      setTgStatus3("sent");
    } catch (err) { setAppError("Ошибка TG: " + err.message); setTgStatus3("error"); }
  }

  async function genPoster2() {
    if (!openaiKey || !editablePost3) return;
    setPosterLoading2(true); setPosterUrl2(null);
    try {
      const brief = editablePost3.slice(0, 600);
      const prompt = "Marvel Comics style investment poster — bold headlines, action comic panels, vivid colors. Ticker: " + ticker.toUpperCase() + ". Focus: options strategies and technical analysis. Watermark: @OKI_invest. Content: " + brief;
      const res = await fetch("/api/poster", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiKey, prompt }),
      });
      const data = await res.json();
      if (!res.ok) { setAppError("Ошибка постера 2: " + (data.error || "неизвестно")); return; }
      if (data.data?.[0]?.b64_json) setPosterUrl2("data:image/png;base64," + data.data[0].b64_json);
      else if (data.data?.[0]?.url) setPosterUrl2(data.data[0].url);
    } catch (err) { setAppError("Ошибка постера 2: " + err.message); }
    setPosterLoading2(false);
  }

  async function publishAll() {
    setTgStatus(null);
    setTgStatus2(null);
    setTgStatus3(null);
    await publish();
    await new Promise(r => setTimeout(r, 3000));
    await publish2();
    await new Promise(r => setTimeout(r, 3000));
    await publish3();
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
        <div style={{ padding: "16px 24px", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={openPreview} style={{ background: "#f39c12", color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              👁 Предпросмотр 3 постов
            </button>
            <button onClick={download} style={{ background: "#fff", color: "#555", border: "1.5px solid #d0d0d0", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ↓ Скачать отчёт
            </button>
          </div>
          {openaiKey && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={genPoster} disabled={posterLoading}
                style={{ background: posterLoading ? "#95a5a6" : posterUrl ? "#27ae60" : "#2ecc71", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: posterLoading ? "not-allowed" : "pointer" }}>
                {posterLoading ? "⟳ Постер 1..." : posterUrl ? "✓ Постер 1 готов" : "🎨 Постер 1 · Тизер"}
              </button>
              <button onClick={genPoster2} disabled={posterLoading2}
                style={{ background: posterLoading2 ? "#95a5a6" : posterUrl2 ? "#27ae60" : "#2ecc71", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: posterLoading2 ? "not-allowed" : "pointer" }}>
                {posterLoading2 ? "⟳ Постер 2..." : posterUrl2 ? "✓ Постер 2 готов" : "🎨 Постер 2 · Анализ"}
              </button>
              <button onClick={genPoster3} disabled={posterLoading3}
                style={{ background: posterLoading3 ? "#95a5a6" : posterUrl3 ? "#27ae60" : "#2ecc71", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: posterLoading3 ? "not-allowed" : "pointer" }}>
                {posterLoading3 ? "⟳ Постер 3..." : posterUrl3 ? "✓ Постер 3 готов" : "🎨 Постер 3 · Стратегия"}
              </button>
              <button onClick={genAllPosters} disabled={posterLoading || posterLoading2 || posterLoading3}
                style={{ background: "linear-gradient(135deg,#8b5e08,#c8a030)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                🎨 Создать все 3 постера
              </button>
            </div>
          )}
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

      {/* PREVIEW - 3 POSTS */}
      {showPreview && (
        <div style={{ padding: "0 24px 24px", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ background: "#fff", border: "2px solid #f39c12", borderRadius: 12, overflow: "hidden" }}>

            {/* Header */}
            <div style={{ background: "#f39c12", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>👁 Предпросмотр · @OKI_invest · 3 поста</div>
              <button onClick={() => setShowPreview(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            {/* Post tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
              {[
                { num: 1, label: "Пост 1 · Крючок", desc: "с постером" },
                { num: 2, label: "Пост 2 · Анализ", desc: "текст" },
                { num: 3, label: "Пост 3 · Стратегия", desc: "опции" },
              ].map(tab => (
                <button key={tab.num} onClick={() => setActivePostTab(tab.num)}
                  style={{ flex: 1, padding: "12px 8px", border: "none", borderBottom: activePostTab === tab.num ? "3px solid #f39c12" : "3px solid transparent", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: activePostTab === tab.num ? 700 : 500, color: activePostTab === tab.num ? "#f39c12" : "#888" }}>
                  {tab.label}
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{tab.desc}</div>
                </button>
              ))}
            </div>

            {/* Post 1 */}
            {activePostTab === 1 && (
              <div style={{ display: "grid", gridTemplateColumns: posterUrl ? "220px 1fr" : "1fr" }}>
                {posterUrl && (
                  <div style={{ padding: 16, borderRight: "1px solid #f0f0f0", background: "#fafafa" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>ПОСТЕР 1 · ТИЗЕР</div>
                    <img src={posterUrl} alt="poster" style={{ width: "100%", borderRadius: 8 }} />
                  </div>
                )}
                {!posterUrl && openaiKey && (
                  <div style={{ padding: 16, borderRight: "1px solid #f0f0f0", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <button onClick={genPoster} disabled={posterLoading}
                      style={{ background: posterLoading ? "#95a5a6" : "#27ae60", color: "#fff", border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                      {posterLoading ? "⟳ Создаю постер 1..." : "🎨 Создать постер 1"}
                    </button>
                  </div>
                )}
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>КРЮЧОК — caption к постеру (до 1024 символов)</div>
                  <textarea value={editablePost} onChange={e => setEditablePost(e.target.value)}
                    style={{ width: "100%", minHeight: 300, border: "1.5px solid #d0d0d0", borderRadius: 8, padding: 14, fontSize: 13, fontFamily: "system-ui", lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box",
                      borderColor: editablePost.length > 1024 ? "#e74c3c" : "#d0d0d0" }} />
                  <div style={{ fontSize: 11, textAlign: "right", color: editablePost.length > 1024 ? "#e74c3c" : "#aaa", fontWeight: editablePost.length > 1024 ? 700 : 400 }}>
                    {editablePost.length}/1024 {editablePost.length > 1024 ? "⚠️ ПРЕВЫШЕН ЛИМИТ" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {tgToken ? (
                      <button onClick={publish} disabled={tgStatus === "sending" || tgStatus === "sent"}
                        style={{ flex: 1, background: tgStatus === "sent" ? "#27ae60" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {tgStatus === "sent" ? "✓ Опубликован" : tgStatus === "sending" ? "⟳ Публикую..." : "✈️ Опубликовать пост 1"}
                      </button>
                    ) : <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠️ Добавь токен Telegram</div>}
                    <button onClick={() => { navigator.clipboard?.writeText(editablePost); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      style={{ background: copied ? "#27ae60" : "#fff", color: copied ? "#fff" : "#555", border: "1.5px solid #d0d0d0", borderRadius: 8, padding: "10px 14px", fontSize: 12, cursor: "pointer" }}>
                      {copied ? "✓" : "⎘"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Post 2 */}
            {activePostTab === 2 && (
              <div style={{ display: "grid", gridTemplateColumns: posterUrl2 ? "220px 1fr" : "1fr" }}>
                {posterUrl2 && (
                  <div style={{ padding: 16, borderRight: "1px solid #f0f0f0", background: "#fafafa" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>ПОСТЕР 2 · АНАЛИЗ</div>
                    <img src={posterUrl2} alt="poster2" style={{ width: "100%", borderRadius: 8 }} />
                  </div>
                )}
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>ГЛУБОКИЙ АНАЛИЗ — текстовый пост (до 4096 символов)</div>
                <textarea value={editablePost2} onChange={e => setEditablePost2(e.target.value)}
                  style={{ width: "100%", minHeight: 420, border: "1.5px solid #d0d0d0", borderRadius: 8, padding: 14, fontSize: 13, fontFamily: "system-ui", lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box",
                    borderColor: editablePost2.length > 4096 ? "#e74c3c" : "#d0d0d0" }} />
                <div style={{ fontSize: 11, textAlign: "right", color: editablePost2.length > 4096 ? "#e74c3c" : "#aaa", fontWeight: editablePost2.length > 4096 ? 700 : 400 }}>
                  {editablePost2.length}/4096 {editablePost2.length > 4096 ? "⚠️ ПРЕВЫШЕН ЛИМИТ" : ""}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {tgToken ? (
                    <button onClick={publish2} disabled={tgStatus2 === "sending" || tgStatus2 === "sent"}
                      style={{ flex: 1, background: tgStatus2 === "sent" ? "#27ae60" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {tgStatus2 === "sent" ? "✓ Опубликован" : tgStatus2 === "sending" ? "⟳ Публикую..." : "✈️ Опубликовать пост 2"}
                    </button>
                  ) : <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠️ Добавь токен Telegram</div>}
                  <button onClick={() => { navigator.clipboard?.writeText(editablePost2); setCopied2(true); setTimeout(() => setCopied2(false), 2000); }}
                    style={{ background: copied2 ? "#27ae60" : "#fff", color: copied2 ? "#fff" : "#555", border: "1.5px solid #d0d0d0", borderRadius: 8, padding: "10px 14px", fontSize: 12, cursor: "pointer" }}>
                    {copied2 ? "✓" : "⎘"}
                  </button>
                </div>
              </div>
              </div>
            )}

            {/* Post 3 */}
            {activePostTab === 3 && (
              <div style={{ display: "grid", gridTemplateColumns: posterUrl3 ? "220px 1fr" : "1fr" }}>
                {posterUrl3 && (
                  <div style={{ padding: 16, borderRight: "1px solid #f0f0f0", background: "#fafafa" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>ПОСТЕР 3 · СТРАТЕГИЯ</div>
                    <img src={posterUrl3} alt="poster3" style={{ width: "100%", borderRadius: 8 }} />
                  </div>
                )}
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>СТРАТЕГИЯ — с опциональным постером (до 4096 символов)</div>
                    {openaiKey && !posterUrl3 && (
                      <button onClick={genPoster3} disabled={posterLoading3}
                        style={{ background: posterLoading3 ? "#95a5a6" : "#27ae60", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>
                        {posterLoading3 ? "⟳ Создаю..." : "🎨 Постер 3"}
                      </button>
                    )}
                  </div>
                  <textarea value={editablePost3} onChange={e => setEditablePost3(e.target.value)}
                    style={{ width: "100%", minHeight: 380, border: "1.5px solid #d0d0d0", borderRadius: 8, padding: 14, fontSize: 13, fontFamily: "system-ui", lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box",
                      borderColor: editablePost3.length > 4096 ? "#e74c3c" : "#d0d0d0" }} />
                  <div style={{ fontSize: 11, textAlign: "right", color: editablePost3.length > 4096 ? "#e74c3c" : "#aaa", fontWeight: editablePost3.length > 4096 ? 700 : 400 }}>
                    {editablePost3.length}/4096 {editablePost3.length > 4096 ? "⚠️ ПРЕВЫШЕН ЛИМИТ" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {tgToken ? (
                      <button onClick={publish3} disabled={tgStatus3 === "sending" || tgStatus3 === "sent"}
                        style={{ flex: 1, background: tgStatus3 === "sent" ? "#27ae60" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {tgStatus3 === "sent" ? "✓ Опубликован" : tgStatus3 === "sending" ? "⟳ Публикую..." : "✈️ Опубликовать пост 3"}
                      </button>
                    ) : <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠️ Добавь токен Telegram</div>}
                    <button onClick={() => { navigator.clipboard?.writeText(editablePost3); setCopied3(true); setTimeout(() => setCopied3(false), 2000); }}
                      style={{ background: copied3 ? "#27ae60" : "#fff", color: copied3 ? "#fff" : "#555", border: "1.5px solid #d0d0d0", borderRadius: 8, padding: "10px 14px", fontSize: 12, cursor: "pointer" }}>
                      {copied3 ? "✓" : "⎘"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Publish all button */}
            {tgToken && (tgStatus === "sent" || tgStatus2 === "sent" || tgStatus3 === "sent") && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", display: "flex", gap: 8, background: "#fafafa" }}>
                <div style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>
                  {[tgStatus === "sent" && "Пост 1 ✓", tgStatus2 === "sent" && "Пост 2 ✓", tgStatus3 === "sent" && "Пост 3 ✓"].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}

            {tgToken && tgStatus !== "sent" && tgStatus2 !== "sent" && tgStatus3 !== "sent" && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", background: "#fafafa" }}>
                <button onClick={publishAll}
                  style={{ width: "100%", background: "linear-gradient(135deg, #1a1a2e, #2a2a5e)", color: "#ffd700", border: "none", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🚀 Опубликовать все 3 поста подряд
                </button>
              </div>
            )}
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
