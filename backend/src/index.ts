import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { app } from "./app.js";
import { storageMode } from "./lib/object-storage.js";
import { repairVendorPermissionDefaults } from "./services/store-roles.js";

if (storageMode() === "ephemeral") {
  console.error(
    "File storage is ephemeral. Configure S3 or UPLOAD_DIR so uploads survive redeploys.",
  );
}

try {
  await repairVendorPermissionDefaults();
} catch (error) {
  console.error("Could not repair store role permissions", error);
}

const port = Number(process.env.PORT ?? 3000);

function listen(hostname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname }, () => {
      console.log(`DAPOS API listening on http://localhost:${port}`);
      resolve();
    }) as Server;
    server.once("error", reject);
  });
}

// "::" accepts IPv6 localhost and IPv4 on this host. Fall back if IPv6 is unavailable.
try {
  await listen("::");
} catch (error) {
  console.warn("IPv6 bind failed, listening on IPv4 only", error);
  await listen("0.0.0.0");
}
