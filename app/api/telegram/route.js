export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.token;
    const chatId = body.chatId;
    const text = body.text;
    const posterUrl = body.posterUrl;

    if (!token || !chatId || !text) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    var s = String(text);
    s = s.split("**").join("");
    s = s.split("__").join("");
    s = s.split("*").join("");
    s = s.split("---").join("");
    s = s.split("DYOR").join("");

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

    while (s.indexOf("\n\n\n") >= 0) {
      s = s.split("\n\n\n").join("\n\n");
    }
    s = s.trim();

    // Text only - poster is sent directly from browser
    var msgRes = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: s,
        disable_web_page_preview: true,
      }),
    });
    var msgData = await msgRes.json();
    if (!msgData.ok) {
      return Response.json({ error: msgData.description }, { status: 400 });
    }
    return Response.json({ ok: true });

  } catch (err) {
    return Response.json({ error: String(err.message) }, { status: 500 });
  }
}
