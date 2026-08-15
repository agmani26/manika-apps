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

      return json({ ok: true });
    }

    return env.ASSETS.fetch(request);
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
