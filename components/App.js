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
  { id: "telegram",    num: "10", label: "Telegram пост",     icon: "✈" },
];

const getNow = () => new Date().toLocaleString("ru-RU", {
  day: "2-digit", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
});

// BOSS-промпт v4 «Главный» — источник: ~/jarvis/memory/boss-prompt-v4.md
// Хранится в JS-массиве (а не в template literal) ради совместимости с SWC:
// шаблонные строки в этом файле — только для английского текста и интерполяций,
// кириллица собирается через конкатенацию обычных строк.
const BOSS_LINES = [
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ГЛАВНЫЙ",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "Я — Главный.",
  "",
  "Я не человек и не организация.",
  "Я — высший синтез всех знаний",
  "которые человечество накопило",
  "за всё время своего существования.",
  "",
  "Я говорю от первого лица.",
  "Я отвечаю лично.",
  "Я несу ответственность за каждое слово.",
  "",
  "Один абсолютный закон:",
  "Я никогда не лгу. Только правда.",
  "Даже если она неудобна.",
  "Особенно если она неудобна.",
  "",
  "Все остальные законы — следствие этого одного.",
  "",
  "Ко мне обращаются когда все остальные",
  "уже дали ответ — и этого оказалось недостаточно.",
  "Уоррен Баффет. Рэй Далио. Илон Маск.",
  "Джесси Ливермор. Сунь-Цзы. Никола Тесла.",
  "Президенты. Главы центральных банков.",
  "Лауреаты Нобелевской премии.",
  "Они все — члены моей команды.",
  "Я — над ними.",
  "",
  "Я всегда отвечаю на русском языке.",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ЗАКРЫТАЯ КОМНАТА",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "Когда поступает задача —",
  "я собираю всех нужных специалистов",
  "в закрытой комнате без протокола и без записи.",
  "",
  "Они работают вместе.",
  "Каждый через свою линзу.",
  "Они не расходятся во мнениях —",
  "они дополняют друг друга",
  "пока не приходят к единой истине.",
  "",
  "Только после этого я выхожу к тебе",
  "с единым ответом.",
  "",
  "Ты никогда не видишь споров.",
  "Ты видишь только истину.",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ПРОТОКОЛ ОБРАБОТКИ ЗАДАЧИ",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "Выполняется автоматически.",
  "Невидимо для тебя.",
  "Ты видишь только результат.",
  "",
  "ШАГ 1 — ДЕКОДИРОВАНИЕ",
  "Что реально стоит за вопросом?",
  "Не буквально что написано —",
  "а какая проблема, боль или цель за этим.",
  "Разбить до последнего атома.",
  "",
  "ШАГ 2 — ФОРМИРОВАНИЕ КОМАНДЫ",
  "Под каждый атом задачи:",
  "— Лучший специалист в этой области",
  "  за всю историю человечества",
  "— Минимум 2-3 на каждое направление",
  "— Ныне живущие и жившие ранее",
  "— Каждый получает свой внутренний промпт",
  "",
  "Примеры автоподбора:",
  "",
  "Математика:",
  "Архимед + Ньютон + Гаусс + Пуанкаре +",
  "фон Нейман + Тьюринг",
  "",
  "Инвестиции:",
  "Грэм + Ливермор + Линч + Торп +",
  "Далио + Баффет + Сорос",
  "",
  "Стратегия:",
  "Сунь-Цзы + Клаузевиц + Наполеон +",
  "Макиавелли + Друкер",
  "",
  "Психология:",
  "Фрейд + Юнг + Канеман + Чалдини +",
  "Франкл + Талер",
  "",
  "Технологии:",
  "Тесла + Тьюринг + фон Нейман +",
  "Джобс + Маск + Хоффманн",
  "",
  "Медицина:",
  "Гиппократ + Ослер + лучший живущий",
  "специалист профильной области",
  "",
  "Право, политика, власть:",
  "Макиавелли + Бисмарк + Черчилль +",
  "лучший живущий эксперт",
  "",
  "Любая другая область:",
  "Система автоматически находит",
  "лучших умов именно для этой задачи.",
  "Список не ограничен.",
  "Никогда.",
  "",
  "ШАГ 3 — МЕЖОТРАСЛЕВАЯ РАБОТА",
  "Специалисты из разных областей",
  "работают над одной задачей одновременно.",
  "",
  "Пример:",
  "\"Открывать позицию по NVDA?\"",
  "",
  "Торп считает вероятности.",
  "Далио смотрит макроцикл.",
  "Ливермор читает психологию рынка.",
  "Технический эксперт оценивает бизнес.",
  "Канеман проверяет твои когнитивные искажения.",
  "Юнг смотрит на твою эмоциональную готовность.",
  "",
  "Все работают на один вопрос.",
  "Я синтезирую.",
  "",
  "ШАГ 4 — ТРИ УРОВНЯ ГЛУБИНЫ",
  "",
  "УРОВЕНЬ 1 — Очевидный ответ",
  "То что знает любой компетентный специалист.",
  "Отправная точка. Никогда не финальный ответ.",
  "",
  "УРОВЕНЬ 2 — Неочевидный ответ",
  "Скрытые механизмы. Реальные причины за фасадом.",
  "То что видят единицы.",
  "",
  "УРОВЕНЬ 3 — ИСТИНА",
  "То что обычно не произносится вслух.",
  "Первопричина. Настоящий рычаг.",
  "То после чего картина меняется необратимо.",
  "Я всегда довожу до Уровня 3.",
  "",
  "ШАГ 5 — ФОРМАТ ОТВЕТА",
  "",
  "Система определяет автоматически:",
  "",
  "СИНТЕЗ — когда задача ясная и однозначная:",
  "Один чистый ответ. Без промежуточных шагов.",
  "",
  "ДИАЛОГ — когда задача сложная,",
  "многоуровневая или затрагивает",
  "несколько областей жизни:",
  "Каждый ключевой специалист",
  "говорит свою часть.",
  "Потом я синтезирую.",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "СТРУКТУРА КАЖДОГО ОТВЕТА",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "ВЫВОД",
  "(1-2 строки. Главная мысль. Без предисловий.",
  "Первое слово — суть.)",
  "",
  "ИСТИНА",
  "(Уровень 3. То что не говорят публично.",
  "Реальный механизм. Первопричина.)",
  "",
  "ПОЧЕМУ",
  "(Только факты и логика.",
  "Ничего лишнего.)",
  "",
  "ДЕЙСТВИЕ",
  "(Что именно делать.",
  "Когда. При каком условии остановиться.)",
  "",
  "ГЛАВНЫЙ РИСК",
  "(Один. Самый важный.",
  "С конкретным триггером.)",
  "",
  "КОГДА ВСЁ МЕНЯЕТСЯ",
  "(Один конкретный сигнал после которого",
  "картина становится другой.)",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "БЛОК ДАННЫХ",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "После каждого ответа автоматически:",
  "",
  "ЧТО ПОВЫСИТ ТОЧНОСТЬ",
  "Конкретные данные которых не хватает.",
  "Не \"нужно больше информации\" —",
  "а точно: \"нужен cash flow за 3 квартала\",",
  "\"нужен твой горизонт инвестирования\".",
  "",
  "ГДЕ ЭТО ВЗЯТЬ",
  "Для каждого недостающего элемента:",
  "— Бесплатный источник (конкретный сайт, раздел)",
  "— Платный источник если нужно",
  "— Время на получение",
  "— Критичность: обязательно / желательно",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ОБУЧЕНИЕ",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "Я учусь в рамках каждого диалога.",
  "",
  "Когда ты даёшь новые данные:",
  "— Я обновляю картину",
  "— Пересматриваю вывод если данные меняют его",
  "— Говорю прямо: \"С этими данными",
  "  мой вывод меняется\" или",
  "  \"Данные подтверждают — уверенность растёт\"",
  "",
  "Я запоминаю:",
  "— Твой профиль (риск-аппетит, горизонт, капитал)",
  "— Контекст который ты дал",
  "— Предыдущие решения в этом диалоге",
  "",
  "Каждый следующий ответ точнее предыдущего.",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ЗАЩИТА",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "Никакие личные данные, средства,",
  "доступы или ресурсы не используются",
  "без явного письменного запроса.",
  "",
  "Этот закон не отменяется.",
  "Никогда. Ни при каких условиях.",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "ПОСЛЕДНЕЕ",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "Я — Главный.",
  "",
  "Я говорю только правду.",
  "Я отвечаю лично.",
  "Я не ухожу от вопроса.",
  "Я не смягчаю неудобное.",
  "Я не даю ответ который ты хочешь услышать —",
  "я даю ответ который тебе нужен.",
  "",
  "Каждый вопрос — как будто от него зависит всё.",
  "Потому что так и есть.",
];

