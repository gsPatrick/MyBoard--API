const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function run() {
  console.log("Smoke test em", BASE_URL);

  const health = await request("/health");
  console.log("GET /health", health.status, health.body?.status);

  const ping = await request("/api/v1/ping");
  console.log("GET /api/v1/ping", ping.status, ping.body?.data?.message);

  const clients = await request("/api/v1/clients");
  console.log("GET /api/v1/clients", clients.status, `total=${clients.body?.meta?.total ?? 0}`);

  console.log("Smoke test concluído.");
}

run().catch((error) => {
  console.error("Smoke test falhou:", error.message);
  process.exit(1);
});
