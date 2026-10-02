import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { readConfig, publicConfig } from "./config.js";
import { ApiError, readJson, sendError, sendJson, serveStatic } from "./http.js";
import { LANGUAGES } from "./languages.js";
import { DEMO_LANGUAGES, DEMO_PHRASES } from "./demo-dictionary.js";
import { translateDemo, translateWithProvider, validateTranslateRequest } from "./translate.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const BODY_LIMIT = 64 * 1024;

function requireMethod(req, res, method) {
  if (req.method !== method) {
    res.setHeader("Allow", method);
    throw new ApiError(405, "method_not_allowed", `Use ${method} for this endpoint.`);
  }
}

export function createApp({ env = process.env, config = readConfig(env), fetchImpl = globalThis.fetch, logger = console } = {}) {
  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const { pathname } = url;

    if (pathname === "/api/health") {
      requireMethod(req, res, "GET");
      sendJson(res, 200, { status: "ok", mode: config.mode });
      return;
    }

    if (pathname === "/api/config") {
      requireMethod(req, res, "GET");
      sendJson(res, 200, {
        ...publicConfig(config),
        languages: LANGUAGES,
        demo:
          config.mode === "demo"
            ? { languages: DEMO_LANGUAGES, phrases: DEMO_PHRASES.map((phrase) => phrase.en) }
            : null,
      });
      return;
    }

    if (pathname === "/api/translate") {
      requireMethod(req, res, "POST");
      const body = await readJson(req, BODY_LIMIT);
      const request = validateTranslateRequest(body, config);
      const started = Date.now();
      const result =
        config.mode === "provider" ? await translateWithProvider(request, config, fetchImpl) : translateDemo(request);
      sendJson(res, 200, { ...result, durationMs: Date.now() - started });
      return;
    }

    if (pathname.startsWith("/api/")) {
      throw new ApiError(404, "not_found", "API route not found.");
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (await serveStatic(req, res, PUBLIC_DIR, pathname)) return;
    }
    throw new ApiError(404, "not_found", "Not found.");
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendError(res, err, logger);
    });
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, config };
}