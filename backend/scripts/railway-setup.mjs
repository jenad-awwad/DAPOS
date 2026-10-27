#!/usr/bin/env node
/**
 * Usage (after `railway login` and `railway link` in backend/):
 *   node scripts/railway-setup.mjs
 *
 * Creates API service, links Postgres DATABASE_URL, sets JWT_SECRET, deploys.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return (result.stdout || "").trim();
}

function readEnvValue(name) {
  if (!existsSync(".env")) {
    throw new Error(".env missing — run: node scripts/set-jwt-env.mjs");
  }
  const match = readFileSync(".env", "utf8").match(new RegExp(`^${name}="(.+)"$`, "m"));
  if (!match) {
    throw new Error(`${name} not found in .env`);
  }
  return match[1];
}

console.log("Checking Railway login...");
run("railway", ["whoami"]);

const jwt = readEnvValue("JWT_SECRET");
const pepper = readEnvValue("PIN_PEPPER");
console.log("Ensuring dapos-api service...");
try {
  run("railway", ["service", "dapos-api"]);
} catch {
  run("railway", ["add", "--service", "dapos-api"]);
  run("railway", ["service", "dapos-api"]);
}

console.log("Setting variables...");
run("railway", ["variables", "--set", `JWT_SECRET=${jwt}`, "--skip-deploys"]);
run("railway", ["variables", "--set", `PIN_PEPPER=${pepper}`, "--skip-deploys"]);
run("railway", [
  "variables",
  "--set",
  "DATABASE_URL=${{Postgres.DATABASE_URL}}",
  "--skip-deploys",
]);

console.log("Deploying...");
run("railway", ["up", "--detach"]);

const domain = run("railway", ["domain"]);
console.log("\nDeploy complete.");
console.log(`API URL: https://${domain}`);
console.log("Test: GET https://" + domain + "/health");
