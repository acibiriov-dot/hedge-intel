export async function POST(request) {
  const { token, chatId, text, imageBase64 } = await request.json();

  if (imageBase64) {
    // Send photo with caption
    const imgBuffer = Buffer.from(imageBase64, "base64");
    const formData = new FormData();
    const blob = new Blob([imgBuffer], { type: "image/png" });
    formData.append("chat_id", chatId);
    formData.append("photo", blob, "poster.png");
    formData.append("caption", text.slice(0, 1024));
    formData.append("parse_mode", "Markdown");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) return Response.json({ error: data.description }, { status: 400 });

    // Send full text if longer than caption limit
    if (text.length > 1024) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
      });
    }
    return Response.json({ ok: true });
  }

  // Text only
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
  });
  const data = await res.json();
  if (!data.ok) return Response.json({ error: data.description }, { status: 400 });
  return Response.json({ ok: true });
}
