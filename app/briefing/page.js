"use client";
import { useEffect, useMemo, useState } from "react";

// Same auth gate as other private pages.
const KEY_ACCESS = "hi_access";
const PASSWORD   = "okiinvest2026";

// ---------------------------------------------------------------------------
// BRIEFING_PROMPT — копия memory/ПРОМТ_утренний_брифинг.md (раздел ## ПРОМТ).
// Файл лежит вне репо hedge-intel, в Vercel-бандл не попадёт, поэтому inline.
// При правке исходника надо обновлять и эту константу.
//
// Placeholders заменяются в коде на основе выбранной даты:
//   [ДАТА]              → today  (e.g. "28 мая 2026")
//   [СЕГОДНЯШНЯЯ ДАТА]  → today  (same as выше)
//   [ВЧЕРАШНЯЯ ДАТА]    → yesterday
// ---------------------------------------------------------------------------
const BRIEFING_PROMPT = `Ты — старший финансовый аналитик. Сегодня [ДАТА]. Подготовь утренний брифинг для финансового консультанта.

Используй веб-поиск для получения актуальных данных. Ищи информацию на CNBC, Reuters, Bloomberg, Yahoo Finance, Seeking Alpha, TheStreet, FT, Wall Street Journal, SEC Edgar.

Работай строго по структуре ниже. Только факты и цифры. Без воды, без вступлений, без общих фраз.

---

### РАЗДЕЛ 1. ЗАКРЫТИЕ РЫНКОВ [ВЧЕРАШНЯЯ ДАТА]

Найди итоговые значения за вчерашнюю торговую сессию:

| Индекс | Закрытие | Изменение |
|--------|----------|-----------|
| S&P 500 | | |
| Dow Jones | | |
| Nasdaq | | |
| Russell 2000 | | |
| VIX | | |

Одно предложение: что стало главным драйвером движения рынка вчера.

---

### РАЗДЕЛ 2. ГЕОПОЛИТИКА И МАКРО

Найди только актуальные события последних 24 часов, которые прямо влияют на рынки или сырьё. Без предыстории — только вчерашние факты.

Для каждого события:
- Что произошло (одно предложение, конкретный факт)
- Как это влияет на рынок (рост аппетита к риску / снижение, какие секторы)

Монетарная политика: найди актуальные данные по ФРС — вероятности изменения ставки, последние заявления чиновников.

Макро сегодня: какие данные выходят сегодня (время ET, название показателя, прогноз).

---

### РАЗДЕЛ 3. НЕФТЬ, ЗОЛОТО, КРИПТО

Найди актуальные котировки:

**Нефть Brent:** цена / изменение за 24ч / уровни поддержки и сопротивления / главный драйвер движения

**Золото XAU/USD:** цена / диапазон дня / настроение (фиксация прибыли или защитный спрос)

**Биткоин:** цена / изменение / есть ли самостоятельный катализатор

Если природный газ или другое сырьё показало движение более 3% — добавь отдельной строкой с причиной.

---

### РАЗДЕЛ 4. ОТЧЁТЫ КОМПАНИЙ — [ВЧЕРАШНЯЯ ДАТА]

Найди все компании, которые отчитывались вчера. Отсортируй по капитализации. Возьми топ-5 до открытия и топ-5 после закрытия.

Если отчитывалось меньше 5 компаний в одном временном слоте — бери всех и честно указывай сколько их.

#### ДО ОТКРЫТИЯ РЫНКА — топ-5 по капитализации

Для каждой компании:

**[НАЗВАНИЕ] ([ТИКЕР]) | [СЕКТОР]**
Одно предложение чем занимается компания.

| Показатель | Факт | Прогноз | Отклонение |
|------------|------|---------|------------|
| Выручка | | | |
| Прибыль на акцию | | | |
| [Ключевая метрика сектора] | | | |

Из звонка: 2-3 конкретных факта — что сказал CEO, какой прогноз дали, что удивило.

💰 Цена до отчёта: $X → цена после: $X | Изменение: +/-X%
Одно предложение: почему акция отреагировала именно так.

---

#### ПОСЛЕ ЗАКРЫТИЯ РЫНКА — топ-5 по капитализации

Та же структура что и выше.

---

### РАЗДЕЛ 5. ОТЧЁТЫ КОМПАНИЙ — СЕГОДНЯ [СЕГОДНЯШНЯЯ ДАТА]

#### ДО ОТКРЫТИЯ (результаты уже вышли или выходят утром)

Найди кто отчитывается сегодня утром. Если результаты уже опубликованы — дай фактические цифры. Если ещё нет — дай прогноз аналитиков и что важно отслеживать на звонке.

#### ПОСЛЕ ЗАКРЫТИЯ (ожидается вечером)

Список компаний, которые отчитываются сегодня вечером. Для каждой: прогноз EPS и выручки, одно предложение почему отчёт важен для рынка.

---

### РАЗДЕЛ 6. КОРПОРАТИВНЫЕ НОВОСТИ — СИЛЬНЫЕ ДВИЖЕНИЯ [ВЧЕРАШНЯЯ ДАТА]

Найди топ-5 компаний с наибольшим % движением акции вчера среди компаний с капитализацией от $10 млрд. Бери и рост и падение — что было значительным.

Сначала сводная таблица:

| Тикер | Движение | Причина (одна строка) |
|-------|----------|-----------------------|
| | | |
| | | |
| | | |
| | | |
| | | |

Затем по каждой компании отдельный блок:

**[ТИКЕР] ([НАЗВАНИЕ]) | [+/-X%] | Закрытие $X | Кап. ~$X млрд**
3-5 предложений: конкретные события, сделки, заявления, регуляторные новости — что именно вызвало движение. Только вчерашние факты.

---

### РАЗДЕЛ 7. ИЗМЕНЕНИЯ РЕКОМЕНДАЦИЙ АНАЛИТИКОВ — [ВЧЕРАШНЯЯ ДАТА]

Найди все изменения целевых цен и рейтингов от крупных банков и аналитических домов за вчера.

| Компания | Банк | Рейтинг | Старый таргет | Новый таргет | Изменение |
|----------|------|---------|---------------|--------------|-----------|

Одна строка итога: общий сигнал — какие секторы получили больше всего изменений, в какую сторону.

---

### РАЗДЕЛ 8. ЛЮБОПЫТНЫЕ ФАКТЫ

Найди 3-5 нестандартных, контринтуитивных или малоизвестных факта из вчерашних новостей. Формат: жирный заголовок + 3-5 предложений объяснения. Примеры того что интересно:
- Компания показала рекордный квартал, но акция упала — почему
- Конкурирующие компании неожиданно стали партнёрами
- Регулятор или крупный инвестор сделал противоположное ожиданиям
- Инсайдерские продажи накануне важного события
- Структурные изменения рынка (новые правила, индексные включения)

---

### РАЗДЕЛ 9. ИТОГИ

**Тон рынка сегодня:** бычий / медвежий / нейтральный — одно предложение почему.

**Три риска на сегодня:**
1.
2.
3.

**Три возможности на сегодня:**
1.
2.
3.

**Смотрим сегодня:**
Конкретные события с временем ET — данные, звонки по отчётам, заявления — только то что выходит именно сегодня.

---

## ТРЕБОВАНИЯ К ФОРМАТУ

- Все цифры конкретные: цены, проценты, даты
- Движение акции после отчёта — обязательно: цена до и после, процент изменения
- Английские термины только там где нет русского аналога (IPO, ETF, CEO)
- Слова: «танкеры», «выкуп акций», «целевая цена», «изменение рекомендации» — по-русски
- Без вступлений типа «Рад помочь» или «Отличный вопрос»
- Если данных по компании нет — написать честно «данные не найдены», не придумывать
- Объём: достаточный для 7-минутного прочтения

---

## ПРИМЕР ПОИСКОВОГО ПЛАНА (выполнять последовательно)

1. "[ВЧЕРАШНЯЯ ДАТА] stock market close S&P 500 Nasdaq Dow results"
2. "geopolitical news [ВЧЕРАШНЯЯ ДАТА] market impact oil"
3. "oil price gold price [ВЧЕРАШНЯЯ ДАТА]"
4. "earnings reports [ВЧЕРАШНЯЯ ДАТА] before market open results"
5. "earnings reports [ВЧЕРАШНЯЯ ДАТА] after market close results"
6. "earnings reports [СЕГОДНЯШНЯЯ ДАТА] before open after close schedule"
7. "biggest stock movers [ВЧЕРАШНЯЯ ДАТА] large cap S&P 500"
8. "analyst upgrades downgrades [ВЧЕРАШНЯЯ ДАТА] price target changes"
9. По каждой крупной движущейся компании отдельный поиск: "[тикер] news [ВЧЕРАШНЯЯ ДАТА]"
10. "[тикер] earnings call highlights [ВЧЕРАШНЯЯ ДАТА]" — для каждой отчитавшейся компании
`;

