import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startApp, postJson, providerReply } from "./helpers.js";
import { parseProviderTranslation } from "../src/translate.js";

const SECRET = "sk-test-super-secret";
const providerEnv = { OPENAI_API_KEY: SECRET, OPENAI_BASE_URL: "https://llm.example.test/v1", OPENAI_MODEL: "test-model" };
const request = { text: "Good afternoon, team.", sourceLanguage: "en", targetLanguage: "es" };

async function withApp(fetchImpl, fn, env = {}) {
  const app = await startApp({ env: { ...providerEnv, ...env }, fetchImpl });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test("calls the OpenAI-compatible endpoint and returns the validated translation", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return providerReply(JSON.stringify({ translation: "Buenas tardes, equipo.", detectedSourceLanguage: "en" }));
  };
  await withApp(fetchImpl, async (app) => {
    const res = await postJson(app.baseUrl, "/api/translate", request);
    assert.equal(res.status, 200);
    assert.equal(res.json.translation, "Buenas tardes, equipo.");
    assert.equal(res.json.mode, "provider");
    assert.equal(res.json.model, "test-model");
    assert.equal(res.json.detectedSourceLanguage, "en");
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://llm.example.test/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${SECRET}`);
  assert.equal(calls[0].body.model, "test-model");
  assert.equal(calls[0].body.temperature, 0);
  assert.match(calls[0].body.messages[0].content, /into Spanish/);
  assert.equal(calls[0].body.messages[1].content, request.text);
});

test("translates arbitrary text and languages beyond the demo phrase book", async () => {
  const fetchImpl = async () => providerReply('```json\n{"translation":"おはようございます"}\n```');
  await withApp(fetchImpl, async (app) => {
    const res = await postJson(app.baseUrl, "/api/translate", { text: "Good morning", targetLanguage: "ja" });
    assert.equal(res.status, 200);
    assert.equal(res.json.translation, "おはようございます");
    assert.equal(res.json.detectedSourceLanguage, null);
  });
});

test("rejects malformed provider output", async () => {
  const bad = [
    "Buenas tardes",
    JSON.stringify({ translation: "" }),
    JSON.stringify({ text: "Buenas tardes" }),
    JSON.stringify({ translation: "x".repeat(1000) }),
  ];
  for (const content of bad) {
    await withApp(async () => providerReply(content), async (app) => {
      const res = await postJson(app.baseUrl, "/api/translate", request);
      assert.equal(res.status, 502, content.slice(0, 40));
      assert.equal(res.json.error.code, "ai_provider_invalid_response");
    });
  }
  await withApp(async () => new Response("<html>oops</html>", { status: 200 }), async (app) => {
    const res = await postJson(app.baseUrl, "/api/translate", request);
    assert.equal(res.json.error.code, "ai_provider_invalid_response");
  });
  await withApp(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }), async (app) => {
    const res = await postJson(app.baseUrl, "/api/translate", request);
    assert.equal(res.json.error.code, "ai_provider_invalid_response");
  });
});

test("maps provider HTTP failures without leaking provider bodies or credentials", async () => {
  const cases = [
    [500, 502, "ai_provider_error"],
    [401, 502, "ai_provider_auth_failed"],
    [429, 503, "ai_provider_rate_limited"],
  ];
  for (const [providerStatus, status, code] of cases) {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${SECRET}` } }), { status: providerStatus });
    await withApp(fetchImpl, async (app) => {
      const res = await postJson(app.baseUrl, "/api/translate", request);
      assert.equal(res.status, status);
      assert.equal(res.json.error.code, code);
      assert.ok(!res.text.includes(SECRET));
      assert.ok(!res.text.includes("Incorrect API key"));
    });
  }
});

test("reports network failures and timeouts", async () => {
  await withApp(async () => {
    throw new TypeError("fetch failed");
  }, async (app) => {
    const res = await postJson(app.baseUrl, "/api/translate", request);
    assert.equal(res.status, 502);
    assert.equal(res.json.error.code, "ai_provider_unavailable");
  });

  const hanging = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  await withApp(hanging, async (app) => {
    const started = Date.now();
    const res = await postJson(app.baseUrl, "/api/translate", request);
    assert.equal(res.status, 504);
    assert.equal(res.json.error.code, "ai_provider_timeout");
    assert.ok(Date.now() - started < 5000);
  }, { PROVIDER_TIMEOUT_MS: "500" });
});

test("validation errors never reach the provider", async () => {
  let called = false;
  await withApp(async () => {
    called = true;
    return providerReply("{}");
  }, async (app) => {
    const res = await postJson(app.baseUrl, "/api/translate", { text: "", targetLanguage: "es" });
    assert.equal(res.status, 400);
  });
  assert.equal(called, false);
});

test("works end-to-end against a local mock OpenAI-compatible HTTP server", async () => {
  let seenAuth;
  const mock = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seenAuth = req.headers.authorization;
      const body = JSON.parse(raw);
      assert.equal(req.url, "/v1/chat/completions");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ translation: `[${body.model}] Hallo Welt`, detectedSourceLanguage: "en" }) } }],
      }));
    });
  });
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  try {
    await withApp(globalThis.fetch, async (app) => {
      const res = await postJson(app.baseUrl, "/api/translate", { text: "Hello world", targetLanguage: "de" });
      assert.equal(res.status, 200);
      assert.equal(res.json.translation, "[test-model] Hallo Welt");
    }, { OPENAI_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1` });
    assert.equal(seenAuth, `Bearer ${SECRET}`);
  } finally {
    await new Promise((resolve) => { mock.close(resolve); mock.closeAllConnections?.(); });
  }
});

test("parseProviderTranslation sanitizes the detected language", () => {
  const parsed = parseProviderTranslation(JSON.stringify({ translation: " Hola ", detectedSourceLanguage: "<script>" }), "Hello");
  assert.deepEqual(parsed, { translation: "Hola", detectedSourceLanguage: null });
});