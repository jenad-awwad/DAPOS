import { Hono } from "hono";
import { CalendarEventType } from "@prisma/client";
import { z } from "zod";
import { zDateTimeString } from "../lib/datetime.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
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
});

const updateEventSchema = createEventSchema.partial();

const recordActivityPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod),
});

export const calendarRoutes = new Hono<AppEnv>();

calendarRoutes.get("/", requireAuth, async (c) => {
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

  return c.json({ events: serialize(events) });
});

calendarRoutes.get("/:id", requireAuth, async (c) => {
  const { storeId } = c.get("auth");
  const event = await getCalendarEvent(storeId, c.req.param("id"));

  if (!event) {
    return c.json({ error: "Calendar event not found" }, 404);
  }

  return c.json({ event: serialize(event) });
});

calendarRoutes.post("/", requireAuth, async (c) => {
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
    });

    return c.json({ event: serialize(event) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create event";
    return c.json({ error: message }, 400);
  }
});

calendarRoutes.patch("/:id", requireAuth, async (c) => {
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
    });

    return c.json({ event: serialize(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update event";
    return c.json({ error: message }, 400);
  }
});

calendarRoutes.post("/:id/payments", requireAuth, async (c) => {
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
    return c.json({ event: serialize(event) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record payment";
    return c.json({ error: message }, 400);
  }
});

calendarRoutes.post("/:id/complete", requireAuth, async (c) => {
  const { storeId } = c.get("auth");

  try {
    const event = await completeCalendarEvent(storeId, c.req.param("id"));
    return c.json({ event: serialize(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete event";
    return c.json({ error: message }, 400);
  }
});

calendarRoutes.delete("/:id", requireAuth, async (c) => {
  const { storeId } = c.get("auth");

  try {
    await deleteCalendarEvent(storeId, c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete event";
    return c.json({ error: message }, 400);
  }
});
