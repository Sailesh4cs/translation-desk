import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/app.js";

// Minimal .env loader (no dependencies). Existing environment variables win.
const envPath = fileURLToPath(new URL("./.env", import.meta.url));
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

let app;
try {
  app = createApp();
} catch (err) {
  console.error(`Configuration error: ${err.message}`);
  process.exit(1);
}

const { server, config } = app;
server.listen(config.port, config.host, () => {
  const address = server.address();
  const shownHost = address.address.includes(":") ? `[${address.address}]` : address.address;
  console.log(`Translation Desk listening on http://${shownHost}:${address.port} (mode: ${config.mode})`);
  if (config.mode === "provider") console.log(`Provider: ${new URL(config.baseUrl).host}, model: ${config.model}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}