export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/register" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ error: "Invalid request" }, 400);
      }

      const name = (data.name || "").toString().trim();
      const phone = (data.phone || "").toString().trim();
      const email = (data.email || "").toString().trim();

      if (!name || !phone || !email) {
        return json({ error: "Please fill in all fields." }, 400);
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return json({ error: "Please enter a valid email." }, 400);
      }

      const id = `${Date.now()}-${crypto.randomUUID()}`;
      await env.WORKSHOP_LEADS.put(
        id,
        JSON.stringify({ name, phone, email, submittedAt: new Date().toISOString() })
      );

      try {
        await sendAiSensyConfirmation(env, name, phone);
      } catch (err) {
        console.error("AiSensy send failed:", err);
      }

      return json({ ok: true });
    }

    // Clean URL for the post-registration thank-you page (the ads conversion page)
    if (url.pathname === "/thank-you" || url.pathname === "/thank-you/") {
      return env.ASSETS.fetch(new Request(new URL("/thank-you.html", url), request));
    }

    if (url.pathname.startsWith("/admin")) {
      const authFail = checkAdminAuth(request, env);
      if (authFail) return authFail;

      if (url.pathname === "/admin/toggle-joined" && request.method === "POST") {
        const form = await request.formData();
        const id = form.get("id");
        const raw = await env.WORKSHOP_LEADS.get(id);
        if (raw) {
          const lead = JSON.parse(raw);
          lead.groupJoined = !lead.groupJoined;
          await env.WORKSHOP_LEADS.put(id, JSON.stringify(lead));
        }
        return Response.redirect(new URL("/admin", url), 302);
      }

      const leads = await getAllLeads(env);

      if (url.pathname === "/admin/export.csv") {
        return new Response(toCsv(leads), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="workshop-leads.csv"`,
          },
        });
      }

      return new Response(renderAdminPage(leads), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

function checkAdminAuth(request, env) {
  const auth = request.headers.get("Authorization");
  const expected = "Basic " + btoa(`manika:${env.ADMIN_PASSWORD}`);
  if (auth !== expected) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Workshop Admin"' },
    });
  }
  return null;
}

async function getAllLeads(env) {
  const list = await env.WORKSHOP_LEADS.list({ limit: 1000 });
  const leads = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.WORKSHOP_LEADS.get(k.name);
      return { id: k.name, ...JSON.parse(raw) };
    })
  );
  leads.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return leads;
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

function toCsv(leads) {
  const header = ["Name", "Phone", "Email", "Registered On (IST)", "WhatsApp Group Joined"];
  const rows = leads.map((l) => [
    l.name, l.phone, l.email, fmtIst(l.submittedAt), l.groupJoined ? "Yes" : "No",
  ]);
  const escCsv = (v) => `"${(v || "").toString().replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(escCsv).join(",")).join("\r\n");
}

function renderAdminPage(leads) {
  const total = leads.length;
  const joined = leads.filter((l) => l.groupJoined).length;
  const rows = leads.map((l) => `
    <tr>
      <td>${esc(l.name)}</td>
      <td>${esc(l.phone)}</td>
      <td>${esc(l.email)}</td>
      <td>${fmtIst(l.submittedAt)}</td>
      <td style="text-align:center;">
        <form method="POST" action="/admin/toggle-joined" style="margin:0;">
          <input type="hidden" name="id" value="${esc(l.id)}">
          <button type="submit" class="pill ${l.groupJoined ? "yes" : "no"}">
            ${l.groupJoined ? "✓ Joined" : "Not yet"}
          </button>
        </form>
      </td>
    </tr>`).join("");

  return `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Workshop Registrations — Admin</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#FAF3E9;color:#2B2118;margin:0;padding:24px 16px;}
  .wrap{max-width:1000px;margin:0 auto;}
  h1{font-size:22px;margin:0 0 4px;}
  .stats{display:flex;gap:18px;margin:14px 0 20px;flex-wrap:wrap;}
  .stat{background:#fff;border:1px solid #E7DCC9;border-radius:12px;padding:12px 18px;}
  .stat b{display:block;font-size:20px;}
  .actions{margin-bottom:16px;}
  .actions a{background:#2B2118;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px;}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:13.5px;}
  th,td{padding:10px 12px;border-bottom:1px solid #E7DCC9;text-align:left;}
  th{background:#2B2118;color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.04em;}
  .pill{border:none;border-radius:100px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;}
  .pill.yes{background:#25D366;color:#fff;}
  .pill.no{background:#eee;color:#666;}
  @media (max-width:640px){ table,thead,tbody,tr,th,td{display:block;} thead{display:none;}
    tr{margin-bottom:12px;border:1px solid #E7DCC9;border-radius:10px;overflow:hidden;}
    td{border-bottom:none;} td::before{content:attr(data-label);font-weight:700;display:block;font-size:11px;color:#7A6F5E;} }
</style></head>
<body><div class="wrap">
  <h1>Workshop Registrations</h1>
  <div class="stats">
    <div class="stat"><b>${total}</b>Total registrations</div>
    <div class="stat"><b>${joined}</b>Joined WhatsApp group</div>
    <div class="stat"><b>${total - joined}</b>Not yet joined</div>
  </div>
  <div class="actions"><a href="/admin/export.csv">Download CSV</a></div>
  <table>
    <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Registered</th><th>WhatsApp Group</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div></body></html>`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeIndianPhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return digits;
}

async function sendAiSensyConfirmation(env, name, phone) {
  const destination = normalizeIndianPhone(phone);
  const res = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: env.AISENSY_API_KEY,
      campaignName: "Parents Workshop",
      destination,
      userName: name,
      templateParams: [],
      source: "workshop-registration",
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AiSensy ${res.status}: ${body}`);
  }
}
