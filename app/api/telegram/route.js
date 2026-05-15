export async function POST(request) {
  try {
    const { token, chatId, text, imageBase64 } = await request.json();

    if (!token || !chatId || !text) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    let s = text;

    // Remove markdown bold **text**
    s = s.split("**").join("");
    // Remove markdown italic *text*
    s = s.split("*").join("");
    // Remove double underscores
    s = s.split("__").join("");
    // Remove escaped underscores \_
    s = s.split("\\_").join("_");
    // Remove markdown links [text](url) -> text: url
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");
    // Remove header markers
    s = s.replace(/^#{1,6} /gm, "");
    // Remove triple dashes
    s = s.replace(/^-{3,}$/gm, "");
    // Remove DYOR
    s = s.split("DYOR.").join("").split("DYOR").join("");
    // Replace arrow symbols
    s = s.split("→").join("->");
    s = s.split("←").join("<-");
    s = s.split("↓").join("");
    s = s.split("↑").join("");
    // Remove invisible chars
    s = s.replace(/\u2800/g, "");
    s = s.replace(/\u2060/g, "");
    s = s.replace(/\u200b/g, "");
    s = s.replace(/\u00a0/g, " ");
    // Clean extra blank lines
    s = s.replace(/\n{3,}/g, "\n\n");
    // Final trim
    s = s.trim();

    if (imageBase64) {
      const imgBuffer = Buffer.from(imageBase64, "base64");
      const caption = s.slice(0, 1024);

      const formData = new FormData();
      const blob = new Blob([imgBuffer], { type: "image/png" });
      formData.append("chat_id", chatId);
      formData.append("photo", blob, "poster.png");
      formData.append("caption", caption);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) return Response.json({ error: data.description }, { status: 400 });

      if (s.length > 1024) {
        const rest = s.slice(1024);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: rest,
            disable_web_page_preview: true,
          }),
        });
      }

      return Response.json({ ok: true });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: s,
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) return Response.json({ error: data.description }, { status: 400 });
    return Response.json({ ok: true });

  } catch (err) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
