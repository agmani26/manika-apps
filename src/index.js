/**
 * apps.manikagoel.com
 *
 * Everything is public except the paid Focus Challenge hubs, which need an
 * access code. The check happens here on Cloudflare's side, before the page is
 * ever sent — so it can't be got around by viewing the page source.
 *
 * ---------------------------------------------------------------------------
 * MANIKA — TO CHANGE WHO CAN GET IN, EDIT THE CODES BELOW AND REDEPLOY
 * ---------------------------------------------------------------------------
 */

// Anyone with one of these can open the paid pages. Add one per batch if you
// like — removing a code locks out everyone who was using it, nobody else.
const ACCESS_CODES = [
  "FOCUS2026",
];

// The pages that need a code. Everything else on the site stays open.
const GATED_PATHS = [
  "/focus-challenge-hub/",
  "/focus-challenge-hub-selfstart/",
  "/focus-challenge-hub-selfstart-b/",
];

// How long someone stays signed in after entering a code — 180 days.
const REMEMBER_FOR = 60 * 60 * 24 * 180;

const COOKIE_NAME = "mg_access";

const isValid = (code) =>
  ACCESS_CODES.some((c) => c.toUpperCase() === String(code || "").trim().toUpperCase());

const isGated = (pathname) =>
  GATED_PATHS.some((p) => pathname === p || pathname === p.slice(0, -1) || pathname.startsWith(p));

function codeFromCookie(request) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      try { return decodeURIComponent(rest.join("=")); } catch { return rest.join("="); }
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/vision-board/save" && request.method === "POST") {
      return saveVisionBoard(request, env);
    }

    if (url.pathname.startsWith("/admin/vision-boards")) {
      const authFail = checkAdminAuth(request, env);
      if (authFail) return authFail;
      return handleVisionBoardAdmin(url, env);
    }

    if (!isGated(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    // A code was just submitted — remember it and send them to the clean URL.
    const submitted = url.searchParams.get("code");
    if (submitted !== null && isValid(submitted)) {
      url.searchParams.delete("code");
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.pathname + (url.search === "?" ? "" : url.search),
          "Set-Cookie":
            `${COOKIE_NAME}=${encodeURIComponent(submitted.trim().toUpperCase())}` +
            `; Path=/; Max-Age=${REMEMBER_FOR}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Already let in before.
    if (isValid(codeFromCookie(request))) {
      return env.ASSETS.fetch(request);
    }

    return new Response(gatePage(submitted !== null), {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};

function checkAdminAuth(request, env) {
  const auth = request.headers.get("Authorization");
  const expected = "Basic " + btoa(`manika:${env.ADMIN_PASSWORD}`);
  if (!env.ADMIN_PASSWORD || auth !== expected) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
    });
  }
  return null;
}

async function saveVisionBoard(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = (data.name || "").toString().trim();
  const categories = data.categories && typeof data.categories === "object" ? data.categories : {};

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  await env.VISION_BOARD_DATA.put(
    id,
    JSON.stringify({ name, categories, savedAt: new Date().toISOString() })
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function getAllVisionBoards(env) {
  const list = await env.VISION_BOARD_DATA.list({ limit: 1000 });
  const boards = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.VISION_BOARD_DATA.get(k.name);
      return { id: k.name, ...JSON.parse(raw) };
    })
  );
  boards.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  return boards;
}

function esc(str) {
  return (str || "").toString().replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtIst(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const CAT_LABELS = {
  academics: "Academics",
  physical: "Physical / Sport",
  creative: "Creative / Personal Interest",
  character: "Character Trait",
  fun: "Just for Fun",
};

function toCsv(boards) {
  const header = ["Name", "Saved On (IST)", ...Object.values(CAT_LABELS).flatMap((l) => [`${l} — What`, `${l} — Why`, `${l} — Action`])];
  const rows = boards.map((b) => {
    const row = [b.name, fmtIst(b.savedAt)];
    for (const key of Object.keys(CAT_LABELS)) {
      const c = b.categories[key] || {};
      row.push(c.what || "", c.why || "", c.action || "");
    }
    return row;
  });
  const escCsv = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(escCsv).join(",")).join("\r\n");
}

async function handleVisionBoardAdmin(url, env) {
  const boards = await getAllVisionBoards(env);

  if (url.pathname === "/admin/vision-boards/export.csv") {
    return new Response(toCsv(boards), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="vision-boards.csv"`,
      },
    });
  }

  const rows = boards.map((b) => `
    <tr>
      <td>${esc(b.name || "(no name given)")}</td>
      <td>${fmtIst(b.savedAt)}</td>
      <td>${Object.keys(CAT_LABELS).filter((k) => b.categories[k] && b.categories[k].what).length} / 5 filled</td>
      <td><a href="#" onclick="document.getElementById('detail-${esc(b.id)}').classList.toggle('open');return false;">View</a></td>
    </tr>
    <tr class="detail" id="detail-${esc(b.id)}"><td colspan="4">
      ${Object.entries(CAT_LABELS).map(([key, label]) => {
        const c = b.categories[key] || {};
        if (!c.what) return "";
        return `<div class="cat-block"><strong>${label}:</strong> ${esc(c.what)}${c.why ? ` — <em>${esc(c.why)}</em>` : ""}${c.action ? `<br><span class="action">This week: ${esc(c.action)}</span>` : ""}</div>`;
      }).join("")}
    </td></tr>`).join("");

  return new Response(`<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Vision Boards — Admin</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#FAF3E9;color:#2B2118;margin:0;padding:24px 16px;}
  .wrap{max-width:1000px;margin:0 auto;}
  h1{font-size:22px;margin:0 0 14px;}
  .actions{margin-bottom:16px;}
  .actions a{background:#2B2118;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px;}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:13.5px;}
  th,td{padding:10px 12px;border-bottom:1px solid #E7DCC9;text-align:left;}
  th{background:#2B2118;color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.04em;}
  tr.detail{display:none;background:#FFFDF8;}
  tr.detail.open{display:table-row;}
  .cat-block{margin-bottom:8px;font-size:13px;}
  .action{color:#7A6F5E;font-size:12px;}
</style></head>
<body><div class="wrap">
  <h1>Vision Board Submissions (${boards.length})</h1>
  <div class="actions"><a href="/admin/vision-boards/export.csv">Download CSV</a></div>
  <table>
    <thead><tr><th>Name</th><th>Saved</th><th>Completeness</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div></body></html>`, {
    headers: { "Content-Type": "text/html" },
  });
}

