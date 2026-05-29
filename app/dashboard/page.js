"use client";
import { useEffect, useMemo, useState } from "react";

// Same access gate as /options + /smart-strategy — one password unlocks all.
const KEY_ACCESS = "hi_access";
const PASSWORD   = "okiinvest2026";

// Dashboard displays Moscow time (Europe/Moscow, UTC+3, no DST).
// IMPORTANT: the content-agent on the Mac mini operates on Europe/Amsterdam
// (TIMEZONE in agents/content-agent/config.py + PUBLISH_WINDOW_START/END in
// main.py). The dashboard is a PRESENTATION VIEW in Moscow clock — the
// numbers below (15:30, 22:00, 07:00, 23:00) are reinterpreted as Moscow
// clock hours. If you want the dashboard window to match the agent's actual
// publish behavior, the agent's TIMEZONE needs to switch to Europe/Moscow too.
const PUBLISH_WINDOW_START_MIN = 15 * 60 + 30; // 15:30 Moscow
const PUBLISH_WINDOW_END_MIN   = 22 * 60;       // 22:00 Moscow (exclusive)

// CronTrigger schedule (numbers interpreted as Moscow clock — see note above).
const PREMARKET_HOUR     = 7;   // 07:00 Moscow
const DAILY_SUMMARY_HOUR = 23;  // 23:00 Moscow

// Fetch interval (config.FETCH_INTERVAL_MIN default).
const FETCH_INTERVAL_MIN = 5;

const TELEGRAM_CHANNEL = "OKI_invest";

// Local-CLI commands shown in the quick-action modal. The agent runs on the
// Mac mini under launchd — these commands let the user trigger a one-off
// pre-market / summary cycle manually from the same machine.
// Icons — function refs (hoisted), defined ниже в файле. Эмодзи убраны
// согласно DESIGN_CODE.md (Lucide-style thin inline SVG).
const ACTIONS = [
  {
    id: "premarket",
    icon: IconSun,
    label: "Опубликовать pre-market сейчас",
    cmd: "cd ~/jarvis/agents/content-agent && .venv/bin/python main.py --premarket",
    note: "Запускает one-shot pre-market дайджест в Telegram. Окно публикации игнорируется.",
  },
  {
    id: "summary",
    icon: IconBarChart,
    label: "Запустить daily summary",
    cmd: "cd ~/jarvis/agents/content-agent && .venv/bin/python main.py --summary",
    note: "Запускает one-shot вечерний свод. Окно публикации игнорируется.",
  },
  {
    id: "channel",
    icon: IconSend,
    label: "Открыть @OKI_invest",
    href: `https://t.me/${TELEGRAM_CHANNEL}`,
  },
  {
    id: "hedge",
    icon: IconTrendingUp,
    label: "Открыть Hedge Intel",
    href: "/",
  },
];

const SOURCES = [
  { id: "finviz",  name: "Finviz Elite News",  detail: "elite.finviz.com (token FINVIZ_KEY)" },
  { id: "rss",     name: "RSS (9 источников)", detail: "Bloomberg, Reuters, FT, Seeking Alpha, MarketWatch, ..." },
  { id: "reddit",  name: "Reddit (PullPush)",  detail: "r/wallstreetbets velocity confirmation" },
  { id: "fmp",     name: "FMP",                detail: "financialmodelingprep.com — fundamentals & news" },
  { id: "mt",      name: "MT Newswires",       detail: "via Finviz aggregator" },
  { id: "sec",     name: "SEC EDGAR Form 4",   detail: "Insider transactions — покупки и продажи" },
];

// ---------- time helpers (Europe/Moscow-aware) ----------

/** Parse current Date into Moscow clock parts: {y, mo, d, h, m, dayOfWeek}. */
function mskParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year:  "numeric", month: "2-digit", day:    "2-digit",
    hour:  "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    y: parseInt(p.year, 10),
    mo: parseInt(p.month, 10),
    d: parseInt(p.day, 10),
    h: parseInt(p.hour, 10),
    m: parseInt(p.minute, 10),
    s: parseInt(p.second, 10),
    weekday: p.weekday,
  };
}

