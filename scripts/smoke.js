// Smoke test: `npm run smoke` starts a demo-mode server on a free port, or set
// SMOKE_BASE_URL=http://127.0.0.1:3003 to check an already running instance.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

async function startServer() {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../server.js", import.meta.url))], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", AI_MODE: "demo", OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 10000);
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/listening on (http:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
  return { baseUrl, stop: () => child.kill() };
}

const external = process.env.SMOKE_BASE_URL;
const { baseUrl, stop } = external ? { baseUrl: external.replace(/\/$/, ""), stop: () => {} } : await startServer();
const check = async (name, fn) => {
  await fn();
  console.log(`ok - ${name}`);
};

try {
  await check("GET /api/health", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
  });
  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  await check(`GET /api/config (mode=${config.mode})`, async () => assert.ok(config.languages.length > 0));
  await check("GET / serves the UI", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Translation Desk/);
  });
  if (config.mode === "demo") {
    await check("POST /api/translate known phrase", async () => {
      const res = await fetch(`${baseUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Thank you", sourceLanguage: "en", targetLanguage: "de" }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.translation, "Danke");
    });
    await check("POST /api/translate unknown phrase is rejected", async () => {
      const res = await fetch(`${baseUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Quarterly revenue grew", targetLanguage: "es" }),
      });
      assert.equal(res.status, 422);
    });
  } else {
    await check("POST /api/translate via provider", async () => {
      const res = await fetch(`${baseUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Good morning", sourceLanguage: "en", targetLanguage: "es" }),
      });
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      console.log(`    translation: ${body.translation}`);
    });
  }
  console.log("Smoke test passed.");
} catch (err) {
  console.error("Smoke test failed:", err.message);
  process.exitCode = 1;
} finally {
  stop();
}