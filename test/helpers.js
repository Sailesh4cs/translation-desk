import { createApp } from "../src/app.js";

export const silentLogger = { error() {}, log() {} };

export async function startApp({ env = {}, fetchImpl } = {}) {
  const { server, config } = createApp({ env: { PORT: "0", ...env }, fetchImpl, logger: silentLogger });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    config,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections?.();
      }),
  };
}

export async function postJson(baseUrl, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, headers: response.headers, json, text };
}

export function providerReply(content, { status = 200 } = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}