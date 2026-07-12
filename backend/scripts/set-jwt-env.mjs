import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const envPath = ".env";
const secret = randomBytes(32).toString("hex");
let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

if (/^JWT_SECRET=/m.test(content)) {
  content = content.replace(/^JWT_SECRET=.*/m, `JWT_SECRET="${secret}"`);
} else {
  content = `${content.trimEnd()}\nJWT_SECRET="${secret}"\n`;
}

writeFileSync(envPath, content);
console.log("JWT_SECRET added to .env");
