import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarActivityPayments } from "../components/CalendarActivityPayments";
import { useAuth } from "../context/AuthContext";
import {
  completeCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  fetchCustomers,
  updateCalendarEvent,
} from "../lib/api";
import {
  activityBalanceDue,
  activityIsFullyPaid,
  activityPrice,
  activityRequiresPayment,
} from "../lib/calendarPayments";
import { localDateTimeToIso } from "../lib/datetime";
import {
  calendarEventTypeLabel,
  formatDateOnly,
  formatMoney,
  formatTimeOnly,
} from "../lib/format";
import type { CalendarEvent, CalendarEventType } from "../lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "SCHEDULED_ORDER", label: "Scheduled order" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "MEETING", label: "Meeting" },
  { value: "ACTIVITY", label: "Activity" },
  { value: "OTHER", label: "Other" },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date: Date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function eventColor(type: CalendarEventType) {
  const colors: Record<CalendarEventType, string> = {
    SCHEDULED_ORDER: "blue",
    INSTALLATION: "grape",
    DELIVERY: "orange",
    MEETING: "cyan",
    ACTIVITY: "teal",
    OTHER: "gray",
  };
  return colors[type] ?? "gray";
}

export function CalendarPage() {
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<CalendarEventType>("OTHER");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("10:00");
  const [formDescription, setFormDescription] = useState("");
  const [formCustomerId, setFormCustomerId] = useState<string | null>(null);
  const [formCustomerName, setFormCustomerName] = useState("");
  const [formCustomerPhone, setFormCustomerPhone] = useState("");
  const [formPrice, setFormPrice] = useState<number | "">("");

  const canCompleteEvent = (event: CalendarEvent) =>
    event.status === "OPEN" && activityIsFullyPaid(event);

  const rangeFrom = startOfMonth(month);
  const rangeTo = endOfMonth(month);
  const gridStart = new Date(rangeFrom);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const days = useMemo(() => {
    const result: Date[] = [];
    const cursor = new Date(gridStart);
    for (let i = 0; i < 42; i += 1) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [gridStart.getTime()]);

  const eventsQuery = useQuery({
    queryKey: ["calendar", rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () =>
      fetchCalendarEvents({
        from: rangeFrom.toISOString(),
        to: rangeTo.toISOString(),
      }),
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchCustomers(),
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of eventsQuery.data?.events ?? []) {
      const key = toDateInputValue(new Date(event.startsAt));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [eventsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formTitle.trim() || !formDate) {
        throw new Error("Title and date are required");
      }
      if (!formCustomerPhone.trim()) {
        throw new Error("Customer phone number is required");
      }
      if (!formCustomerName.trim() && !formCustomerId) {
        throw new Error("Customer name is required");
      }

      const startsAt = localDateTimeToIso(formDate, formTime);
      const payload = {
        title: formTitle.trim(),
        type: formType,
        startsAt,
        description: formDescription.trim() || undefined,
        customerId: formCustomerId ?? undefined,
        customerName: formCustomerName.trim() || undefined,
        customerPhone: formCustomerPhone.trim(),
        price: formPrice === "" ? undefined : Number(formPrice) || 0,
      };

      if (editingEvent) {
        return updateCalendarEvent(editingEvent.id, payload);
      }
      return createCalendarEvent(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setModalOpen(false);
      setEditingEvent(null);
      notifications.show({ color: "green", message: "Calendar updated" });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Could not save event",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeCalendarEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setModalOpen(false);
      setEditingEvent(null);
      notifications.show({ color: "green", message: "Activity marked as completed" });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Could not complete activity",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCalendarEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setModalOpen(false);
      setEditingEvent(null);
      notifications.show({ color: "green", message: "Event deleted" });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Could not delete event",
      });
    },
  });

  const openCreate = (day?: Date) => {
    setEditingEvent(null);
    setFormTitle("");
    setFormType("OTHER");
    setFormDate(day ? toDateInputValue(day) : toDateInputValue(new Date()));
    setFormTime("10:00");
    setFormDescription("");
    setFormCustomerId(null);
    setFormCustomerName("");
    setFormCustomerPhone("");
    setFormPrice("");
    setModalOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    const starts = new Date(event.startsAt);
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormType(event.type);
    setFormDate(toDateInputValue(starts));
    setFormTime(toTimeInputValue(starts));
    setFormDescription(event.description ?? "");
    setFormCustomerId(event.customerId ?? null);
    setFormCustomerName(event.customerName ?? event.customer?.name ?? "");
    setFormCustomerPhone(event.customerPhone ?? event.customer?.phone ?? "");
    setFormPrice(event.price ?? "");
    setModalOpen(true);
  };

  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  if (eventsQuery.isLoading) return <Loader color="green" />;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Calendar</Title>
          <Text c="dimmed">Track scheduled orders, installations, and activities</Text>
        </div>
        <Button color="green" leftSection={<IconPlus size={16} />} onClick={() => openCreate()}>
          New activity
        </Button>
      </Group>

      <Card withBorder padding="md" radius="md">
        <Group justify="space-between" mb="md">
          <Group>
            <Button
              variant="light"
              color="gray"
              onClick={() =>
                setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
            >
              <IconChevronLeft size={16} />
            </Button>
            <Title order={4}>{monthLabel}</Title>
            <Button
              variant="light"
              color="gray"
              onClick={() =>
                setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
            >
              <IconChevronRight size={16} />
            </Button>
          </Group>
          <Button variant="subtle" color="gray" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
        </Group>

        <Box
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {WEEKDAYS.map((day) => (
            <Text key={day} size="xs" fw={700} c="dimmed" ta="center">
              {day}
            </Text>
          ))}

          {days.map((day) => {
            const key = toDateInputValue(day);
            const inMonth = day.getMonth() === month.getMonth();
            const dayEvents = eventsByDay.get(key) ?? [];

            return (
              <Card
                key={key}
                withBorder
                padding="xs"
                radius="md"
                style={{
                  minHeight: 110,
                  opacity: inMonth ? 1 : 0.45,
                  cursor: "pointer",
                  background: inMonth ? undefined : "var(--mantine-color-gray-0)",
                }}
                onClick={() => openCreate(day)}
              >
                <Text size="sm" fw={600} mb={6}>
                  {day.getDate()}
                </Text>
                <Stack gap={4}>
                  {dayEvents.slice(0, 3).map((event) => (
                    <Badge
                      key={event.id}
                      color={event.status === "COMPLETED" ? "gray" : eventColor(event.type)}
                      variant={event.status === "COMPLETED" ? "outline" : "light"}
                      size="sm"
                      fullWidth
                      style={{ cursor: "pointer", justifyContent: "flex-start" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(event);
                      }}
                    >
                      {formatTimeOnly(event.startsAt)} {event.title}
                    </Badge>
                  ))}
                  {dayEvents.length > 3 ? (
                    <Text size="xs" c="dimmed">
                      +{dayEvents.length - 3} more
                    </Text>
                  ) : null}
                </Stack>
              </Card>
            );
          })}
        </Box>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Title order={4} mb="sm">
          Upcoming
        </Title>
        <Stack gap="sm">
          {(eventsQuery.data?.events ?? []).length === 0 ? (
            <Text c="dimmed">No events this month</Text>
          ) : (
            (eventsQuery.data?.events ?? []).map((event) => (
              <Group key={event.id} justify="space-between" wrap="nowrap">
                <div>
                  <Group gap="xs">
                    <Badge color={eventColor(event.type)} variant="light">
                      {calendarEventTypeLabel(event.type)}
                    </Badge>
                    <Badge color={event.status === "OPEN" ? "blue" : "gray"} variant="light">
                      {event.status === "OPEN" ? "Open" : "Done"}
                    </Badge>
                    <Text fw={600}>{event.title}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {formatDateOnly(event.startsAt)} · {formatTimeOnly(event.startsAt)}
                    {(event.customerName ?? event.customer?.name)
                      ? ` · ${event.customerName ?? event.customer?.name}`
                      : ""}
                    {(event.customerPhone ?? event.customer?.phone)
                      ? ` · ${event.customerPhone ?? event.customer?.phone}`
                      : ""}
                    {activityRequiresPayment(event)
                      ? ` · ${formatMoney(activityPrice(event), store!.currency)}`
                      : ""}
                  </Text>
                  {activityRequiresPayment(event) && event.status === "OPEN" ? (
                    <Text size="xs" c="dimmed">
                      Due: {formatMoney(activityBalanceDue(event), store!.currency)}
                    </Text>
                  ) : null}
                  {event.order ? (
                    <Text
                      component={Link}
                      to={`/orders/${event.order.id}`}
                      size="sm"
                      c="green"
                    >
                      {event.order.orderNumber}
                      {event.order.projectTitle ? ` — ${event.order.projectTitle}` : ""}
                    </Text>
                  ) : null}
                </div>
                <Group gap="xs">
                  {event.status === "OPEN" ? (
                    <Button
                      variant="light"
                      color="green"
                      size="xs"
                      loading={completeMutation.isPending}
                      disabled={!canCompleteEvent(event)}
                      onClick={() => completeMutation.mutate(event.id)}
                    >
                      Complete
                    </Button>
                  ) : null}
                  <Button variant="light" size="xs" onClick={() => openEdit(event)}>
                    Edit
                  </Button>
                </Group>
              </Group>
            ))
          )}
        </Stack>
      </Card>

      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        title={editingEvent ? "Edit activity" : "New activity"}
        centered
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            required
            value={formTitle}
            onChange={(e) => setFormTitle(e.currentTarget.value)}
          />
          <Select
            label="Type"
            data={EVENT_TYPES}
            value={formType}
            onChange={(v) => setFormType((v as CalendarEventType) ?? "OTHER")}
          />
          <Group grow>
            <TextInput
              label="Date"
              type="date"
              required
              value={formDate}
              onChange={(e) => setFormDate(e.currentTarget.value)}
            />
            <TextInput
              label="Time"
              type="time"
              value={formTime}
              onChange={(e) => setFormTime(e.currentTarget.value)}
            />
          </Group>
          <Select
            label="Existing customer (optional)"
            placeholder="Or enter new customer below"
            clearable
            searchable
            data={(customersQuery.data?.customers ?? []).map((c) => ({
              value: c.id,
              label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`,
            }))}
            value={formCustomerId}
            onChange={(id) => {
              setFormCustomerId(id);
              const customer = customersQuery.data?.customers.find((c) => c.id === id);
              if (customer) {
                setFormCustomerName(customer.name);
                setFormCustomerPhone(customer.phone ?? "");
              } else if (!id) {
                setFormCustomerName("");
                setFormCustomerPhone("");
              }
            }}
          />
          <Group grow>
            <TextInput
              label="Customer name"
              required={!formCustomerId}
              value={formCustomerName}
              onChange={(e) => setFormCustomerName(e.currentTarget.value)}
            />
            <TextInput
              label="Phone number"
              required
              value={formCustomerPhone}
              onChange={(e) => setFormCustomerPhone(e.currentTarget.value)}
            />
          </Group>
          <NumberInput
            label="Activity price (optional)"
            description="If set, record payments until fully paid before closing"
            min={0}
            decimalScale={2}
            value={formPrice}
            onChange={(v) => setFormPrice(v === "" ? "" : Number(v) || 0)}
          />
          <Textarea
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.currentTarget.value)}
            minRows={3}
          />

          {editingEvent?.order ? (
            <Text size="sm">
              Linked order:{" "}
              <Text
                component={Link}
                to={`/orders/${editingEvent.order.id}`}
                span
                c="green"
              >
                {editingEvent.order.orderNumber}
              </Text>
            </Text>
          ) : null}

          {editingEvent?.status === "OPEN" ? (
            <>
              <CalendarActivityPayments
                event={editingEvent}
                currency={store!.currency}
                onUpdated={(event) => {
                  setEditingEvent(event);
                  queryClient.invalidateQueries({ queryKey: ["calendar"] });
                }}
              />
              <Button
                color="green"
                variant="light"
                loading={completeMutation.isPending}
                disabled={!canCompleteEvent(editingEvent)}
                onClick={() => completeMutation.mutate(editingEvent.id)}
              >
                {activityRequiresPayment(editingEvent) && !activityIsFullyPaid(editingEvent)
                  ? `Close activity (${formatMoney(activityBalanceDue(editingEvent), store!.currency)} due)`
                  : "Close activity"}
              </Button>
            </>
          ) : null}

          <Group justify="space-between">
            {editingEvent && editingEvent.status === "OPEN" ? (
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={16} />}
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(editingEvent.id)}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setModalOpen(false);
                  setEditingEvent(null);
                }}
              >
                Cancel
              </Button>
              <Button
                color="green"
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
