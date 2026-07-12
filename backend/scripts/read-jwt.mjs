import { readFileSync, existsSync } from "node:fs";

if (!existsSync(".env")) process.exit(1);
const match = readFileSync(".env", "utf8").match(/^JWT_SECRET="(.+)"$/m);
if (!match) process.exit(1);
process.stdout.write(match[1]);
