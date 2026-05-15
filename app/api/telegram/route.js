export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.token;
    const chatId = body.chatId;
    const text = body.text;
    const imageBase64 = body.imageBase64;

    if (!token || !chatId || !text) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    // Clean text step by step
    var s = String(text);
    s = s.split("**").join("");
    s = s.split("__").join("");
    s = s.split("*").join("");
    s = s.split("`").join("");
    s = s.split("---").join("");
    s = s.split("\n---\n").join("\n");
    s = s.split("DYOR").join("");
    s = s.split("\u2800").join("");
    s = s.split("\u200b").join("");
    s = s.split("\u00a0").join(" ");
    s = s.split("\u2014").join("-");
    s = s.split("\u2013").join("-");
    s = s.split("\u2192").join("->");
    s = s.split("\u2190").join("<-");
    s = s.split("\u2193").join("");
    s = s.split("\u2191").join("");
    s = s.split("\\_").join("_");
    
    // Remove markdown links manually
    var linkStart = s.indexOf("](");
    while (linkStart >= 0) {
      var openBracket = s.lastIndexOf("[", linkStart);
      var closeParen = s.indexOf(")", linkStart);
      if (openBracket >= 0 && closeParen >= 0) {
        var linkText = s.slice(openBracket + 1, linkStart);
        s = s.slice(0, openBracket) + linkText + s.slice(closeParen + 1);
      } else {
        break;
      }
      linkStart = s.indexOf("](");
    }
    
    // Remove # headers
    var lines = s.split("\n");
    lines = lines.map(function(line) {
      if (line.indexOf("# ") === 0) return line.slice(line.indexOf("# ") + 2);
      if (line.indexOf("## ") === 0) return line.slice(3);
      if (line.indexOf("### ") === 0) return line.slice(4);
      return line;
    });
    s = lines.join("\n");
    
    // Clean multiple newlines
    while (s.indexOf("\n\n\n") >= 0) {
      s = s.split("\n\n\n").join("\n\n");
    }
    s = s.trim();

    if (imageBase64) {
      var imgBuffer = Buffer.from(imageBase64, "base64");
      var caption = s.slice(0, 1024);
      var formData = new FormData();
      var blob = new Blob([imgBuffer], { type: "image/png" });
      formData.append("chat_id", chatId);
      formData.append("photo", blob, "poster.png");
      formData.append("caption", caption);

      var photoRes = await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", {
        method: "POST",
        body: formData,
      });
      var photoData = await photoRes.json();
      if (!photoData.ok) {
        return Response.json({ error: photoData.description }, { status: 400 });
      }

      if (s.length > 1024) {
        await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: s.slice(1024),
            disable_web_page_preview: true,
          }),
        });
      }
      return Response.json({ ok: true });
    }

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
