import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
});

export function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

export function sendError(res, err, logger = console) {
  if (err instanceof ApiError) {
    const error = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    sendJson(res, err.status, { error });
    return;
  }
  logger.error?.("Unhandled error:", err?.stack ?? err);
  sendJson(res, 500, { error: { code: "internal_error", message: "Unexpected server error." } });
}

export async function readJson(req, limitBytes) {
  const type = String(req.headers["content-type"] ?? "");
  if (!/^application\/json(\s*;|$)/i.test(type)) {
    throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limitBytes) {
    throw new ApiError(413, "payload_too_large", `Request body must not exceed ${limitBytes} bytes.`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      throw new ApiError(413, "payload_too_large", `Request body must not exceed ${limitBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) throw new ApiError(400, "invalid_json", "Request body must be a JSON object.");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_json", "Request body must be a JSON object.");
  }
  return value;
}

export function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new ApiError(400, "validation_error", "Request contains unsupported fields.", { unknownFields: unknown });
  }
}

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

export async function serveStatic(req, res, publicDir, pathname) {
  const root = resolve(publicDir);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return false;
  }
  if (decoded.includes("\0")) return false;
  const filePath = resolve(root, `.${decoded}`);
  if (!filePath.startsWith(root + sep)) return false;
  const type = STATIC_TYPES[extname(filePath).toLowerCase()];
  if (!type) return false;
  let data;
  try {
    data = await readFile(filePath);
  } catch {
    return false;
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": type,
    "Cache-Control": "no-cache",
    "Content-Length": data.length,
  });
  res.end(req.method === "HEAD" ? undefined : data);
  return true;
}