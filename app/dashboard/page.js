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
const ACTIONS = [
  {
    id: "premarket",
    icon: "🌅",
    label: "Опубликовать pre-market сейчас",
    cmd: "cd ~/jarvis/agents/content-agent && .venv/bin/python main.py --premarket",
    note: "Запускает one-shot pre-market дайджест в Telegram. Окно публикации игнорируется.",
  },
  {
    id: "summary",
    icon: "📊",
    label: "Запустить daily summary",
    cmd: "cd ~/jarvis/agents/content-agent && .venv/bin/python main.py --summary",
    note: "Запускает one-shot вечерний свод. Окно публикации игнорируется.",
  },
  {
    id: "channel",
    icon: "✈",
    label: "Открыть @OKI_invest",
    href: `https://t.me/${TELEGRAM_CHANNEL}`,
  },
  {
    id: "hedge",
    icon: "📈",
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

/** Render a TG-stats value with consistent loading/error/missing fallbacks. */
function tgValue(stats, error, loading, getter) {
  if (loading) return <span style={{ color: "#666" }}>загрузка…</span>;
  if (error)   return <span style={{ color: "#e57373", fontSize: 11 }} title={error}>ошибка</span>;
  if (!stats)  return <span style={{ color: "#666" }}>—</span>;
  try {
    const v = getter(stats);
    if (v == null || v === "") return <span style={{ color: "#666" }}>—</span>;
    return v;
  } catch {
    return <span style={{ color: "#666" }}>—</span>;
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

      {/* Live header — current Moscow time + publish-window state */}
      <div style={{ ...S.heroBar, borderColor: windowOpen ? "#4caf50" : "#e57373" }}>
        <div style={S.heroLeft}>
          <div style={S.heroLabel}>Сейчас в Москве</div>
          <div style={S.heroClock}>{clockStr}</div>
          <div style={S.heroDate}>{dateStr} · {parts.weekday}</div>
        </div>
        <div style={S.heroRight}>
          <div style={{ ...S.heroBadge, background: windowOpen ? "#1a2e1e" : "#2e1a1a", color: windowOpen ? "#4caf50" : "#e57373", borderColor: windowOpen ? "#4caf50" : "#e57373" }}>
            {windowOpen ? "🟢 Окно публикации ОТКРЫТО" : "🔴 Окно публикации ЗАКРЫТО"}
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
          icon="🤖"
          name="Content Agent"
          subtitle={`Telegram @${TELEGRAM_CHANNEL}`}
          status="active"
          rows={[
            { k: "Окно публикации", v: windowOpen ? "🟢 открыто" : "🔴 закрыто" },
            { k: "Интервал фетча",  v: `${FETCH_INTERVAL_MIN} мин` },
            { k: "Постов сегодня",  v: tgValue(tgStats, tgError, tgLoading, (s) => s.postsToday) },
            { k: "Последний пост",  v: tgValue(tgStats, tgError, tgLoading, (s) =>
                s.lastPost ? relativeTimeRu(now.getTime() - s.lastPost.timestamp) : "нет постов"
              ) },
          ]}
        />
        <AgentCard
          icon="🌅"
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
          icon="🌙"
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
          v={windowOpen ? "🟢 открыто" : "🔴 закрыто"}
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
            icon={a.icon}
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

function AgentCard({ icon, name, subtitle, status, rows }) {
  const statusLabel = status === "active" ? "🟢 Активен" : "🟢 По расписанию";
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={S.cardIcon}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={S.cardTitle}>{name}</div>
          <div style={S.cardSub}>{subtitle}</div>
        </div>
        <div style={S.statusBadge}>{statusLabel}</div>
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
      <div style={S.sourceIcon}>✅</div>
      <div>
        <div style={S.sourceName}>{name}</div>
        <div style={S.sourceDetail}>{detail}</div>
      </div>
    </div>
  );
}

function ActionCard({ icon, label, onClick }) {
  return (
    <button style={S.actionCard} onClick={onClick}>
      <div style={S.actionIcon}>{icon}</div>
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
          {copied ? "✓ Скопировано" : "Скопировать команду"}
        </button>
      </div>
    </div>
  );
}

function Muted({ children }) {
  return <span style={{ color: "#666" }}>{children}</span>;
}

// ===========================================================================
// styles — dark theme, matches /options + /smart-strategy
// ===========================================================================

const S = {
  page: { background: "#0d0e10", color: "#e6e6e6", minHeight: "100vh", padding: "24px 32px 64px", fontFamily: "system-ui, sans-serif", position: "relative", maxWidth: 1300, margin: "0 auto" },
  title: { margin: "0 0 4px", fontSize: 26, color: "#fff" },
  subtitle: { margin: "0 0 20px", color: "#888", fontSize: 13 },
  h2: { margin: "28px 0 12px", color: "#d97706", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 },

  topBar:    { position: "absolute", top: 18, right: 24, display: "flex", gap: 8, alignItems: "center" },
  navLink:   { padding: "6px 12px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none" },
  logoutBtn: { padding: "6px 12px", background: "#1a1c20", color: "#aaa", border: "1px solid #2a2d33", borderRadius: 4, cursor: "pointer", fontSize: 12 },

  lockBox: { maxWidth: 360, margin: "10vh auto 0", padding: "24px 28px", background: "#161820", border: "1px solid #2a2d33", borderRadius: 8 },
  inp: { padding: "8px 10px", background: "#1a1c20", color: "#e6e6e6", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 13 },
  btn: { padding: "9px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnPrimary: { padding: "10px 24px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  errorInline: { color: "#e57373", marginTop: 8, fontSize: 14 },

  // Hero bar (Moscow clock + window state)
  heroBar:    { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "18px 24px", background: "#161820", border: "2px solid", borderRadius: 10, marginBottom: 8 },
  heroLeft:   { display: "flex", flexDirection: "column", gap: 2 },
  heroLabel:  { color: "#888", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  heroClock:  { color: "#fff", fontSize: 42, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1 },
  heroDate:   { color: "#aaa", fontSize: 12, marginTop: 4 },
  heroRight:  { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" },
  heroBadge:  { padding: "8px 14px", border: "1px solid", borderRadius: 6, fontSize: 13, fontWeight: 700 },
  heroSub:    { color: "#888", fontSize: 12 },

  // Section grids
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },

  // Agent card
  card:       { background: "#161820", border: "1px solid #2a2d33", borderRadius: 8, padding: "16px 18px" },
  cardHead:   { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #2a2d33" },
  cardIcon:   { fontSize: 28 },
  cardTitle:  { color: "#fff", fontSize: 14, fontWeight: 700 },
  cardSub:    { color: "#888", fontSize: 11, marginTop: 2 },
  statusBadge:{ padding: "4px 10px", background: "#0d0e10", border: "1px solid #2a2d33", borderRadius: 4, fontSize: 11, color: "#4caf50", fontWeight: 600 },
  kvList:     { display: "flex", flexDirection: "column", gap: 6 },
  kvRow:      { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 },
  kvKey:      { color: "#888" },
  kvVal:      { color: "#e6e6e6", fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" },

  // Channel stat card
  statCard:   { background: "#161820", border: "1px solid #2a2d33", borderRadius: 8, padding: "14px 16px" },
  statKey:    { color: "#888", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  statVal:    { color: "#fff", fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  statSub:    { color: "#888", fontSize: 11, marginTop: 4 },

  // Source card
  sourceCard: { display: "flex", alignItems: "center", gap: 10, background: "#161820", border: "1px solid #2a2d33", borderRadius: 8, padding: "12px 14px" },
  sourceIcon: { fontSize: 18 },
  sourceName: { color: "#fff", fontSize: 13, fontWeight: 700 },
  sourceDetail:{ color: "#888", fontSize: 11, marginTop: 2, lineHeight: 1.3 },

  // Action card (button)
  actionCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, background: "#161820", border: "1px solid #2a2d33", borderRadius: 8, padding: "14px 16px", cursor: "pointer", textAlign: "left", color: "#e6e6e6", fontFamily: "inherit" },
  actionIcon: { fontSize: 24 },
  actionLabel:{ fontSize: 13, fontWeight: 600 },

  // Command modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  modalBox:     { background: "#161820", border: "1px solid #d97706", borderRadius: 10, padding: "20px 24px", maxWidth: 600, width: "100%" },
  modalHead:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle:   { color: "#fff", fontSize: 16, fontWeight: 700 },
  modalClose:   { background: "transparent", border: "none", color: "#888", fontSize: 24, cursor: "pointer", padding: 0, width: 28, height: 28 },
  modalNote:    { color: "#aaa", fontSize: 12, marginBottom: 14, lineHeight: 1.5 },
  modalCmdLabel:{ color: "#888", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  modalCmd:     { background: "#0d0e10", border: "1px solid #2a2d33", borderRadius: 4, padding: "12px 14px", color: "#d97706", fontSize: 12, fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "0 0 14px 0" },
};