/** Minutes until next Moscow-clock hour=H minute=M. Returns {minutes, today}. */
function minutesUntilNext(targetH, targetM = 0, parts = null) {
  parts = parts || mskParts();
  const nowMin    = parts.h * 60 + parts.m;
  const targetMin = targetH * 60 + targetM;
  let diff = targetMin - nowMin;
  const today = diff > 0;
  if (diff <= 0) diff += 24 * 60;
  return { minutes: diff, today };
}

function fmtDuration(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** True iff Moscow clock is within publish window. */
function inPublishWindow(parts) {
  const min = parts.h * 60 + parts.m;
  return min >= PUBLISH_WINDOW_START_MIN && min < PUBLISH_WINDOW_END_MIN;
}

/** Two-digit clock string for display. */
function pad2(n) { return String(n).padStart(2, "0"); }

/** Render a TG-stats value with consistent loading/error/missing fallbacks.
 *  Цвета — приглушённые DESIGN_CODE: text-secondary для пусто/загрузки,
 *  market-down для ошибок. */
function tgValue(stats, error, loading, getter) {
  if (loading) return <span style={{ color: "#9CA3AF" }}>загрузка…</span>;
  if (error)   return <span style={{ color: "#8E4343", fontSize: 11 }} title={error}>ошибка</span>;
  if (!stats)  return <span style={{ color: "#9CA3AF" }}>—</span>;
  try {
    const v = getter(stats);
    if (v == null || v === "") return <span style={{ color: "#9CA3AF" }}>—</span>;
    return v;
  } catch {
    return <span style={{ color: "#9CA3AF" }}>—</span>;
  }
}

/** "5 мин назад", "2 ч назад", "вчера", etc. Pure UI — accepts ms delta. */
function relativeTimeRu(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "только что";
  const m = Math.floor(deltaMs / 60_000);
  if (m < 1)    return "только что";
  if (m < 60)   return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1)  return "вчера";
  if (d < 7)    return `${d} дн назад`;
  const w = Math.floor(d / 7);
  return `${w} нед назад`;
}