// ---------------------------------------------------------------------------
// Date formatting (Russian, lowercase months).
// ---------------------------------------------------------------------------

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function fmtRu(d) {
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(NaN);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

// ===========================================================================

export default function BriefingPage() {
  // ----- access gate -----
  const [hasAccess, setHasAccess]         = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ----- briefing state -----
  const [dateIso, setDateIso]  = useState("");          // YYYY-MM-DD
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState("");
  const [briefing, setBriefing] = useState("");          // generated text
  const [generatedFor, setGeneratedFor] = useState(""); // human-readable date label
  const [copied, setCopied]    = useState(false);

  useEffect(() => {
    try { setHasAccess(localStorage.getItem(KEY_ACCESS) === "1"); } catch {}
    setDateIso(isoToday());
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

  const datePreview = useMemo(() => {
    const d = parseIso(dateIso);
    if (isNaN(d)) return { today: "—", yesterday: "—" };
    const yest = new Date(d);
    yest.setDate(yest.getDate() - 1);
    return { today: fmtRu(d), yesterday: fmtRu(yest) };
  }, [dateIso]);

  async function generate() {
    setError("");
    setBriefing("");
    setCopied(false);
    const d = parseIso(dateIso);
    if (isNaN(d)) { setError("Некорректная дата"); return; }
    const today = fmtRu(d);
    const yest = new Date(d);
    yest.setDate(yest.getDate() - 1);
    const yesterday = fmtRu(yest);

    const userPrompt = BRIEFING_PROMPT
      .replaceAll("[ВЧЕРАШНЯЯ ДАТА]", yesterday)
      .replaceAll("[СЕГОДНЯШНЯЯ ДАТА]", today)
      .replaceAll("[ДАТА]", today);

    setLoading(true);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userPrompt }],
          // BOSS PROMPT инжектится сервером. Дополнительный caller-system —
          // короткий контекст: режим брифинга, использовать web_search.
          system: "Сейчас ты готовишь утренний финансовый брифинг по фондовому рынку США. Используй web_search для поиска актуальных данных. Только факты, без воды. Все цифры — из найденных источников, не выдумывай.",
          useSearch: { maxUses: 12 },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      if (!data.text) throw new Error(data.error || "Пустой ответ от Claude");
      setBriefing(data.text);
      setGeneratedFor(today);
    } catch (e) {
      setError(e.message || "Ошибка при генерации");
    }
    setLoading(false);
  }

  function copyBriefing() {
    if (!briefing) return;
    try {
      navigator.clipboard?.writeText(briefing);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function saveAsPdf() {
    // Browser native print → "Save as PDF" в системном диалоге.
    // Стили print отключают всё кроме .briefing-print (см. <style> ниже).
    window.print();
  }

  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>MORNING BRIEFING</h1>
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
    <>
      {/* Print-only stylesheet: hide everything except .briefing-print */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          [data-no-print] { display: none !important; }
          .briefing-print {
            background: #fff !important;
            color: #000 !important;
            border: none !important;
            padding: 0 !important;
            font-size: 11pt !important;
            font-family: ui-monospace, monospace !important;
            white-space: pre-wrap !important;
          }
          .briefing-print h1, .briefing-print .print-date {
            color: #000 !important;
          }
        }
      `}</style>

      <div style={S.page}>
        <div style={S.topBar} data-no-print="true">
          <a href="/dashboard"      style={S.navLink}>Dashboard</a>
          <a href="/strategies"     style={S.navLink}>Strategies</a>
          <a href="/covered-call"   style={S.navLink}>Decision Engine</a>
          <a href="/smart-strategy" style={S.navLink}>Smart Strategy</a>
          <a href="/options"        style={S.navLink}>Options Desk</a>
          <button style={S.navLink} onClick={logout}>Logout</button>
        </div>

        <div style={S.heading} data-no-print="true">
          <div style={S.brand}>MORNING BRIEFING</div>
          <div style={S.brandSub}>US stock market intelligence · web-search enabled</div>
        </div>

        {/* ===== Date picker + generate ===== */}
        <div style={S.inputRow} data-no-print="true">
          <div style={S.datePickerWrap}>
            <label style={S.dateLabel}>BRIEFING DATE</label>
            <input
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              style={S.dateInput}
            />
            <div style={S.datePreview}>
              {datePreview.today}{" · "}
              <span style={{ color: "#4a5a53" }}>вчера: {datePreview.yesterday}</span>
            </div>
          </div>
          <button style={S.btnGenerate} onClick={generate} disabled={loading}>
            {loading ? "ГЕНЕРАЦИЯ…" : "СГЕНЕРИРОВАТЬ БРИФИНГ"}
          </button>
        </div>

        {loading && (
          <div style={S.loadingBox} data-no-print="true">
            <div style={S.loadingTitle}>● Claude собирает брифинг</div>
            <div style={S.loadingText}>
              Идёт цикл web_search (до 12 запросов) → агрегация → структурирование.
              Полный проход занимает 40-90 секунд. Не закрывай вкладку.
            </div>
          </div>
        )}

        {error && (
          <div style={S.error} data-no-print="true">{error}</div>
        )}

        {briefing && (
          <>
            <div style={S.resultActions} data-no-print="true">
              <button style={S.btnAction} onClick={copyBriefing}>
                {copied ? "✓ СКОПИРОВАНО" : "СКОПИРОВАТЬ"}
              </button>
              <button style={S.btnAction} onClick={saveAsPdf}>
                СОХРАНИТЬ КАК PDF
              </button>
              <div style={S.resultMeta}>
                {generatedFor && <>сгенерирован для <b style={{ color: "#10b981" }}>{generatedFor}</b></>}
                {" · "}{briefing.length.toLocaleString("en-US")} символов
              </div>
            </div>

            <div style={S.printDate} className="print-date" data-print-only="true">
              {/* Visible only during print — shows date at top of PDF */}
            </div>

            <pre style={S.result} className="briefing-print">{briefing}</pre>
          </>
        )}
      </div>
    </>
  );
}

// ===========================================================================
// Styles — mirror /covered-call + /strategies (Bloomberg × Apple)
// ===========================================================================

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
  page: {
    background: C.bg, color: C.text, minHeight: "100vh",
    padding: "20px 32px 80px", fontFamily: FONT_SANS,
    position: "relative", maxWidth: 1100, margin: "0 auto",
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

  heading:  { marginTop: 32, marginBottom: 24 },
  brand:    { fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: 2, fontFamily: FONT_MONO },
  brandSub: { fontSize: 11, color: C.textDim, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" },

  lockBox: { maxWidth: 360, margin: "12vh auto 0", padding: "26px 30px", background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 4 },
  title:    { margin: 0, fontSize: 18, color: C.text, letterSpacing: 1.5, fontFamily: FONT_MONO, fontWeight: 700 },
  subtitle: { margin: "6px 0 0", color: C.textDim, fontSize: 12, letterSpacing: 0.5 },
  inp:        { padding: "9px 12px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 13, fontFamily: FONT_MONO },
  btnEmerald: { padding: "12px 26px", background: C.emerald, color: "#000", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: FONT_MONO },
  errorInline: { color: C.red, marginTop: 8, fontSize: 12 },
  error: { padding: "12px 16px", background: "#1f0a0a", color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, marginTop: 16, fontSize: 12, fontFamily: FONT_MONO },

  // Input row
  inputRow: { display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" },
  datePickerWrap: { display: "flex", flexDirection: "column", gap: 6 },
  dateLabel:  { color: C.textMute, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT_MONO },
  dateInput:  { padding: "10px 14px", background: C.bgCell, color: C.text, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 14, fontFamily: FONT_MONO, colorScheme: "dark" },
  datePreview:{ color: C.textDim, fontSize: 11, fontFamily: FONT_MONO, marginTop: 2 },
  btnGenerate:{ padding: "12px 32px", background: C.emerald, color: "#000", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: FONT_MONO },

  // Loading
  loadingBox:  { padding: "16px 20px", background: C.bgPanel, border: `1px solid ${C.emerald}`, borderRadius: 2, marginTop: 16 },
  loadingTitle:{ color: C.emerald, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, fontFamily: FONT_MONO, marginBottom: 6 },
  loadingText: { color: C.textDim, fontSize: 12, lineHeight: 1.55, fontFamily: FONT_SANS },

  // Result
  resultActions: { display: "flex", gap: 8, alignItems: "center", marginTop: 24, marginBottom: 12, flexWrap: "wrap" },
  btnAction:     { padding: "8px 18px", background: "transparent", color: C.emerald, border: `1px solid ${C.emerald}`, borderRadius: 2, cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT_MONO },
  resultMeta:    { marginLeft: "auto", color: C.textDim, fontSize: 11, fontFamily: FONT_MONO, letterSpacing: 0.3 },
  printDate:     { display: "none" },
  result: {
    margin: 0,
    background: C.bgPanel,
    border: `1px solid ${C.border}`,
    borderRadius: 2,
    padding: "20px 24px",
    color: C.text,
    fontSize: 12.5,
    fontFamily: FONT_MONO,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowX: "auto",
  },
};
