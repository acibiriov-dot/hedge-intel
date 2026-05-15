export async function POST(request) {
  try {
    const { token, chatId, text, imageBase64, noMarkdown } = await request.json();

    if (!token || !chatId || !text) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Clean text - remove any remaining problematic chars
    const cleanText = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/_{2}/g, "")
      .replace(/`/g, "")
      .replace(/^#{1,6} /gm, "")
      .replace(/^---+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (imageBase64) {
      // Send photo with caption (max 1024 chars)
      const imgBuffer = Buffer.from(imageBase64, "base64");
      const caption = cleanText.slice(0, 1024);

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

      // If text longer than caption, send rest as separate message
      if (cleanText.length > 1024) {
        const rest = cleanText.slice(1024);
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

    // Text only - no parse_mode to avoid pattern errors
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: cleanText,
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