/** Truncate for the small subtitle line under a stat card value. */
function truncateForSub(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

// ===========================================================================

export default function Dashboard() {
  // ----- access gate -----
  const [hasAccess, setHasAccess]         = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Tick the clock once a minute — keeps "next firing in X min" and window
  // status fresh without busy-looping. SSR-safe: starts ticking only after mount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    try { setHasAccess(localStorage.getItem(KEY_ACCESS) === "1"); } catch {}
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  // Quick-action modal state (for premarket/summary CLI commands).
  const [modal, setModal] = useState(null); // { label, cmd, note }
  const [copied, setCopied] = useState(false);

  // Live Telegram channel stats — refreshed every 5 min via /api/telegram-stats.
  // Requires TG_BOT_TOKEN + TG_CHANNEL_ID env vars on Vercel (see route.js).
  // Bot must be admin in the channel for accurate subscriber count.
  const [tgStats, setTgStats] = useState(null);
  const [tgError, setTgError] = useState(null);
  const [tgLoading, setTgLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const r = await fetch("/api/telegram-stats", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        if (data.ok) {
          setTgStats(data);
          setTgError(null);
        } else {
          setTgError(data.error || "TG stats fetch failed");
        }
      } catch (e) {
        if (!cancelled) setTgError(e.message || "network error");
      } finally {
        if (!cancelled) setTgLoading(false);
      }
    }
    refresh();
    const id = setInterval(refresh, 5 * 60_000); // every 5 minutes
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function tryLogin() {
    if (passwordInput === PASSWORD) {
      try { localStorage.setItem(KEY_ACCESS, "1"); } catch {}
      try { window.dispatchEvent(new Event("hi-access-changed")); } catch {}
      setHasAccess(true); setPasswordError(""); setPasswordInput("");
    } else {
      setPasswordError("Неверный пароль");
    }
  }

  const parts = useMemo(() => mskParts(now), [now]);
  const windowOpen = useMemo(() => inPublishWindow(parts), [parts]);
  const nextPremarket = useMemo(() => minutesUntilNext(PREMARKET_HOUR, 0, parts), [parts]);
  const nextSummary   = useMemo(() => minutesUntilNext(DAILY_SUMMARY_HOUR, 0, parts), [parts]);
  const nextWindowStart = useMemo(() => {
    if (windowOpen) return null;
    return minutesUntilNext(Math.floor(PUBLISH_WINDOW_START_MIN / 60), PUBLISH_WINDOW_START_MIN % 60, parts);
  }, [parts, windowOpen]);

  // Password gate render
  if (!hasAccess) {
    return (
      <div style={S.page}>
        <div style={S.lockBox}>
          <h1 style={S.title}>JARVIS Command Centre</h1>
          <p style={S.subtitle}>Введи пароль для доступа.</p>
          <input
            style={{ ...S.inp, marginTop: 12, width: "100%" }}
            type="password"
            value={passwordInput}
            placeholder="пароль"
            autoFocus
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") tryLogin(); }}
          />
          {passwordError && <div style={S.errorInline}>{passwordError}</div>}
          <button style={{ ...S.btn, marginTop: 12 }} onClick={tryLogin}>Войти</button>
        </div>
      </div>
    );
  }

  const clockStr = `${pad2(parts.h)}:${pad2(parts.m)}`;
  const dateStr  = `${pad2(parts.d)}.${pad2(parts.mo)}.${parts.y}`;

  return (
    <div style={S.page}>
      <h1 style={S.title}>JARVIS Command Centre</h1>
      <p style={S.subtitle}>
        Статус системы и быстрые действия. Данные обновляются при загрузке страницы и тикают раз в минуту.
      </p>

      {/* Live header — current Moscow time + publish-window state.
          Border-color меняется приглушённо: market-up при открытом окне,
          market-warning при закрытом. Без неона. */}
      <div style={{ ...S.heroBar, borderColor: windowOpen ? "#2E7D5B" : "#A36D2D" }}>
        <div style={S.heroLeft}>
          <div style={S.heroLabel}>Сейчас в Москве</div>
          <div style={S.heroClock}>{clockStr}</div>
          <div style={S.heroDate}>{dateStr} · {parts.weekday}</div>
        </div>
        <div style={S.heroRight}>
          <div style={{ ...S.heroBadge, color: windowOpen ? "#2E7D5B" : "#A36D2D", borderColor: windowOpen ? "#2E7D5B" : "#A36D2D" }}>
            <StatusDot kind={windowOpen ? "up" : "warning"} />
            {windowOpen ? "Окно публикации ОТКРЫТО" : "Окно публикации ЗАКРЫТО"}
          </div>
          <div style={S.heroSub}>
            {windowOpen
              ? `до 22:00 (через ${fmtDuration(PUBLISH_WINDOW_END_MIN - (parts.h * 60 + parts.m))})`
              : nextWindowStart && `следующее открытие ${nextWindowStart.today ? "сегодня" : "завтра"} в 15:30 (через ${fmtDuration(nextWindowStart.minutes)})`}
          </div>
        </div>
      </div>

      {/* ===== СЕКЦИЯ 1 — АГЕНТЫ ===== */}
      <h2 style={S.h2}>1 · Агенты</h2>
      <div style={S.grid3}>
        <AgentCard
          Icon={IconBot}
          name="Content Agent"
          subtitle={`Telegram @${TELEGRAM_CHANNEL}`}
          status="active"
          rows={[
            { k: "Окно публикации", v: <StatusPill kind={windowOpen ? "up" : "warning"} label={windowOpen ? "открыто" : "закрыто"} /> },
            { k: "Интервал фетча",  v: `${FETCH_INTERVAL_MIN} мин` },
            { k: "Постов сегодня",  v: tgValue(tgStats, tgError, tgLoading, (s) => s.postsToday) },
            { k: "Последний пост",  v: tgValue(tgStats, tgError, tgLoading, (s) =>
                s.lastPost ? relativeTimeRu(now.getTime() - s.lastPost.timestamp) : "нет постов"
              ) },
          ]}
        />
        <AgentCard
          Icon={IconSun}
          name="Pre-market Agent"
          subtitle="Дайджест перед открытием US"
          status="scheduled"
          rows={[
            { k: "Расписание",       v: "07:00 Москва ежедневно" },
            { k: "Следующий запуск", v: `${nextPremarket.today ? "сегодня" : "завтра"} в 07:00` },
            { k: "Через",            v: fmtDuration(nextPremarket.minutes) },
          ]}
        />
        <AgentCard
          Icon={IconMoon}
          name="Daily Summary"
          subtitle="Вечерний свод дня"
          status="scheduled"
          rows={[
            { k: "Расписание",       v: "23:00 Москва ежедневно" },
            { k: "Следующий запуск", v: `${nextSummary.today ? "сегодня" : "завтра"} в 23:00` },
            { k: "Через",            v: fmtDuration(nextSummary.minutes) },
          ]}
        />
      </div>

      {/* ===== СЕКЦИЯ 2 — СТАТИСТИКА КАНАЛА ===== */}
      <h2 style={S.h2}>2 · Канал @{TELEGRAM_CHANNEL}</h2>
      <div style={S.grid4}>
        <StatCard
          k="Подписчиков"
          v={tgValue(tgStats, tgError, tgLoading, (s) => s.subscribers != null ? s.subscribers.toLocaleString("ru-RU") : "—")}
          sub={tgStats?.source?.subscribers === "bot_api" ? "Bot API · live" : tgStats?.source?.subscribers === "scrape" ? "t.me/s scrape" : "обновляется каждые 5 мин"}
        />
        <StatCard
          k="Постов сегодня"
          v={tgValue(tgStats, tgError, tgLoading, (s) => s.postsToday)}
          sub="с 00:00 Москвы"
        />
        <StatCard
          k="Постов за неделю"
          v={tgValue(tgStats, tgError, tgLoading, (s) => s.postsThisWeek)}
          sub="последние 7 дней"
        />
        <StatCard
          k="Последний пост"
          v={tgValue(tgStats, tgError, tgLoading, (s) =>
            s.lastPost ? relativeTimeRu(now.getTime() - s.lastPost.timestamp) : "нет постов"
          )}
          sub={tgStats?.lastPost?.text ? truncateForSub(tgStats.lastPost.text, 60) : "—"}
        />
      </div>
      <div style={S.grid4}>
        <StatCard
          k="Publish window"
          v={<StatusPill kind={windowOpen ? "up" : "warning"} label={windowOpen ? "открыто" : "закрыто"} />}
          sub="15:30-22:00 Москва"
        />
      </div>

      {/* ===== СЕКЦИЯ 3 — ИСТОЧНИКИ ДАННЫХ ===== */}
      <h2 style={S.h2}>3 · Источники данных</h2>
      <div style={S.grid4}>
        {SOURCES.map((s) => (
          <SourceCard key={s.id} name={s.name} detail={s.detail} />
        ))}
      </div>

      {/* ===== СЕКЦИЯ 4 — БЫСТРЫЕ ДЕЙСТВИЯ ===== */}
      <h2 style={S.h2}>4 · Быстрые действия</h2>
      <div style={S.grid4}>
        {ACTIONS.map((a) => (
          <ActionCard
            key={a.id}
            Icon={a.icon}
            label={a.label}
            onClick={() => {
              if (a.href) { window.open(a.href, a.href.startsWith("/") ? "_self" : "_blank"); }
              else { setModal({ label: a.label, cmd: a.cmd, note: a.note }); setCopied(false); }
            }}
          />
        ))}
      </div>

      {modal && (
        <CommandModal
          modal={modal}
          copied={copied}
          onCopy={() => {
            navigator.clipboard?.writeText(modal.cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ---------- presentational components ----------

function AgentCard({ Icon, name, subtitle, status, rows }) {
  const statusLabel = status === "active" ? "Активен" : "По расписанию";
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={S.cardIcon}><Icon size={22} /></div>
        <div style={{ flex: 1 }}>
          <div style={S.cardTitle}>{name}</div>
          <div style={S.cardSub}>{subtitle}</div>
        </div>
        <div style={S.statusBadge}>
          <StatusDot kind="up" />
          <span>{statusLabel}</span>
        </div>
      </div>
      <div style={S.kvList}>
        {rows.map((r, i) => (
          <div key={i} style={S.kvRow}>
            <div style={S.kvKey}>{r.k}</div>
            <div style={S.kvVal}>{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ k, v, sub }) {
  return (
    <div style={S.statCard}>
      <div style={S.statKey}>{k}</div>
      <div style={S.statVal}>{v}</div>
      {sub && <div style={S.statSub}>{sub}</div>}
    </div>
  );
}

function SourceCard({ name, detail }) {
  return (
    <div style={S.sourceCard}>
      <div style={S.sourceIcon}><IconCheck size={16} /></div>
      <div>
        <div style={S.sourceName}>{name}</div>
        <div style={S.sourceDetail}>{detail}</div>
      </div>
    </div>
  );
}

function ActionCard({ Icon, label, onClick }) {
  return (
    <button style={S.actionCard} onClick={onClick}>
      <div style={S.actionIcon}><Icon size={20} /></div>
      <div style={S.actionLabel}>{label}</div>
    </button>
  );
}

function CommandModal({ modal, copied, onCopy, onClose }) {
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{modal.label}</div>
          <button style={S.modalClose} onClick={onClose}>×</button>
        </div>
        {modal.note && <div style={S.modalNote}>{modal.note}</div>}
        <div style={S.modalCmdLabel}>Команда для запуска на Mac mini:</div>
        <pre style={S.modalCmd}>{modal.cmd}</pre>
        <button style={S.btnPrimary} onClick={onCopy}>
          {copied ? "Скопировано" : "Скопировать команду"}
        </button>
      </div>
    </div>
  );
}

// Цветной dot-индикатор статуса — спокойный приглушённый круг.
// kind: "up" (market-up), "warning" (market-warning), "neutral" (market-neutral).
function StatusDot({ kind = "neutral", size = 8 }) {
  const color = kind === "up" ? "#2E7D5B"
              : kind === "warning" ? "#A36D2D"
              : "#6B7280";
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ display: "inline-block", flexShrink: 0 }}>
      <circle cx="4" cy="4" r="3.2" fill={color} />
    </svg>
  );
}

// Inline-pill для значений вроде "открыто/закрыто" — dot + label вместе.
function StatusPill({ kind = "neutral", label }) {
  const color = kind === "up" ? "#2E7D5B"
              : kind === "warning" ? "#A36D2D"
              : "#6B7280";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color }}>
      <StatusDot kind={kind} />
      <span>{label}</span>
    </span>
  );
}

function Muted({ children }) {
  return <span style={{ color: "#6B7280" }}>{children}</span>;
}

// ---------- icons (Lucide MIT — inline SVG, stroke 1.5, без зависимостей) ----------

function IconSvg({ children, size = 18 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block" }}
    >{children}</svg>
  );
}
function IconBot({ size }) {
  return (
    <IconSvg size={size}>
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" /><path d="M20 14h2" />
      <path d="M15 13v2" /><path d="M9 13v2" />
    </IconSvg>
  );
}
function IconSun({ size }) {
  return (
    <IconSvg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </IconSvg>
  );
}
function IconMoon({ size }) {
  return (
    <IconSvg size={size}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </IconSvg>
  );
}
function IconCheck({ size }) {
  return (
    <IconSvg size={size}>
      <path d="M20 6 9 17l-5-5" />
    </IconSvg>
  );
}
function IconSend({ size }) {
  return (
    <IconSvg size={size}>
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </IconSvg>
  );
}
function IconBarChart({ size }) {
  return (
    <IconSvg size={size}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
    </IconSvg>
  );
}
function IconTrendingUp({ size }) {
  return (
    <IconSvg size={size}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </IconSvg>
  );
}

// ===========================================================================
// Стили — палитра DESIGN_CODE.md (Bloomberg / Aladdin / Palantir институциональный
// look). Без неона, ярких биржевых цветов, эмодзи. Карточки единые: --bg-alt,
// border 1px --divider, radius 18px. SF Pro Display для текста, IBM Plex Mono
// для метрик и команд.
// ===========================================================================

// Палитра — locked здесь как локальные константы для самодокументируемости
// (продублировано в Nav.js — каждая страница может править свой scope без
// гарантированного импорта тем).
const C = {
  bgMain:        "#15181C",
  bgAlt:         "#1A1E23",
  bgCard:        "#20252B",
  emerald:       "#12473D",
  petrol:        "#1D4258",
  textWhite:     "#FFFFFF",
  textPrimary:   "#D6D9DE",
  textSecondary: "#9CA3AF",
  divider:       "#2A2E34",
  marketUp:      "#2E7D5B",
  marketDown:    "#8E4343",
  marketNeutral: "#6B7280",
  marketWarning: "#A36D2D",
  marketInfo:    "#2F5F88",
};
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, 'Helvetica Neue', sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const S = {
  page: { background: C.bgMain, color: C.textPrimary, minHeight: "100vh", padding: "24px 32px 64px", fontFamily: FONT_SANS, position: "relative", maxWidth: 1300, margin: "0 auto" },
  title: { margin: "0 0 4px", fontSize: 26, color: C.textWhite, fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: -0.2 },
  subtitle: { margin: "0 0 24px", color: C.textSecondary, fontSize: 13, fontFamily: FONT_SANS },
  // Заголовки секций — приглушённый text-secondary, без оранжевого.
  h2: { margin: "32px 0 14px", color: C.textSecondary, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: FONT_SANS },

  // Lock screen
  lockBox: { maxWidth: 380, margin: "12vh auto 0", padding: "28px 32px", background: C.bgAlt, border: `1px solid ${C.divider}`, borderRadius: 18 },
  inp: { padding: "10px 12px", background: C.bgMain, color: C.textPrimary, border: `1px solid ${C.divider}`, borderRadius: 6, fontSize: 14, fontFamily: FONT_SANS, outline: "none" },
  btn: { padding: "10px 22px", background: C.emerald, color: C.textWhite, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT_SANS },
  btnPrimary: { padding: "10px 22px", background: C.emerald, color: C.textWhite, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT_SANS },
  errorInline: { color: C.marketDown, marginTop: 8, fontSize: 13, fontFamily: FONT_SANS },

  // Hero bar (Moscow clock + window state) — единая карточка с цветным border'ом.
  heroBar:    { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "22px 26px", background: C.bgAlt, border: "1px solid", borderRadius: 18, marginBottom: 24 },
  heroLeft:   { display: "flex", flexDirection: "column", gap: 4 },
  heroLabel:  { color: C.textSecondary, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_SANS },
  // Часы — крупно, моноширинно. 32-48px per DESIGN_CODE для ключевых метрик.
  heroClock:  { color: C.textWhite, fontSize: 44, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.05, fontFamily: FONT_MONO, letterSpacing: -0.5 },
  heroDate:   { color: C.textSecondary, fontSize: 12, marginTop: 4, fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" },
  heroRight:  { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" },
  // Бейдж — прозрачный фон, цветной текст и border-цвет передаются по месту.
  heroBadge:  { padding: "8px 14px", background: "transparent", border: "1px solid", borderRadius: 8, fontSize: 12, fontWeight: 600, letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT_SANS },
  heroSub:    { color: C.textSecondary, fontSize: 12, fontFamily: FONT_SANS },

  // Section grids
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 },

  // Agent card — единая база для всех карточек.
  card:       { background: C.bgAlt, border: `1px solid ${C.divider}`, borderRadius: 18, padding: "18px 20px" },
  cardHead:   { display: "flex", alignItems: "center", gap: 14, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.divider}` },
  // Иконка карточки — спокойный приглушённый petrol-blue.
  cardIcon:   { width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 10, color: C.textSecondary, flexShrink: 0 },
  cardTitle:  { color: C.textWhite, fontSize: 14, fontWeight: 600, fontFamily: FONT_SANS },
  cardSub:    { color: C.textSecondary, fontSize: 11, marginTop: 3, fontFamily: FONT_SANS },
  statusBadge:{ padding: "5px 10px", background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 6, fontSize: 11, color: C.marketUp, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT_SANS },
  kvList:     { display: "flex", flexDirection: "column", gap: 8 },
  kvRow:      { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 12 },
  kvKey:      { color: C.textSecondary, fontFamily: FONT_SANS },
  // Значения — моноширинно, особенно для дат/времени/чисел.
  kvVal:      { color: C.textPrimary, fontWeight: 500, fontVariantNumeric: "tabular-nums", textAlign: "right", fontFamily: FONT_MONO, fontSize: 12 },

  // Channel stat card
  statCard:   { background: C.bgAlt, border: `1px solid ${C.divider}`, borderRadius: 18, padding: "18px 20px" },
  statKey:    { color: C.textSecondary, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontFamily: FONT_SANS },
  // Метрика крупно, моноширинно.
  statVal:    { color: C.textWhite, fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFamily: FONT_MONO, letterSpacing: -0.3 },
  statSub:    { color: C.textSecondary, fontSize: 11, marginTop: 6, fontFamily: FONT_SANS },

  // Source card
  sourceCard:  { display: "flex", alignItems: "flex-start", gap: 12, background: C.bgAlt, border: `1px solid ${C.divider}`, borderRadius: 18, padding: "14px 16px" },
  sourceIcon:  { color: C.marketUp, display: "flex", alignItems: "center", paddingTop: 2, flexShrink: 0 },
  sourceName:  { color: C.textWhite, fontSize: 13, fontWeight: 600, fontFamily: FONT_SANS },
  sourceDetail:{ color: C.textSecondary, fontSize: 11, marginTop: 3, lineHeight: 1.4, fontFamily: FONT_SANS },

  // Action card (button)
  actionCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, background: C.bgAlt, border: `1px solid ${C.divider}`, borderRadius: 18, padding: "18px 20px", cursor: "pointer", textAlign: "left", color: C.textPrimary, fontFamily: FONT_SANS, transition: "border-color 120ms ease" },
  actionIcon: { width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 10, color: C.textSecondary },
  actionLabel:{ fontSize: 13, fontWeight: 500, color: C.textWhite, fontFamily: FONT_SANS, lineHeight: 1.35 },

  // Command modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  modalBox:     { background: C.bgAlt, border: `1px solid ${C.divider}`, borderRadius: 18, padding: "22px 26px", maxWidth: 600, width: "100%" },
  modalHead:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle:   { color: C.textWhite, fontSize: 16, fontWeight: 600, fontFamily: FONT_SANS },
  modalClose:   { background: "transparent", border: "none", color: C.textSecondary, fontSize: 24, cursor: "pointer", padding: 0, width: 28, height: 28, fontFamily: FONT_SANS },
  modalNote:    { color: C.textSecondary, fontSize: 12, marginBottom: 14, lineHeight: 1.5, fontFamily: FONT_SANS },
  modalCmdLabel:{ color: C.textSecondary, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: FONT_SANS },
  // Код — IBM Plex Mono, спокойный text-primary вместо оранжевого.
  modalCmd:     { background: C.bgMain, border: `1px solid ${C.divider}`, borderRadius: 8, padding: "12px 14px", color: C.textPrimary, fontSize: 12, fontFamily: FONT_MONO, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "0 0 14px 0", lineHeight: 1.5 },
};
