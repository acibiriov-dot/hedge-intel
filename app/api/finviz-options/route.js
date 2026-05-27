// POST /api/finviz-options
// body: { finvizKey, ticker, expiry? }   expiry = YYYY-MM-DD (optional)
// returns: { rows: [...], columns: [...] }  parsed Finviz options-chain CSV.

export async function POST(request) {
  try {
    const { ticker, expiry } = await request.json();
    const token = (process.env.FINVIZ_KEY || "").trim();
    if (!token) {
      return Response.json(
        { error: "FINVIZ_KEY не задан на сервере" },
        { status: 500 }
      );
    }
    if (!ticker) {
      return Response.json({ error: "Нужен тикер" }, { status: 400 });
    }

    const t = String(ticker).trim().toUpperCase();
    const e = expiry ? String(expiry).trim() : "";

    let url = `https://elite.finviz.com/export/options?t=${encodeURIComponent(t)}&ty=oc&auth=${encodeURIComponent(token)}`;
    if (e) url += `&e=${encodeURIComponent(e)}`;

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/csv,*/*",
    };

    const res = await fetch(url, { headers, redirect: "follow" });
    if (!res.ok) {
      return Response.json(
        { error: `Finviz вернул ${res.status}` },
        { status: 502 }
      );
    }

    const text = (await res.text()).trim();
    if (!text || text.startsWith("<!") || text.startsWith("<html")) {
      return Response.json(
        { error: "Finviz отдал HTML вместо CSV — проверь токен/тикер/дату" },
        { status: 502 }
      );
    }

    // CSV parser tolerating quoted fields with embedded commas.
    function parseCSVLine(line) {
      const result = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
        else { cur += ch; }
      }
      result.push(cur);
      return result;
    }

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length < 2) {
      return Response.json({ rows: [], columns: [] });
    }
    const columns = parseCSVLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const row = {};
      columns.forEach((c, idx) => { row[c] = (cells[idx] ?? "").trim(); });
      rows.push(row);
    }

    return Response.json({ rows, columns });
  } catch (err) {
    return Response.json(
      { error: "Internal error: " + (err && err.message ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
