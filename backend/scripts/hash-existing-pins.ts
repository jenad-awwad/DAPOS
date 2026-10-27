import { prisma } from "../src/lib/prisma.js";
import { hashPin } from "../src/lib/pin.js";

const pending = await prisma.user.findMany({
  where: { pin: { not: null }, pinHash: null },
  select: { id: true, pin: true },
});

let hashed = 0;
for (const user of pending) {
  if (!user.pin) continue;
  await prisma.user.update({
    where: { id: user.id },
    data: { pinHash: await hashPin(user.pin), pin: null },
  });
  hashed += 1;
}

const remaining = await prisma.user.count({
  where: { pin: { not: null } },
});

console.log(`Hashed ${hashed} PIN(s). Rows still storing a plain-text PIN: ${remaining}.`);
await prisma.$disconnect();
