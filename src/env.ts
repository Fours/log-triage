import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Load the repo-root .env into process.env if it exists. tsx does not read
 * .env on its own, so entry points import this module first (side effect) to
 * make ANTHROPIC_API_KEY and TRIAGE_MODEL available. Uses Node's built-in
 * loader (no dotenv dependency). A real environment variable already set
 * takes precedence — loadEnvFile does not overwrite existing values.
 */
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
