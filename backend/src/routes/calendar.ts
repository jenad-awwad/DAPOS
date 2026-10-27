import { errorResponse } from "../lib/errors.js";
import { Hono } from "hono";
import { CalendarEventType } from "@prisma/client";
import { z } from "zod";
import { zDateTimeString } from "../lib/datetime.js";
import { withAttachmentUrl } from "../lib/object-storage.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import {
  completeCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  recordCalendarEventPayment,
  updateCalendarEvent,
} from "../services/calendar-events.js";
import { PaymentMethod } from "@prisma/client";

const listQuerySchema = z.object({
  from: zDateTimeString.optional(),
  to: zDateTimeString.optional(),
});

const createEventSchema = z.object({
  title: z.string().trim().min(1),
  type: z.nativeEnum(CalendarEventType).optional(),
  startsAt: zDateTimeString,
  endsAt: zDateTimeString.optional(),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().min(1),
  attachmentKey: z.string().trim().min(1).nullable().optional(),
});

const updateEventSchema = createEventSchema.partial();

const recordActivityPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod),
});

async function presentEvent<T extends { attachmentKey?: string | null }>(
  event: T,
  requestUrl: string,
) {
  return serialize(await withAttachmentUrl(event, requestUrl));
}

async function presentEvents<T extends { attachmentKey?: string | null }>(
  events: T[],
  requestUrl: string,
) {
  return serialize(
    await Promise.all(events.map((event) => withAttachmentUrl(event, requestUrl))),
  );
}

export const calendarRoutes = new Hono<AppEnv>();

calendarRoutes.get(
  "/",
  requireAuth,
  requireAnyPermission("calendar.view", "calendar.manage"),
  async (c) => {
  const { storeId } = c.get("auth");
  const parsed = listQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  if (!parsed.success) {
    return c.json({ error: "Invalid calendar filters", details: parsed.error.flatten() }, 400);
  }

  const events = await listCalendarEvents(storeId, {
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });

  return c.json({ events: await presentEvents(events, c.req.url) });
});

calendarRoutes.get(
  "/:id",
  requireAuth,
  requireAnyPermission("calendar.view", "calendar.manage"),
  async (c) => {
  const { storeId } = c.get("auth");
  const event = await getCalendarEvent(storeId, c.req.param("id"));

  if (!event) {
    return c.json({ error: "Calendar event not found" }, 404);
  }

  return c.json({ event: await presentEvent(event, c.req.url) });
});

calendarRoutes.post("/", requireAuth, requireAnyPermission("calendar.manage"), async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid event payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const event = await createCalendarEvent({
      storeId,
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      allDay: parsed.data.allDay,
      description: parsed.data.description,
      price: parsed.data.price,
      orderId: parsed.data.orderId,
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      attachmentKey: parsed.data.attachmentKey,
    });

    return c.json({ event: await presentEvent(event, c.req.url) }, 201);
  } catch (error) {
    return errorResponse(c, error, "Could not create event");
  }
});

calendarRoutes.patch("/:id", requireAuth, requireAnyPermission("calendar.manage"), async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = updateEventSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid event payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const event = await updateCalendarEvent(storeId, c.req.param("id"), {
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      allDay: parsed.data.allDay,
      description: parsed.data.description,
      price: parsed.data.price,
      orderId: parsed.data.orderId,
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      attachmentKey: parsed.data.attachmentKey,
    });

    return c.json({ event: await presentEvent(event, c.req.url) });
  } catch (error) {
    return errorResponse(c, error, "Could not update event");
  }
});

calendarRoutes.post(
  "/:id/payments",
  requireAuth,
  requireAnyPermission("calendar.manage"),
  async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = recordActivityPaymentSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid activity payment payload", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const event = await recordCalendarEventPayment(storeId, c.req.param("id"), {
      amount: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
    });
    if (!event) {
      return c.json({ error: "Calendar event not found" }, 404);
    }
    return c.json({ event: await presentEvent(event, c.req.url) }, 201);
  } catch (error) {
    return errorResponse(c, error, "Could not record payment");
  }
});

calendarRoutes.post(
  "/:id/complete",
  requireAuth,
  requireAnyPermission("calendar.manage"),
  async (c) => {
  const { storeId } = c.get("auth");

  try {
    const event = await completeCalendarEvent(storeId, c.req.param("id"));
    return c.json({ event: await presentEvent(event, c.req.url) });
  } catch (error) {
    return errorResponse(c, error, "Could not complete event");
  }
});

calendarRoutes.delete("/:id", requireAuth, requireAnyPermission("calendar.manage"), async (c) => {
  const { storeId } = c.get("auth");

  try {
    await deleteCalendarEvent(storeId, c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(c, error, "Could not delete event");
  }
});
