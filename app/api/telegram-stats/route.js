// GET /api/telegram-stats
// Returns: { ok, subscribers, postsToday, postsThisWeek, lastPost: {text, date}, channel, source }
//
// REQUIRED env vars on Vercel (Project Settings → Environment Variables):
//   TG_BOT_TOKEN  — Telegram bot token (NumericID:AlphaHash from @BotFather).
//                   Bot MUST be added as an admin to TG_CHANNEL_ID for member count.
//   TG_CHANNEL_ID — Channel ID. Either "@OKI_invest" (username, with @)
//                   or "-100xxxxxxxxxx" (numeric supergroup ID).
//
// Why a hybrid (Bot API + public-page scrape):
//   - Bot API has NO method to fetch channel message history. `getChatHistory`
//     exists in MTProto/User API, not Bot API. `getUpdates` only returns NEW
//     updates since the last poll — useless for historical post counts.
//   - Telegram's PUBLIC channel preview at https://t.me/s/{username} renders
//     the last ~20 messages as plain HTML — no auth required. We scrape it
//     for postsToday / postsThisWeek / lastPost.
//   - Bot API `getChatMemberCount` gives an accurate, live subscriber number
//     when the bot is admin; the public page caches it. We prefer Bot API,
//     fall back to scraping if Bot API fails.

export const dynamic = "force-dynamic"; // disable caching — values must be fresh

const TZ = "Europe/Amsterdam";

export async function GET() {
  const token = (process.env.TG_BOT_TOKEN || "").trim();
  const chatId = (process.env.TG_CHANNEL_ID || "").trim();

  if (!chatId) {
    return Response.json(
      { ok: false, error: "TG_CHANNEL_ID не задан на сервере" },
      { status: 500 }
    );
  }

  // Resolve channel username for the public page. If chatId starts with "@",
  // strip it. If it's a numeric -100xxx ID, we need getChat to look up
  // `username`, which requires a bot token.
  let username = chatId.startsWith("@") ? chatId.slice(1) : null;
  let chatTitle = null;

  // ----- Bot API: getChat (title + username when numeric chatId) -----
  if (token) {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (j?.ok && j.result) {
        chatTitle = j.result.title || null;
        if (!username && j.result.username) username = j.result.username;
      }
    } catch {/* fall through to scrape */}
  }

  // ----- Bot API: getChatMemberCount -----
  let subscribers = null;
  if (token) {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (j?.ok && typeof j.result === "number") subscribers = j.result;
    } catch {/* fall through to scrape */}
  }

  // ----- Public page scrape for messages (and subscribers fallback) -----
  if (!username) {
    return Response.json(
      {
        ok: false,
        error: "Не удалось определить username канала. Задай TG_CHANNEL_ID как @username, либо проверь TG_BOT_TOKEN.",
      },
      { status: 500 }
    );
  }

  let messages = [];
  let scrapedSubs = null;
  try {
    const r = await fetch(`https://t.me/s/${encodeURIComponent(username)}`, {
      headers: {
        // Realistic UA — t.me serves a stripped page to obvious bot UAs.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });
    if (r.ok) {
      const html = await r.text();
      const parsed = parseChannelHTML(html);
      messages = parsed.messages;
      scrapedSubs = parsed.subscribers;
    }
  } catch {/* leave messages empty */}

  if (subscribers == null) subscribers = scrapedSubs;

  // ----- Derive postsToday / postsThisWeek in Amsterdam local day boundaries -----
  const now = new Date();
  const todayStr = amsDateKey(now);
  const weekCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  let postsToday = 0;
  let postsThisWeek = 0;
  for (const m of messages) {
    if (m.timestamp >= weekCutoff) postsThisWeek++;
    if (amsDateKey(new Date(m.timestamp)) === todayStr) postsToday++;
  }

  // Last post: chronologically latest message on the page (page is oldest→newest).
  const lastMsg = messages.length ? messages[messages.length - 1] : null;
  const lastPost = lastMsg
    ? {
        text: truncate(lastMsg.text || "(без текста)", 100),
        date: lastMsg.date, // ISO 8601
        timestamp: lastMsg.timestamp,
      }
    : null;

  return Response.json({
    ok: true,
    channel: { username, title: chatTitle },
    subscribers,
    postsToday,
    postsThisWeek,
    lastPost,
    source: {
      // Mark which fields came from which source so the UI can show a "stale" badge if needed.
      subscribers: subscribers === scrapedSubs && scrapedSubs != null && !token ? "scrape" : "bot_api",
      messages: "scrape",
    },
  });
}

// ---------- helpers ----------

/** Parse t.me/s/{channel} HTML. Returns {subscribers, messages: [{date, timestamp, text}]}. */
function parseChannelHTML(html) {
  // Subscriber count: <span class="counter_value">12.3K</span><span class="counter_type">subscribers</span>
  // The "subscribers" label can also be "members"; "Channel" pages use "subscribers".
  const subMatch = html.match(
    /<span class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">(?:subscribers|members)<\/span>/i
  );
  const subscribers = subMatch ? parseShortCount(subMatch[1]) : null;

  // Split by message wrapper, then extract time + text per chunk.
  // Page renders oldest→newest, so the resulting array is in chronological order.
  const chunks = html.split(/<div class="tgme_widget_message_wrap/);
  const messages = [];
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    const timeMatch = c.match(/<time[^>]*datetime="([^"]+)"/);
    if (!timeMatch) continue;
    const d = new Date(timeMatch[1]);
    if (isNaN(d.getTime())) continue;
    // Text is optional (photo-only / video-only posts have no .tgme_widget_message_text).
    const textMatch = c.match(
      /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const rawText = textMatch ? textMatch[1] : "";
    messages.push({
      date: d.toISOString(),
      timestamp: d.getTime(),
      text: stripHtml(rawText),
    });
  }
  return { subscribers, messages };
}

/** "12.3K"→12300, "1.2M"→1200000, "543"→543. Tolerant of comma decimals. */
function parseShortCount(raw) {
  const s = String(raw).replace(/\s/g, "").trim();
  const m = s.match(/^([\d.,]+)\s*([KMB])?$/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(num)) return null;
  const mult = { K: 1000, M: 1_000_000, B: 1_000_000_000 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(num * mult);
}

/** Strip HTML tags + decode the handful of entities Telegram emits in posts. */
function stripHtml(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

/** YYYY-MM-DD in Europe/Amsterdam — used to bucket messages by "today". */
function amsDateKey(d) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