function gatePage(wrongCode) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Access code needed — Manika Goel</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#F5F9FD; --surface:#fff; --ink:#0E1526; --ink-2:#5b6864;
    --teal:#1E6B67; --line:rgba(22,27,46,.14); --err:#B4432F;
  }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#0E1526; --surface:#18202f; --ink:#E4EEF9; --ink-2:#9aa8ad;
           --teal:#74ab97; --line:rgba(228,238,249,.16); --err:#e08b78; }
  }
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{
    background:var(--bg); color:var(--ink);
    font-family:'Inter',-apple-system,"Segoe UI",sans-serif;
    display:flex; align-items:center; justify-content:center; padding:24px;
  }
  .box{
    background:var(--surface); border:1px solid var(--line);
    border-radius:14px; padding:34px 28px; max-width:400px; width:100%;
  }
  h1{ font-family:'Fraunces',Georgia,serif; font-weight:400;
      font-size:1.45rem; margin:0 0 10px; }
  p{ color:var(--ink-2); font-size:.95rem; line-height:1.6; margin:0 0 22px; }
  input{
    width:100%; font-family:inherit; font-size:1.05rem; letter-spacing:.08em;
    text-align:center; text-transform:uppercase;
    padding:15px 14px; border:1px solid var(--line); border-radius:9px;
    background:var(--bg); color:var(--ink); margin-bottom:12px;
    -webkit-appearance:none;
  }
  input:focus{ outline:2px solid var(--teal); outline-offset:-1px; }
  button{
    width:100%; border:0; border-radius:9px; padding:15px;
    background:var(--teal); color:#fff; font-family:inherit;
    font-size:1rem; font-weight:600; cursor:pointer;
  }
  button:hover{ opacity:.92 }
  .err{ color:var(--err); font-size:.9rem; margin:0 0 16px; }
  .foot{ font-size:.85rem; margin:22px 0 0; }
  .foot a{ color:var(--teal); }
</style>
</head>
<body>
  <div class="box">
    <h1>This one needs a code</h1>
    ${wrongCode
      ? `<p class="err">That code didn't work. Do check it, or message me and I'll sort it out.</p>`
      : `<p>The Focus Challenge is for parents who've joined the programme. Pop in the access code I sent you and you're in.</p>`}
    <form method="GET">
      <input name="code" placeholder="Access code" autocomplete="off"
             autocapitalize="characters" spellcheck="false" autofocus required>
      <button type="submit">Open the challenge</button>
    </form>
    <p class="foot">Don't have a code? <a href="https://wa.me/919811991428">Message me on WhatsApp</a></p>
  </div>
</body>
</html>`;
}
