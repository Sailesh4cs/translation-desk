function intFromEnv(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function readConfig(env = process.env) {
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  const mode = String(env.AI_MODE ?? "").trim().toLowerCase() || (apiKey ? "provider" : "demo");
  if (!["demo", "provider"].includes(mode)) {
    throw new Error("AI_MODE must be either 'demo' or 'provider'.");
  }
  if (mode === "provider" && !apiKey) {
    throw new Error("AI_MODE=provider requires OPENAI_API_KEY to be set.");
  }
  const baseUrl = String(env.OPENAI_BASE_URL ?? "").trim() || "https://api.openai.com/v1";
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("OPENAI_BASE_URL must be an absolute http(s) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("OPENAI_BASE_URL must use http or https.");
  }
  return Object.freeze({
    mode,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: String(env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini",
    timeoutMs: intFromEnv(env, "PROVIDER_TIMEOUT_MS", 20000, 500, 120000),
    host: String(env.HOST ?? "").trim() || "127.0.0.1",
    port: intFromEnv(env, "PORT", 3003, 0, 65535),
    maxTextLength: intFromEnv(env, "MAX_TEXT_LENGTH", 5000, 1, 20000),
  });
}

export function publicConfig(config) {
  return {
    mode: config.mode,
    model: config.mode === "provider" ? config.model : null,
    providerHost: config.mode === "provider" ? new URL(config.baseUrl).host : null,
    maxTextLength: config.maxTextLength,
  };
}