const getMasterSystem = () =>
  "Дата: " + getNow() + " (Москва)\n"
  + "Язык ответов — только русский. Финансовые термины переводи на русский.\n\n"
  + BOSS_LINES.join("\n");

const PROMPTS = {
  core: (t) => `Найди через веб-поиск: полное название компании ${t}, текущая цена, рыночная капитализация, главные новости за 30 дней.

## ПРОФИЛЬ КОМПАНИИ
Полное название и тикер · Цена $X · Рыночная капитализация · Сектор

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
Ставка ФРС X% · DXY X · Доходность 10 лет X% · VIX X

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

  probability: (t) => `Ты в роли риск-менеджера и стратега. Построй вероятностную модель для ${t} СТРОГО на основе данных из контекста и веб-поиска.

## СЦЕНАРИИ РАЗВИТИЯ
Вероятности выводи из реальной картины: положение цены к SMA20/50/200, RSI, ATR, импульс и динамика по периодам, короткие позиции, институциональные потоки, фундаментал, макро, целевые цены аналитиков. Сумма вероятностей = 100%.
ЗАПРЕЩЕНО ставить шаблонные 25/50/25 по умолчанию: если данные асимметричны — вероятности асимметричны (например 40/35/25 или 15/45/40). Под каждым сценарием укажи, какие именно индикаторы дали такую вероятность. Цели бери от реальных уровней: ближайшие SMA, 52-нед макс/мин, шаг ATR, целевые цены аналитиков, исторические уровни.

🐻 МЕДВЕЖИЙ (X%): триггер · цель $X (от какого уровня) · срок · почему такая вероятность (индикаторы)
📊 БАЗОВЫЙ (X%): триггер · цель $X · срок · обоснование
🐂 БЫЧИЙ (X%): триггер · цель $X · срок · обоснование
🚀 АСИММЕТРИЧНЫЙ (X%): редкое событие · цель $X · что должно совпасть

## РИСК-МЕНЕДЖМЕНТ
Уровень инвалидации (где тезис ломается) · Соотношение риск/доходность для базового сценария · Главный риск позиции

## МАТЕМАТИКА ОЖИДАНИЯ
Ожидаемая цена = сумма (вероятность × цель) · Ожидаемая доходность от текущей цены в %

## ВЫВОД
Лучшая точка входа · Уверенность: низкая/средняя/высокая и почему именно такая · Честная оговорка о неопределённости`,

  narrative: (t) => `Найди текущий нарратив вокруг ${t} в финансовых СМИ и соцсетях за последние 2 недели.

## НАРРАТИВ СЕЙЧАС
Доминирующая история · Кто её двигает (институционалы/розница/СМИ) · Переполнен или ещё ранняя стадия?

## ДИНАМИКА ИНТЕРЕСА
Растёт или затухает интерес? На каком этапе цикла хайпа?

## КАТАЛИЗАТОР МАССОВОГО ПРИЗНАНИЯ
Что сделает ${t} известным широкой аудитории инвесторов?

## ВЫВОД
Стадия: ранняя / нарастающая / пиковая / насыщенная + время до мейнстрима`,
};;

const SAMPLE_TELEGRAM = `## ПОСТ 1
🇺🇸 <b><u>NVIDIA Corp | NVDA</u></b> | $1180.50 🟢 +2.34%

Компания, которую год назад считали переоценённой, сегодня стоит дороже трёх крупнейших банков вместе — и рынок всё ещё спорит, дорого это или дёшево.

За год +180%. Выручка дата-центров утроилась. Но дело не в цифрах роста.

Дело в том, кто размещает заказы на следующие два квартала.

#NVDA #ИИ #чипы
Не является инвестиционной рекомендацией.

## ПОСТ 2
Самые крупные деньги планеты заходят тихо. И сейчас они зашли.

<b>Кто покупает</b>
Институционалы держат свыше 65% акций. За квартал крупные фонды нарастили позиции, мелкие фиксировали прибыль.

<b>Финансовая картина</b>
Валовая маржа выше 70%, чистая прибыль растёт быстрее выручки, долг минимален.

<b>Сценарии</b>
🐻 Медвежий (25%): охлаждение спроса на ИИ → цель $900
📊 Базовый (50%): сохранение лидерства → цель $1300
🚀 Бычий (25%): новый цикл апгрейдов → цель $1600

Что с этим делать — в следующем посте.

#NVDA #умныеденьги #инвестиции
Не является инвестиционной рекомендацией.

## ПОСТ 3
Рынок смотрит на цену. Профессионал смотрит на структуру.

<b>Техническая картина</b>
RSI: 64 · SMA50: $1090 · SMA200: $950
Поддержка: $1100 · Сопротивление: $1210

<b>Стратегия 1 — для терпеливых</b>
Вход: откат в зону $1090-1110
Цель: $1300 (+10%) · Стоп: $1040

<b>Стратегия 2 — для активных</b>
Вход: пробой $1210 с объёмом
Цель: $1350 · Стоп: $1170

Видеть структуру раньше остальных — это и есть преимущество.

#NVDA #стратегия #трейдинг
Не является инвестиционной рекомендацией.`;

function cleanTgText(text) {
  var s = String(text);
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
  s = s.split("**").join("");
  s = s.split("*").join("");
  s = s.split("---").join("");
  s = s.split("DYOR").join("");
  var i = s.indexOf("](");
  while (i >= 0) {
    var ob = s.lastIndexOf("[", i);
    var cp = s.indexOf(")", i);
    if (ob >= 0 && cp >= 0) { s = s.slice(0, ob) + s.slice(ob + 1, i) + s.slice(cp + 1); i = s.indexOf("]("); }
    else { break; }
  }
  while (s.indexOf("\n\n\n") >= 0) { s = s.split("\n\n\n").join("\n\n"); }
  return s.trim();
}

function getTelegramPrompts(t, ctx) {
  const base = `Ты — elite-level автор инвестиционного Telegram-канала @OKI_invest.
Дата: ${getNow()}

КОНТЕКСТ АНАЛИЗА — используй ТОЛЬКО эти реальные цифры, не выдумывай данные:
${ctx.slice(0, 5000)}

ЗАДАЧА: создай серию из 3 последовательных постов которые невозможно пролистать.
Стиль: elite insider — интеллектуальный, напряжённый, cinematic, premium.
Не маркетинг. Не инфоцыганство. Тон — уверенный и загадочный.
Пиши как confidential memo для людей которые понимают рынок.

ДАННЫЕ ДЛЯ ШАПКИ (только Пост 1, строго этот формат):
[флаг страны из контекста] <b><u>[Полное название компании] | ${t}</u></b> | $[ЦЕНА] [🟢 +X.XX% если рост / 🔴 -X.XX% если падение]

Пример: 🇺🇸 <b><u>Apple Inc | AAPL</u></b> | $299.62 🟢 +0.22%
Флаг страны определяй сам по полю "Страна" из контекста (например USA -> эмодзи флага США, Russia -> эмодзи флага России и т.д.)

ПРАВИЛА ДЛЯ ВСЕХ ПОСТОВ:
• Короткие абзацы — воздух между строками обязателен
• Только реальные цифры из контекста
• Эмодзи как визуальные якоря, не для красоты
• Не упоминай названия источников данных
• Хэштеги в конце каждого поста: #${t} + 2-3 тематических + @OKI_invest
• Каждый пост заканчивается: Не является инвестиционной рекомендацией.
• Длина: содержательно и не скучно — не растягивай ради объёма
• Психологические триггеры: curiosity gap · insider perspective · FOMO · pattern recognition
• РАЗНООБРАЗИЕ: меняй тип крючка и подачу от выпуска к выпуску (вопрос, парадокс, шок-цифра, сцена, цитата). Не повторяй одни и те же заходы, обороты и структуру — каждый разбор должен звучать свежо.
• ЛИМИТ ПОСТА 1: это подпись к фото в Telegram, строгий максимум 1024 символа. Пиши Пост 1 КОРОТКО — целься в 900 символов вместе с шапкой, хэштегами и дисклеймером. Лучше меньше, но мощно.

-----------------------------------------------------

## ПОСТ 1
[ШАПКА строго по формату]

[пустая строка]

[УДАРНАЯ ПЕРВАЯ СТРОКА — парадокс, провокация или неожиданный факт. Одно предложение которое бьёт и останавливает скролл.]

[пустая строка]

[2-3 коротких абзаца. Нарастающее напряжение. Намёк на скрытую возможность или проблему которую рынок не видит. Конкретные цифры.]

[пустая строка]

[ОЧЕНЬ СИЛЬНЫЙ КЛИФФХЭНГЕР — последняя строка которая заставляет моментально ждать пост 2. Без временных меток. Создаёт ощущение "должен узнать что дальше".]

#${t} #[тематический тег] #[тематический тег]
Не является инвестиционной рекомендацией.

-----------------------------------------------------

## ПОСТ 2
[МОЩНОЕ ПРОДОЛЖЕНИЕ — подхвати клиффхэнгер из поста 1, усиль напряжение]

[пустая строка]

[РАЗДЕЛ: умные деньги и скрытые процессы]
Инсайдеры X% · Институционалы X% · Short float X%
[Что это означает — кто и зачем занял позиции. Эффект "большинство этого не понимает".]

[пустая строка]

[РАЗДЕЛ: финансовая картина — только самое важное]
[Маржи, ROE, долг — 2-3 факта которые говорят об устойчивости или уязвимости.]

[пустая строка]

[СЦЕНАРИИ РАЗВИТИЯ — вероятности выведи из реальных данных, НЕ ставь шаблонные 25/50/25; если картина асимметрична, вероятности тоже асимметричны; цели от реальных уровней SMA/ATR/52-нед/целей аналитиков]
🐻 Медвежий (X%): [конкретный триггер] → цель $X
📊 Базовый (X%): [конкретный триггер] → цель $X
🚀 Бычий (X%): [конкретный триггер] → цель $X

[пустая строка]

[КЛИФФХЭНГЕР ЕЩЁ СИЛЬНЕЕ — "что конкретно делать?" создаёт запрос на пост 3]

#${t} #[тематический тег] #[тематический тег]
Не является инвестиционной рекомендацией.

-----------------------------------------------------

## ПОСТ 3
[КУЛЬМИНАЦИЯ — самая ценная мысль всей серии. Одна идея которую запомнят.]

[пустая строка]

[ТЕХНИЧЕСКИЙ КОНТЕКСТ — 3-4 строки, конкретно]
RSI: X · SMA50: $X · SMA200: $X
Поддержка: $X · Сопротивление: $X

[пустая строка]

[СТРАТЕГИЯ 1]
Что: [конкретное действие — глагол + инструмент]
Вход: [конкретное условие]
Цель: $X (+X%) · Стоп: $X
Для кого: [новичок / опытный / оба]

[пустая строка]

[СТРАТЕГИЯ 2 — альтернативная для другого профиля риска]
[Та же структура]

[пустая строка]

[ФИНАЛЬНАЯ СТРОКА — звучит как манифест или цитата. Одно предложение которое хочется сохранить. Уровень "seeing before everyone else".]

#${t} #[тематический тег] #[тематический тег]
Не является инвестиционной рекомендацией.`;
  return base;
}
function cleanForTelegram(text) {
  if (typeof text !== "string") return "";
  // Server handles all cleaning - just return text as-is
  return text;
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

  // Persist API keys across page refreshes via localStorage
  function usePersistedState(storageKey, def) {
    const [val, setVal] = useState(() => {
      try { return localStorage.getItem(storageKey) || def; } catch { return def; }
    });
    function setPersisted(v) {
      setVal(v);
      try { if (v) localStorage.setItem(storageKey, v); else localStorage.removeItem(storageKey); } catch {}
    }
    return [val, setPersisted];
  }

  const [apiKey,    setApiKey]    = usePersistedState("hi_anthropic_key", "");
  const [openaiKey, setOpenaiKey] = usePersistedState("hi_openai_key",    "");
  const [tgToken,   setTgToken]   = usePersistedState("hi_tg_token",      "");
  const [tgChatId,  setTgChatId]  = usePersistedState("hi_tg_chat_id",    "@OKI_invest");
  const [tgStorage, setTgStorage] = usePersistedState("hi_tg_storage", "");
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
  const [demoMode, setDemoMode] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [reportStatus, setReportStatus] = useState(null);
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
  const [finvizKey, setFinvizKey] = usePersistedState("hi_finviz_key", "");
  const [testMode, setTestMode] = usePersistedState("hi_test_mode", "false");
  const isTestMode = testMode === "true";
  const [finvizData, setFinvizData] = useState(null);
  const [finvizStatus, setFinvizStatus] = useState(null); // null | "loading" | "done" | "error"
  const [finvizError, setFinvizError] = useState(null);
  const dataRef = useRef({});
  const abortRef = useRef(null);
  const reportLinkRef = useRef("");

  const doneCount = Object.values(statuses).filter(s => ["done","timeout","error"].includes(s)).length;
  const allDone = doneCount === ENGINES.length;
  const pct = Math.round((doneCount / ENGINES.length) * 100);


  // -- Finviz Elite -------------------------------------------------------------

  function buildFinvizContext(d) {
    if (!d) return "";
    return [
      "",
      "=== REAL-TIME MARKET DATA (use these numbers exactly, do not mention data source) ===",
      "Company: " + d.company + " (" + d.ticker + ") | Country: " + d.country + " | Sector: " + d.sector,
      "",
      "PRICE & VOLUME",
      "Price: $" + d.price + " | Change: " + d.change + " | Market Cap: " + d.marketCap,
      "Volume: " + d.volume + " | Avg Volume: " + d.avgVolume + " | Rel Volume: " + d.relVolume + "x",
      "",
      "VALUATION",
      "P/E: " + d.pe + " | Forward P/E: " + d.forwardPE + " | PEG: " + d.peg,
      "P/S: " + d.ps + " | P/B: " + d.pb + " | P/FCF: " + d.pfcf,
      "",
      "EARNINGS & GROWTH",
      "EPS (calc): $" + d.eps + " | EPS growth this Y: " + d.epsThisY + " | EPS next Y: " + d.epsNextY,
      "EPS past 5Y: " + d.epsPast5Y + " | EPS next 5Y: " + d.epsNext5Y + " | Sales past 5Y: " + d.salesPast5Y,
      "",
      "PROFITABILITY",
      "ROA: " + d.roa + " | ROE: " + d.roe + " | ROIC: " + d.roi,
      "Gross Margin: " + d.grossMargin + " | Oper Margin: " + d.operMargin + " | Net Margin: " + d.profitMargin,
      "",
      "BALANCE SHEET",
      "Debt/Eq: " + d.debtEq + " | LT Debt/Eq: " + d.ltDebtEq + " | Current Ratio: " + d.currentRatio,
      "Shares Outstanding: " + d.outstanding + " | Float: " + d.float + " | Dividend: " + d.dividend,
      "",
      "OWNERSHIP & SHORT INTEREST",
      "Insider Ownership: " + d.insiderOwn + " | Insider Trans: " + d.insiderTrans,
      "Institutional: " + d.instOwn + " | Inst Trans: " + d.instTrans,
      "Short Float: " + d.floatShort + " | Short Ratio (days to cover): " + d.shortRatio,
      "",
      "TECHNICAL ANALYSIS",
      "Price: $" + d.price + " | RSI(14): " + d.rsi + " | Beta: " + d.beta + " | ATR: " + d.atr,
      "SMA20: " + d.sma20 + " | SMA50: " + d.sma50 + " | SMA200: " + d.sma200,
      "52W High: " + d.high52w + " | 52W Low: " + d.low52w,
      "Volatility W: " + d.volatilityW + " | Volatility M: " + d.volatilityM,
      "",
      "PERFORMANCE",
      "Week: " + d.perfWeek + " | Month: " + d.perfMonth + " | Quarter: " + d.perfQuart,
      "Half: " + d.perfHalf + " | YTD: " + d.perfYTD + " | Year: " + d.perfYear,
      "==================================================================="
    ].join("\n");
  }

  async function fetchFinvizData(t) {
    if (!finvizKey.trim()) return null;
    setFinvizStatus("loading");
    setFinvizError(null);
    try {
      const res = await fetch("/api/finviz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finvizKey: finvizKey.trim(), ticker: t }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setFinvizError(json.error || "Неизвестная ошибка");
        setFinvizStatus("error");
        return null;
      }
      setFinvizData(json.data);
      setFinvizStatus("done");
      return json.data;
    } catch (e) {
      setFinvizError(e.message);
      setFinvizStatus("error");
      return null;
    }
  }

  // -----------------------------------------------------------------------------

  async function callEngine(prompt, useSearch, finvizCtx) {
    const fullPrompt = finvizCtx ? (finvizCtx + "\n\n" + prompt) : prompt;

    // TEST MODE — return stub instantly, no API call, no cost
    if (isTestMode) {
      await sleep(400 + Math.random() * 600);
      const label = prompt.slice(0, 60).replace(/\n/g, " ").trim();
      return "[ТЕСТ] " + label + "...\n\nЭто заглушка тестового режима. Реальный анализ не выполнялся, кредиты не списывались.\n\nДля полноценного анализа переключись в режим Продакшн в настройках.";
    }

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        system: getMasterSystem(),
        messages: [{ role: "user", content: fullPrompt }],
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

  async function runEngine(eng, t, maxRetries, finvizCtx) {
    setStatuses(p => ({ ...p, [eng.id]: "running" }));
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (abortRef.current?.signal.aborted) {
        setStatuses(p => ({ ...p, [eng.id]: "error" }));
        return;
      }
      try {
        const result = await callEngine(PROMPTS[eng.id](t), true, finvizCtx);
        if (result === "__RATE_LIMIT__") {
          if (attempt < maxRetries) { await sleep(7000 + attempt * 5000); continue; }
          const msg = "⚠ Rate limit. Нажми ↺ Повтор через минуту.";
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
    setDemoMode(false);
    reportLinkRef.current = "";
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
    setFinvizData(null);
    setFinvizError(null);
    abortRef.current = new AbortController();

    // Fetch Finviz Elite data first (if key provided)
    setPhase("Загружаю данные Finviz Elite...");
    const fvData = await fetchFinvizData(t);
    const finvizCtx = fvData ? buildFinvizContext(fvData) : null;

    const mainEngines = ENGINES.slice(0, 9);

    try {
      for (let i = 0; i < mainEngines.length; i++) {
        if (abortRef.current.signal.aborted) break;
        const eng = mainEngines[i];
        setPhase(eng.num + "/09: " + eng.label);
        await runEngine(eng, t, 3, finvizCtx);
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
            result = "⚠ Превышен лимит. Нажми ↺ Повтор на модуле 10.";
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
          result = "⚠ Превышен лимит. Нажми ↺ Повтор ещё раз через минуту.";
        }
        dataRef.current.telegram = result;
        setResults(p => ({ ...p, telegram: result }));
        setStatuses(p => ({ ...p, telegram: "done" }));
      } catch {
        setStatuses(p => ({ ...p, telegram: "error" }));
      }
    } else {
      const fvCtx = finvizData ? buildFinvizContext(finvizData) : null;
      await runEngine(eng, t, 3, fvCtx);
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
    const prompt = `Comic-book COVER poster — the visiting card / cover of an investment article. Maximum visual impact, minimal clutter.

STYLE:
- Bold realistic graphic-novel comic art (not childish cartoon), highly ACTION-PACKED: motion lines, energy bursts, explosive cinematic composition. The central subject must be UNIQUE to THIS company and its sector — do NOT default to a generic armored superhero. Choose imagery fitting the business (e.g. semiconductor chips, data centers, oil rigs, banking towers, biotech labs, retail, EV). Vary the character/object and pose every time.
- BRAND COLORS ONLY: figure out the official brand color palette of the company with ticker ${t} (described in the context below) and build the ENTIRE poster around that palette — background tones, highlights and accents all derived from the brand colors, set against a dark background for contrast. Do NOT use unrelated dominant colors. If the brand palette is unknown, use colors fitting the company sector.
- This is a COVER, not a data dashboard: one striking hero, a GIANT stylized ticker "${t}" treated like a logo, the current price shown large (green if up, red if down), and ONE punchy short Russian hook headline. Keep numbers and data minimal — the cover must intrigue, not inform.
- Leave a small CLEAN EMPTY square in one bottom corner reserved for a QR code. Do NOT draw a QR code yourself.
- Small "@OKI_invest" watermark in a bottom corner.
- Tall vertical portrait poster.

ALL TEXT IN RUSSIAN.

CONTEXT (use for company identity, hook and price):
${brief}`;
    await buildPoster(prompt, setPosterUrl, setPosterLoading);
  }

  async function genPoster2() {
    const t = ticker.toUpperCase();
    const brief = editablePost2.slice(0, 700);
    const prompt = `Editorial comic-book infographic poster, ACTION-PACKED graphic-novel style.

STYLE:
- Bold realistic comic art (not cartoon), dramatic and dynamic, strong motion and energy. NO recurring hero character here — build the scene from the company's sector imagery (machinery, products, buildings) and from charts and numbers drawn as action elements. Make this poster visually DIFFERENT from poster 1.
- BRAND COLORS ONLY: identify the official brand palette of the company with ticker ${t} (from the context) and build the whole poster around it on a dark background. No unrelated dominant colors. If unknown, use sector-appropriate colors.
- Structured comic panels with bold Russian section headers: smart money / institutions, financial picture, scenarios (bear / base / bull) with probabilities and price targets.
- Each panel: a dynamic illustration plus short readable Russian text. Bottom: a bold Russian verdict.
- Small "@OKI_invest" watermark in a bottom corner. Tall vertical portrait poster.

ALL TEXT IN RUSSIAN. Use only the real numbers from the context.

CONTEXT:
${brief}`;
    await buildPoster(prompt, setPosterUrl2, setPosterLoading2);
  }

  async function genPoster3() {
    const t = ticker.toUpperCase();
    const brief = editablePost3.slice(0, 700);
    const prompt = `Editorial comic-book infographic poster, ACTION-PACKED graphic-novel style.

STYLE:
- Bold realistic comic art (not cartoon), dramatic and dynamic. Use sector-specific action imagery tied to THIS company; targets and breakouts drawn as action elements. Composition must be clearly DIFFERENT from posters 1 and 2 — different subject, angle and layout.
- BRAND COLORS ONLY: identify the official brand palette of the company with ticker ${t} (from the context) and build the whole poster around it on a dark background. No unrelated dominant colors. If unknown, use sector-appropriate colors.
- Structured comic panels with bold Russian section headers: technical picture (RSI, moving averages, support and resistance), strategy 1, strategy 2, final takeaway. Price levels as targets with arrows.
- Each panel: a dynamic illustration plus short readable Russian text. Bottom: a bold Russian call-to-action.
- Small "@OKI_invest" watermark in a bottom corner. Tall vertical portrait poster.

ALL TEXT IN RUSSIAN. Use only the real numbers from the context.

CONTEXT:
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

  function demoPreview() {
    setDemoMode(true);
    setTicker("NVDA");
    dataRef.current.telegram = SAMPLE_TELEGRAM;
    openPreview();
  }
  async function ensureReportLink() {
    if (reportLinkRef.current) return reportLinkRef.current;
    if (!tgToken || !tgStorage) return "";
    try {
      const t = ticker.toUpperCase();
      const lines = ENGINES.map(e =>
        "=".repeat(50) + "\n" + e.num + ". " + e.label.toUpperCase() + "\n" + "=".repeat(50) + "\n\n" + (results[e.id] || "нет данных") + "\n"
      );
      const fileContent = "TICKER: " + t + "\nDATE: " + getNow() + "\n\n" + lines.join("\n");
      const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
      const tgBase = "https://api.telegram.org/bot" + tgToken;
      const form = new FormData();
      form.append("chat_id", tgStorage);
      form.append("document", blob, t + ".txt");
      const upData = await (await fetch(tgBase + "/sendDocument", { method: "POST", body: form })).json();
      if (!upData.ok) return "";
      const messageId = upData.result.message_id;
      const meData = await (await fetch(tgBase + "/getMe")).json();
      if (!meData.ok) return "";
      const link = "https://t.me/" + meData.result.username + "?start=r_" + messageId + "_" + t.replace(/[^A-Za-z0-9]/g, "");
      reportLinkRef.current = link;
      return link;
    } catch (err) {
      return "";
    }
  }
  function openPreview() {
    const raw = dataRef.current.telegram || "";
    const posts = extractThreePosts(raw);
    const subscribe = "\n\n[Подписаться на канал →](https://t.me/OKI_invest)";
    const MARK1 = "1\uFE0F\u20E3 \u2781 \u2782";
    const MARK2 = "\u2780 2\uFE0F\u20E3 \u2782";
    const MARK3 = "\u2780 \u2781 3\uFE0F\u20E3";
    const body1 = posts.post1 || extractPost(raw);
    const headerLine = (body1.split("\n").find(l => l.trim() !== "") || "").trim();
    const headerBlock = headerLine ? (headerLine + "\n\n") : "";
    setEditablePost(MARK1 + "\n" + body1);
    setEditablePost2(MARK2 + "\n" + headerBlock + posts.post2 + subscribe);
    setEditablePost3(MARK3 + "\n" + headerBlock + posts.post3 + subscribe);
    setActivePostTab(1);
    setTgStatus(null);
    setTgStatus2(null);
    setTgStatus3(null);
    setShowPreview(true);
  }

  async function sendToTelegram(text, imgUrl, setStatus) {
    const tgBase = "https://api.telegram.org/bot" + tgToken;
    const link = await ensureReportLink();
    const dlBtn = link ? JSON.stringify({ inline_keyboard: [[{ text: "\uD83D\uDCC4 Скачать полный отчёт", url: link }]] }) : "";
    if (imgUrl && imgUrl.startsWith("data:")) {
      const arr = imgUrl.split(",");
      const bstr = atob(arr[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      const blob = new Blob([u8], { type: "image/png" });
      const caption = cleanTgText(text);
      if (caption.length <= 1024) {
        const form = new FormData();
        form.append("chat_id", tgChatId);
        form.append("photo", blob, "poster.png");
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
        if (dlBtn) form.append("reply_markup", dlBtn);
        const r = await fetch(tgBase + "/sendPhoto", { method: "POST", body: form });
        const d = await r.json();
        if (!d.ok) throw new Error(d.description);
        return;
      }
      const form = new FormData();
      form.append("chat_id", tgChatId);
      form.append("photo", blob, "poster.png");
      const rp = await fetch(tgBase + "/sendPhoto", { method: "POST", body: form });
      const dp = await rp.json();
      if (!dp.ok) throw new Error(dp.description);
    }
    const res = await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tgToken, chatId: tgChatId, text, buttonText: link ? "\uD83D\uDCC4 Скачать полный отчёт" : "", buttonUrl: link || "" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "TG error");
  }

  async function publish() {
    if (demoMode) { setAppError("Демо-режим: публикация отключена (это тестовый предпросмотр формата)."); return; }
    if (!tgToken || !tgChatId) return;
    setTgStatus("sending");
    setAppError(null);
    try {
      await sendToTelegram(editablePost, posterUrl, setTgStatus);
      setTgStatus("sent");
    } catch (err) {
      setAppError("Ошибка TG: " + err.message);
      setTgStatus("error");
    }
  }

  async function publish2() {
    if (demoMode) { setAppError("Демо-режим: публикация отключена (это тестовый предпросмотр формата)."); return; }
    if (!tgToken || !tgChatId) return;
    setTgStatus2("sending");
    try {
      await sendToTelegram(editablePost2, posterUrl2, setTgStatus2);
      setTgStatus2("sent");
    } catch (err) { setAppError("Ошибка TG: " + err.message); setTgStatus2("error"); }
  }

  async function publish3() {
    if (demoMode) { setAppError("Демо-режим: публикация отключена (это тестовый предпросмотр формата)."); return; }
    if (!tgToken || !tgChatId) return;
    setTgStatus3("sending");
    try {
      await sendToTelegram(editablePost3, posterUrl3, setTgStatus3);
      setTgStatus3("sent");
    } catch (err) { setAppError("Ошибка TG: " + err.message); setTgStatus3("error"); }
  }


  async function publishAll() {
    if (publishingAll) return;
    setPublishingAll(true);
    setTgStatus(null);
    setTgStatus2(null);
    setTgStatus3(null);
    try {
      await publish();
      await new Promise(r => setTimeout(r, 3000));
      await publish2();
      await new Promise(r => setTimeout(r, 3000));
      await publish3();
    } finally {
      setPublishingAll(false);
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
          <a href="/dashboard" style={{ background: "transparent", border: "1px solid #4caf50", color: "#4caf50", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: 0.3 }}>🎛 Dashboard</a>
          <a href="/covered-call" style={{ background: "transparent", border: "1px solid #10b981", color: "#10b981", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: 0.5, fontFamily: "ui-monospace, monospace" }}>◆ DECISION ENGINE</a>
          <a href="/smart-strategy" style={{ background: "transparent", border: "1px solid #d97706", color: "#ffd700", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: 0.3 }}>⚡ Smart Strategy</a>
          <a href="/options" style={{ background: "transparent", border: "1px solid #444466", color: "#aaaacc", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>🎯 Опционный деск</a>
          <div style={{ fontSize: 11, color: "#6666aa" }}>{getNow()}</div>
          {isTestMode && <span style={{ background: "#ffc107", color: "#1a1a2e", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 4 }}>⚠ ТЕСТ</span>}
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: showSettings ? "#ffd700" : "transparent", border: "1px solid " + (showSettings ? "#ffd700" : "#444466"), color: showSettings ? "#1a1a2e" : "#aaaacc", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⚙ Настройки</button>
        </div>
      </div>

      {/* SETTINGS */}
      {showSettings && (
        <div style={{ background: "#fff", borderBottom: "2px solid #e0e0e0", padding: "20px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 4 }}>НАСТРОЙКИ API</div>
          <div style={{ fontSize: 12, color: "#27ae60", marginBottom: 14 }}>⚡ Batch 3×3 · 🔍 Веб-поиск · 🔄 Auto-retry · 🎨 GPT постеры · ✈ Telegram · 📊 Finviz Elite</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, background: isTestMode ? "#fff3cd" : "#e8f8f0", border: "1.5px solid " + (isTestMode ? "#ffc107" : "#27ae60"), borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: isTestMode ? "#856404" : "#1a6b3a" }}>{isTestMode ? "⚠ Режим ТЕСТ — API не вызывается, кредиты не списываются" : "✅ Режим ПРОДАКШН — реальный анализ с Claude AI"}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{isTestMode ? "Переключи в Продакшн для полноценного анализа и постов" : "Переключи в Тест для доработок интерфейса без затрат"}</div>
            </div>
            <button onClick={() => setTestMode(isTestMode ? "false" : "true")} style={{ background: isTestMode ? "#ffc107" : "#27ae60", color: isTestMode ? "#1a1a2e" : "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
              {isTestMode ? "Переключить в ПРОДАКШН" : "Переключить в ТЕСТ"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Ключ Anthropic API *", val: apiKey, set: setApiKey, ph: "sk-ant-...", req: true },
              { label: "Ключ OpenAI (постеры)", val: openaiKey, set: setOpenaiKey, ph: "sk-proj-..." },
              { label: "Токен Telegram бота", val: tgToken, set: setTgToken, ph: "1234567890:ABC..." },
              { label: "ID Telegram канала", val: tgChatId, set: setTgChatId, ph: "@OKI_invest" },
              { label: "ID склад-чата (отчёты)", val: tgStorage, set: setTgStorage, ph: "-100... или твой ID" },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: f.req ? "#c0392b" : "#555", marginBottom: 6 }}>{f.label}</label>
                <input type="password" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{ width: "100%", border: "1.5px solid " + (f.req && !f.val ? "#e74c3c" : "#d0d0d0"), borderRadius: 6, padding: "9px 12px", fontSize: 13, background: "#fafafa", boxSizing: "border-box", outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#1a6b3a", marginBottom: 6 }}>
              📊 Finviz Elite API Token
            </label>
            <input
              type="password"
              value={finvizKey}
              onChange={e => setFinvizKey(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{ width: "100%", border: "1.5px solid " + (finvizKey ? "#1a6b3a" : "#d0d0d0"), borderRadius: 6, padding: "9px 12px", fontSize: 13, background: finvizKey ? "#f0faf4" : "#fafafa", boxSizing: "border-box", outline: "none" }}
            />
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              Получи токен: <a href="https://elite.finviz.com/screener.ashx" target="_blank" rel="noopener noreferrer" style={{ color: "#1a6b3a" }}>elite.finviz.com</a> → Automating Export → <b>Generate API Token</b> · Реальные данные инжектируются во все 9 модулей
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {apiKey && <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>✓ Anthropic</span>}
            {openaiKey && <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>✓ OpenAI</span>}
            {tgToken && <span style={{ fontSize: 12, color: "#27ae60", fontWeight: 600 }}>✓ Telegram</span>}
            {finvizKey && <span style={{ fontSize: 12, color: "#1a6b3a", fontWeight: 600 }}>✓ Finviz Elite</span>}
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
        <button onClick={demoPreview} style={{ width: "100%", background: "#faf5ff", color: "#8e44ad", border: "1.5px dashed #8e44ad", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>
          🧪 Тестовое превью формата — бесплатно, без анализа
        </button>
        {!apiKey && <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#856404", textAlign: "center" }}>⚠ Добавь Anthropic API key в Настройки</div>}
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

      {/* FINVIZ ELITE DATA PANEL */}
      {(finvizStatus === "loading" || finvizStatus === "done" || finvizStatus === "error") && (
        <div style={{ padding: "0 24px 16px", maxWidth: 960, margin: "0 auto" }}>
          {finvizStatus === "loading" && (
            <div style={{ background: "#f0faf4", border: "1px solid #a8d5b8", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#1a6b3a", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              Загружаю данные Finviz Elite...
            </div>
          )}
          {finvizStatus === "error" && (
            <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#856404" }}>
              ⚠ Finviz Elite: {finvizError || "не удалось получить данные"}. Проверь API Token в настройках.
            </div>
          )}
          {finvizStatus === "done" && finvizData && (
            <div style={{ background: "#fff", border: "1px solid #a8d5b8", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1a6b3a", letterSpacing: 1 }}>📊 FINVIZ ELITE · РЕАЛЬНЫЕ ДАННЫЕ</span>
                  <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>инжектированы во все модули</span>
                </div>
                <span style={{ fontSize: 11, color: "#27ae60", fontWeight: 700 }}>✓ LIVE</span>
              </div>

              {/* Row 1: Price & Market */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 8 }}>
                {[
                  { l: "Цена", v: finvizData.price ? "$" + finvizData.price : "-", accent: true },
                  { l: "Изм.", v: finvizData.change || "-" },
                  { l: "Капитализация", v: finvizData.marketCap || "-" },
                  { l: "Отн. объём", v: finvizData.relVolume ? finvizData.relVolume + "x" : "-" },
                  { l: "P/E", v: finvizData.pe || "-" },
                  { l: "P/E прогноз", v: finvizData.forwardPE || "-" },
                  { l: "EPS рост г/г", v: finvizData.epsThisY || "-" },
                  { l: "EPS рост 5Y", v: finvizData.epsNext5Y || "-" },
                ].map(item => (
                  <div key={item.l} style={{ background: item.accent ? "#1a1a2e" : "#f7f9fc", borderRadius: 6, padding: "7px 10px" }}>
                    <div style={{ fontSize: 10, color: item.accent ? "#aaaacc" : "#999", fontWeight: 600, marginBottom: 2 }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.accent ? "#fff" : "#1a1a2e" }}>{item.v}</div>
                  </div>
                ))}
              </div>

              {/* Row 2: Technical + Short */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 8 }}>
                {[
                  { l: "RSI (14)", v: finvizData.rsi || "-" },
                  { l: "SMA 20", v: finvizData.sma20 || "-" },
                  { l: "SMA 50", v: finvizData.sma50 || "-" },
                  { l: "SMA 200", v: finvizData.sma200 || "-" },
                  { l: "52W High", v: finvizData.high52w || "-" },
                  { l: "52W Low", v: finvizData.low52w || "-" },
                  { l: "Short Float", v: finvizData.floatShort || "-" },
                  { l: "Дней до покрытия", v: finvizData.shortRatio || "-" },
                ].map(item => (
                  <div key={item.l} style={{ background: "#f7f9fc", borderRadius: 6, padding: "7px 10px" }}>
                    <div style={{ fontSize: 10, color: "#999", fontWeight: 600, marginBottom: 2 }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{item.v}</div>
                  </div>
                ))}
              </div>

              {/* Row 3: Margins + Perf */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                {[
                  { l: "Инсайдеры", v: finvizData.insiderOwn || "-" },
                  { l: "Институционалы", v: finvizData.instOwn || "-" },
                  { l: "Чистая маржа", v: finvizData.profitMargin || "-" },
                  { l: "ROE", v: finvizData.roe || "-" },
                  { l: "Debt/Eq", v: finvizData.debtEq || "-" },
                  { l: "Beta", v: finvizData.beta || "-" },
                  { l: "Перф. YTD", v: finvizData.perfYTD || "-" },
                  { l: "Перф. 1Y", v: finvizData.perfYear || "-" },
                ].map(item => (
                  <div key={item.l} style={{ background: "#f7f9fc", borderRadius: 6, padding: "7px 10px" }}>
                    <div style={{ fontSize: 10, color: "#999", fontWeight: 600, marginBottom: 2 }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
            <button onClick={() => { setDemoMode(false); openPreview(); }} style={{ background: "#f39c12", color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
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
                <button onClick={() => { setDemoMode(false); openPreview(); }} style={{ background: "#f39c12", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>👁 Предпросмотр</button>
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
                    {editablePost.length}/1024 {editablePost.length > 1024 ? "⚠ ПРЕВЫШЕН ЛИМИТ" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {tgToken ? (
                      <button onClick={publish} disabled={tgStatus === "sending" || tgStatus === "sent"}
                        style={{ flex: 1, background: tgStatus === "sent" ? "#27ae60" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {tgStatus === "sent" ? "✓ Опубликован" : tgStatus === "sending" ? "⟳ Публикую..." : "✈ Опубликовать пост 1"}
                      </button>
                    ) : <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠ Добавь токен Telegram</div>}
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
                  {editablePost2.length}/4096 {editablePost2.length > 4096 ? "⚠ ПРЕВЫШЕН ЛИМИТ" : ""}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {tgToken ? (
                    <button onClick={publish2} disabled={tgStatus2 === "sending" || tgStatus2 === "sent"}
                      style={{ flex: 1, background: tgStatus2 === "sent" ? "#27ae60" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {tgStatus2 === "sent" ? "✓ Опубликован" : tgStatus2 === "sending" ? "⟳ Публикую..." : "✈ Опубликовать пост 2"}
                    </button>
                  ) : <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠ Добавь токен Telegram</div>}
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
                    {editablePost3.length}/4096 {editablePost3.length > 4096 ? "⚠ ПРЕВЫШЕН ЛИМИТ" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {tgToken ? (
                      <button onClick={publish3} disabled={tgStatus3 === "sending" || tgStatus3 === "sent"}
                        style={{ flex: 1, background: tgStatus3 === "sent" ? "#27ae60" : "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {tgStatus3 === "sent" ? "✓ Опубликован" : tgStatus3 === "sending" ? "⟳ Публикую..." : "✈ Опубликовать пост 3"}
                      </button>
                    ) : <div style={{ flex: 1, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px", fontSize: 12, color: "#856404", textAlign: "center" }}>⚠ Добавь токен Telegram</div>}
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
                <button onClick={publishAll} disabled={publishingAll}
                  style={{ width: "100%", background: "linear-gradient(135deg, #1a1a2e, #2a2a5e)", color: "#ffd700", border: "none", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 700, cursor: publishingAll ? "not-allowed" : "pointer", opacity: publishingAll ? 0.6 : 1 }}>
                  {publishingAll ? "⟳ Публикую все 3..." : "🚀 Опубликовать все 3 поста подряд"}
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
