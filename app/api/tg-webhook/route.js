// Путь файла в репозитории: app/api/tg-webhook/route.js
//
// Переменные окружения (Vercel -> Settings -> Environment Variables):
//   TG_BOT_TOKEN     — токен бота
//   TG_STORAGE_CHAT  — chat_id приватного склад-чата, где бот админ и куда
//                      приложение заливает файлы отчётов.
//
// Канал для проверки подписки — @OKI_invest (публичный, не секрет).

const CHANNEL = "@OKI_invest";

async function tg(token, method, body) {
  return fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function isSubscribed(token, userId) {
  if (!userId) return false;
  try {
    const r = await fetch(
      "https://api.telegram.org/bot" + token +
      "/getChatMember?chat_id=" + encodeURIComponent(CHANNEL) + "&user_id=" + userId
    );
    const d = await r.json();
    const st = d && d.result && d.result.status;
    return st === "member" || st === "administrator" || st === "creator";
  } catch (e) {
    return false;
  }
}

function welcomeText(ticker) {
  const t = ticker ? (" " + ticker) : "";
  return "👋 Рады видеть тебя в ОКИ — Открытый Клуб Инвесторов!\n\n" +
    "Держи полный разбор" + t + " — вся аналитика в одном файле. Изучай спокойно и принимай решения с холодной головой.\n\n" +
    "Мы регулярно выпускаем такие разборы — оставайся с нами, и рынок станет понятнее. Удачных сделок! 🚀";
}

export async function POST(request) {
  try {
    const token = process.env.TG_BOT_TOKEN;
    const storage = process.env.TG_STORAGE_CHAT;
    if (!token) return Response.json({ ok: true });

    const update = await request.json();

    // 1) Кнопка «Подписаться» под постом (callback) — проверка подписки + попап
    const cq = update.callback_query;
    if (cq && cq.data === "check_sub") {
      const subscribed = await isSubscribed(token, cq.from && cq.from.id);
      const text = subscribed
        ? "Вы уже подписаны ✅"
        : "Откройте канал и нажмите «Подписаться» 👇";
      await tg(token, "answerCallbackQuery", {
        callback_query_id: cq.id,
        text: text,
        show_alert: true,
      });
      return Response.json({ ok: true });
    }

    // 2) Deep-link /start r_<messageId>_<TICKER> — выдача отчёта подписчикам
    const msg = update.message;
    if (msg && typeof msg.text === "string" && msg.text.indexOf("/start") === 0) {
      const userId = msg.from && msg.from.id;
      const dm = msg.chat && msg.chat.id;
      const payload = msg.text.length > 7 ? msg.text.slice(7).trim() : "";

      if (payload.indexOf("r_") === 0 && storage) {
        const rest = payload.slice(2);
        const parts = rest.split("_");
        const messageId = Number(parts[0]);
        const ticker = parts[1] || "";
        const subscribed = await isSubscribed(token, userId);
        if (subscribed) {
          await tg(token, "sendMessage", { chat_id: dm, text: welcomeText(ticker) });
          await tg(token, "copyMessage", {
            chat_id: dm,
            from_chat_id: storage,
            message_id: messageId,
          });
        } else {
          await tg(token, "sendMessage", {
            chat_id: dm,
            text: "Чтобы скачать полный разбор, подпишись на @OKI_invest и нажми кнопку «Скачать полный отчёт» под постом ещё раз 👇",
            reply_markup: JSON.stringify({
              inline_keyboard: [[{ text: "📢 Открыть канал", url: "https://t.me/OKI_invest" }]],
            }),
          });
        }
      } else {
        await tg(token, "sendMessage", {
          chat_id: dm,
          text: "Привет! Это бот канала @OKI_invest. Нажимай кнопку «Скачать полный отчёт» под постами — и получишь детальный разбор тикера здесь, в личке.",
        });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: true });
  }
}
