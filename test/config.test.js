import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, publicConfig } from "../src/config.js";

test("defaults to demo mode on localhost:3003 without an API key", () => {
  const config = readConfig({});
  assert.equal(config.mode, "demo");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3003);
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
});

test("switches to provider mode when an API key is present", () => {
  const config = readConfig({ OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://localhost:11434/v1/", OPENAI_MODEL: "llama3" });
  assert.equal(config.mode, "provider");
  assert.equal(config.baseUrl, "http://localhost:11434/v1");
  assert.equal(config.model, "llama3");
});

test("AI_MODE=demo forces demo mode even when a key exists", () => {
  assert.equal(readConfig({ OPENAI_API_KEY: "sk-test", AI_MODE: "demo" }).mode, "demo");
});

test("rejects invalid configuration", () => {
  assert.throws(() => readConfig({ AI_MODE: "provider" }), /requires OPENAI_API_KEY/);
  assert.throws(() => readConfig({ AI_MODE: "magic" }), /AI_MODE/);
  assert.throws(() => readConfig({ OPENAI_BASE_URL: "not a url" }), /OPENAI_BASE_URL/);
  assert.throws(() => readConfig({ OPENAI_BASE_URL: "ftp://example.com" }), /http or https/);
  assert.throws(() => readConfig({ PORT: "abc" }), /PORT/);
  assert.throws(() => readConfig({ PROVIDER_TIMEOUT_MS: "10" }), /PROVIDER_TIMEOUT_MS/);
});

test("public config never exposes the API key", () => {
  const exposed = JSON.stringify(publicConfig(readConfig({ OPENAI_API_KEY: "sk-secret-value" })));
  assert.ok(!exposed.includes("sk-secret-value"));
});