export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.token;
    const chatId = body.chatId;
    const text = body.text;

    if (!token || !chatId || !text) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    // Clean text — convert markdown bold to HTML, strip stray markers, preserve HTML tags
    var s = String(text);
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
    s = s.split("**").join("");
    s = s.split("*").join("");
    s = s.split("---").join("");
    s = s.split("DYOR").join("");

    // Remove markdown links [text](url) → keep text only
    var linkStart = s.indexOf("](");
    while (linkStart >= 0) {
      var openBracket = s.lastIndexOf("[", linkStart);
      var closeParen = s.indexOf(")", linkStart);
      if (openBracket >= 0 && closeParen >= 0) {
        var linkText = s.slice(openBracket + 1, linkStart);
        s = s.slice(0, openBracket) + linkText + s.slice(closeParen + 1);
        linkStart = s.indexOf("](");
      } else { break; }
    }

    // Collapse triple newlines
    while (s.indexOf("\n\n\n") >= 0) {
      s = s.split("\n\n\n").join("\n\n");
    }
    s = s.trim();

    // Optional inline button passed from client (e.g. download report)
    var markup = (body.buttonText && body.buttonUrl)
      ? JSON.stringify({ inline_keyboard: [[{ text: body.buttonText, url: body.buttonUrl }]] })
      : null;

    var payload = { chat_id: chatId, text: s, parse_mode: "HTML", disable_web_page_preview: true };
    if (markup) payload.reply_markup = markup;

    var msgRes = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    var msgData = await msgRes.json();

    // If HTML parse fails, retry as plain text
    if (!msgData.ok && msgData.description && msgData.description.includes("parse")) {
      var plain = s.replace(/<[^>]+>/g, "");
      var payload2 = { chat_id: chatId, text: plain, disable_web_page_preview: true };
      if (markup) payload2.reply_markup = markup;
      msgRes = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload2),
      });
      msgData = await msgRes.json();
    }

    if (!msgData.ok) {
      return Response.json({ error: msgData.description }, { status: 400 });
    }
    return Response.json({ ok: true });

  } catch (err) {
    return Response.json({ error: String(err.message) }, { status: 500 });
  }
}
