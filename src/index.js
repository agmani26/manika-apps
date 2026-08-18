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
