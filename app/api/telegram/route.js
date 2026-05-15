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

    var s = String(text);
    s = s.split("**").join("");
    s = s.split("__").join("");
    s = s.split("*").join("");
    s = s.split("---").join("");
    s = s.split("DYOR").join("");
    s = s.split("⠀").join("");
    s = s.split("​").join("");
    s = s.split(" ").join(" ");
    s = s.split("—").join("-");
    s = s.split("–").join("-");
    s = s.split("→").join("->");
    s = s.split("←").join("<-");
    s = s.split("↓").join("");
    s = s.split("↑").join("");
    s = s.split("\\_").join("_");

    var linkStart = s.indexOf("](");
    while (linkStart >= 0) {
      var openBracket = s.lastIndexOf("[", linkStart);
      var closeParen = s.indexOf(")", linkStart);
      if (openBracket >= 0 && closeParen >= 0) {
        var linkText = s.slice(openBracket + 1, linkStart);
        s = s.slice(0, openBracket) + linkText + s.slice(closeParen + 1);
        linkStart = s.indexOf("](");
      } else {
        break;
      }
    }

    var lines = s.split("\n");
    lines = lines.map(function(line) {
      var trimmed = line.trimStart();
      if (trimmed.startsWith("### ")) return trimmed.slice(4);
      if (trimmed.startsWith("## ")) return trimmed.slice(3);
      if (trimmed.startsWith("# ")) return trimmed.slice(2);
      return line;
    });
    s = lines.join("\n");

    while (s.indexOf("\n\n\n") >= 0) {
      s = s.split("\n\n\n").join("\n\n");
    }
    s = s.trim();

    if (imageBase64) {
      var imgBuffer = Buffer.from(imageBase64, "base64");
      
      // Send ONLY as photo with caption - no separate text message
      // Caption limit is 1024 chars, truncate if needed
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
      
      // If text longer than 1024, send remainder as separate message
      if (s.length > 1024) {
        var rest = s.slice(1024).trim();
        if (rest.length > 0) {
          var restRes = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: rest,
              disable_web_page_preview: true,
            }),
          });
          var restData = await restRes.json();
          if (!restData.ok) {
            return Response.json({ error: restData.description }, { status: 400 });
          }
        }
      }
      
      return Response.json({ ok: true });
    }

    // Text only
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
