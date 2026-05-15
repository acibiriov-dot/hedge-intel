export async function POST(request) {
  try {
    const { token, chatId, text, imageBase64 } = await request.json();

    if (!token || !chatId || !text) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Aggressive clean - keep only safe characters
    let s = text;
    
    // Step 1: Remove all markdown
    s = s.split("**").join("");
    s = s.split("__").join("");
    s = s.split("\\_").join("_");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2");
    s = s.replace(/^#{1,6} /gm, "");
    s = s.replace(/^-{3,}$/gm, "");
    
    // Step 2: Remove/replace special unicode
    s = s.split("→").join("->");
    s = s.split("←").join("<-");
    s = s.split("↓").join("v");
    s = s.split("↑").join("^");
    s = s.split("·").join(".");
    s = s.split("—").join("-");
    s = s.split("–").join("-");
    s = s.split(""").join('"');
    s = s.split(""").join('"');
    s = s.split("'").join("'");
    s = s.split("'").join("'");
    s = s.split("…").join("...");
    
    // Step 3: Remove invisible chars
    s = s.replace(/[\u2800\u2060\u200b\u200c\u200d\u00a0\ufeff]/g, "");
    
    // Step 4: Remove * entirely (italic)
    s = s.split("*").join("");
    
    // Step 5: Clean DYOR
    s = s.split("DYOR").join("");
    
    // Step 6: Remove backticks
    s = s.split("`").join("");
    
    // Step 7: Clean extra whitespace
    s = s.replace(/\n{3,}/g, "\n\n");
    s = s.trim();

    // Log first 200 chars for debugging
    console.log("Sending to TG, length:", s.length, "preview:", s.slice(0, 100));

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
      if (!data.ok) {
        console.log("TG photo error:", data.description, "caption:", caption.slice(0, 50));
        return Response.json({ error: data.description }, { status: 400 });
      }

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
    if (!data.ok) {
      console.log("TG text error:", data.description, "text start:", s.slice(0, 100));
      return Response.json({ error: data.description + " | text_start: " + s.slice(0, 50) }, { status: 400 });
    }
    return Response.json({ ok: true });

  } catch (err) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
