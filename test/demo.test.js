import { describe, it as test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, postJson } from "./helpers.js";
import { normalizePhrase } from "../src/demo-dictionary.js";

describe("demo mode API", () => {
let app;
before(async () => {
  app = await startApp({ env: { AI_MODE: "demo" }, fetchImpl: () => assert.fail("demo mode must never call the provider") });
});
after(() => app.close());

test("health and config report demo mode", async () => {
  const health = await (await fetch(`${app.baseUrl}/api/health`)).json();
  assert.deepEqual(health, { status: "ok", mode: "demo" });
  const config = await (await fetch(`${app.baseUrl}/api/config`)).json();
  assert.equal(config.mode, "demo");
  assert.equal(config.model, null);
  assert.ok(config.languages.some((language) => language.code === "ja"));
  assert.ok(config.demo.phrases.includes("Where is the train station?"));
});

test("translates a known phrase from the phrase book", async () => {
  const res = await postJson(app.baseUrl, "/api/translate", { text: "Where is the train station?", sourceLanguage: "en", targetLanguage: "fr" });
  assert.equal(res.status, 200);
  assert.equal(res.json.translation, "Où est la gare ?");
  assert.equal(res.json.mode, "demo");
  assert.match(res.json.notice, /No AI provider was called/);
});

test("matching ignores case, whitespace and punctuation and auto-detects language", async () => {
  const res = await postJson(app.baseUrl, "/api/translate", { text: "  ¿cómo   ESTÁS  ", targetLanguage: "de" });
  assert.equal(res.status, 200);
  assert.equal(res.json.translation, "Wie geht es dir?");
  assert.equal(res.json.detectedSourceLanguage, "es");
  assert.equal(normalizePhrase("Où est la gare ?"), "où est la gare");
});

test("translates Hindi phrases", async () => {
  const res = await postJson(app.baseUrl, "/api/translate", { text: "धन्यवाद", sourceLanguage: "hi", targetLanguage: "en" });
  assert.equal(res.status, 200);
  assert.equal(res.json.translation, "Thank you");
});

test("refuses to invent translations for phrases outside the phrase book", async () => {
  const res = await postJson(app.baseUrl, "/api/translate", { text: "The invoice is overdue", sourceLanguage: "en", targetLanguage: "es" });
  assert.equal(res.status, 422);
  assert.equal(res.json.error.code, "demo_phrase_unsupported");
  assert.equal(res.json.translation, undefined);
  assert.ok(Array.isArray(res.json.error.details.examples));
});

test("rejects languages that the demo phrase book does not cover", async () => {
  const res = await postJson(app.baseUrl, "/api/translate", { text: "Hello", sourceLanguage: "en", targetLanguage: "ja" });
  assert.equal(res.status, 422);
  assert.equal(res.json.error.code, "demo_language_unsupported");
});

test("rejects a phrase whose detected language equals the target", async () => {
  const res = await postJson(app.baseUrl, "/api/translate", { text: "Hola", targetLanguage: "es" });
  assert.equal(res.status, 400);
});

test("validates input", async () => {
  const cases = [
    [{ sourceLanguage: "en", targetLanguage: "es" }, "text"],
    [{ text: "   ", targetLanguage: "es" }, "text"],
    [{ text: 42, targetLanguage: "es" }, "text"],
    [{ text: "x".repeat(5001), targetLanguage: "es" }, "text"],
    [{ text: "Hello", targetLanguage: "xx" }, "targetLanguage"],
    [{ text: "Hello" }, "targetLanguage"],
    [{ text: "Hello", sourceLanguage: "klingon", targetLanguage: "es" }, "sourceLanguage"],
    [{ text: "Hello", sourceLanguage: "en", targetLanguage: "en" }, "targetLanguage"],
  ];
  for (const [body, field] of cases) {
    const res = await postJson(app.baseUrl, "/api/translate", body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(res.json.error.code, "validation_error");
    assert.ok(res.json.error.details.fields[field], `expected error for ${field}`);
  }
  const unknown = await postJson(app.baseUrl, "/api/translate", { text: "Hello", targetLanguage: "es", admin: true });
  assert.equal(unknown.status, 400);
  assert.deepEqual(unknown.json.error.details.unknownFields, ["admin"]);
});

test("rejects malformed requests", async () => {
  assert.equal((await postJson(app.baseUrl, "/api/translate", "{not json")).status, 400);
  assert.equal((await postJson(app.baseUrl, "/api/translate", "[1,2]")).status, 400);
  assert.equal((await postJson(app.baseUrl, "/api/translate", { text: "Hello" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await postJson(app.baseUrl, "/api/translate", { text: "x".repeat(70000), targetLanguage: "es" })).status, 413);
  const wrongMethod = await fetch(`${app.baseUrl}/api/translate`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");
  assert.equal((await fetch(`${app.baseUrl}/api/nope`)).status, 404);
});

test("serves the UI with security headers and blocks path traversal", async () => {
  const page = await fetch(`${app.baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(await page.text(), /Translation Desk/);
  assert.equal((await fetch(`${app.baseUrl}/app.js`)).status, 200);
  assert.equal((await fetch(`${app.baseUrl}/%2e%2e/package.json`)).status, 404);
  assert.equal((await fetch(`${app.baseUrl}/..%5cpackage.json`)).status, 404);
  assert.equal((await fetch(`${app.baseUrl}/missing.html`)).status, 404);
});});
