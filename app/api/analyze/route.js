export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, useSearch, system } = body;

    const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!apiKey) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY не задан на сервере" },
        { status: 500 }
      );
    }

    const tools = useSearch
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]
      : undefined;

    // Prepend today's date to the system prompt so Claude grounds expiry /
    // timeframe math in the current day rather than its training cutoff.
    // Format DD.MM.YYYY in server TZ via new Date() — equivalent to
    // moment(...).format("DD.MM.YYYY") without adding the moment dependency.
    const now = new Date();
    const dd   = String(now.getDate()).padStart(2, "0");
    const mm   = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const dateLine = `Сегодня ${dd}.${mm}.${yyyy}. Все расчёты сроков и экспираций считай от этой даты.`;
    const systemWithDate = `${dateLine}\n\n${system || ""}`.trim();

    let msgs = messages;
    let finalText = "";
    let iters = 0;

    while (iters < 8) {
      iters++;

      const requestBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        system: systemWithDate,
        messages: msgs,
      };

      if (tools) {
        requestBody.tools = tools;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
      });

      if (res.status === 429) {
        return Response.json({ error: "rate_limit" }, { status: 429 });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        return Response.json({ error: msg }, { status: res.status });
      }

      const data = await res.json();

      for (const b of data.content || []) {
        if (b.type === "text") finalText += b.text;
      }

      if (data.stop_reason !== "tool_use") break;

      const toolUses = (data.content || []).filter(b => b.type === "tool_use");
      if (!toolUses.length) break;

      msgs = [
        ...msgs,
        { role: "assistant", content: data.content },
        {
          role: "user",
          content: toolUses.map(tb => ({
            type: "tool_result",
            tool_use_id: tb.id,
            content: "Поиск выполнен. Продолжи анализ.",
          })),
        },
      ];
    }

    return Response.json({ text: finalText || "Анализ завершён." });

  } catch (err) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
