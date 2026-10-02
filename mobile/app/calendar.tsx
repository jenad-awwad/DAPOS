import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../components/AppHeader";
import { DateTimeFields } from "../components/DateTimeFields";
import { useAuth } from "../context/AuthContext";
import {
  completeCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  formatMoney,
  updateCalendarEvent,
} from "../lib/api";
import type { CalendarEvent, CalendarEventType } from "../lib/types";
import { colors, radii } from "../lib/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const EVENT_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "ACTIVITY", label: "Task" },
  { value: "MEETING", label: "Meeting" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "SCHEDULED_ORDER", label: "Project" },
  { value: "OTHER", label: "Other" },
];

type Filter = "all" | "projects" | "tasks";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toDateValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localDateTimeToIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

function isProjectEvent(event: CalendarEvent) {
  return (
    Boolean(event.orderId) ||
    event.order?.orderType === "PROJECT" ||
    event.type === "SCHEDULED_ORDER" ||
    event.type === "INSTALLATION" ||
    event.type === "DELIVERY"
  );
}

function kindLabel(event: CalendarEvent) {
  if (isProjectEvent(event)) return "Project";
  if (event.type === "ACTIVITY") return "Task";
  return EVENT_TYPES.find((item) => item.value === event.type)?.label ?? event.type;
}

function paidTotal(event: CalendarEvent) {
  return (event.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
}

export default function CalendarScreen() {
  const { store } = useAuth();
  const currency = store?.currency ?? "USD";
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => toDateValue(new Date()));
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CalendarEventType>("ACTIVITY");
  const [date, setDate] = useState(toDateValue(new Date()));
  const [time, setTime] = useState("10:00");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  const rangeFrom = startOfMonth(month);
  const rangeTo = endOfMonth(month);

  const load = useCallback(async () => {
    const res = await fetchCalendarEvents({
      from: rangeFrom.toISOString(),
      to: rangeTo.toISOString(),
    });
    setEvents(res.events);
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch(() => undefined)
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    }, [load]),
  );

  const filtered = events.filter((event) => {
    if (filter === "projects") return isProjectEvent(event);
    if (filter === "tasks") return !isProjectEvent(event);
    return true;
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filtered) {
      const key = toDateValue(new Date(event.startsAt));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [filtered]);

  const days = useMemo(() => {
    const start = new Date(rangeFrom);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const selectedEvents = (eventsByDay.get(selectedDay) ?? []).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  const openCreate = (day = selectedDay) => {
    setEditing(null);
    setTitle("");
    setType("ACTIVITY");
    setDate(day);
    setTime("10:00");
    setCustomerName("");
    setCustomerPhone("");
    setDescription("");
    setPrice("");
    setFormOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    const starts = new Date(event.startsAt);
    setEditing(event);
    setTitle(event.title);
    setType(event.type);
    setDate(toDateValue(starts));
    setTime(toTimeValue(starts));
    setCustomerName(event.customerName ?? event.customer?.name ?? "");
    setCustomerPhone(event.customerPhone ?? event.customer?.phone ?? "");
    setDescription(event.description ?? "");
    setPrice(event.price != null ? String(event.price) : "");
    setFormOpen(true);
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Add a name for this item.");
      return;
    }
    if (!customerPhone.trim()) {
      Alert.alert("Missing phone", "Customer phone is required.");
      return;
    }
    if (!customerName.trim()) {
      Alert.alert("Missing customer", "Customer name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        type,
        startsAt: localDateTimeToIso(date, time),
        description: description.trim() || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        price: price.trim() ? Number(price) : undefined,
      };
      if (editing) {
        await updateCalendarEvent(editing.id, payload);
      } else {
        await createCalendarEvent(payload);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      Alert.alert("Could not save", err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const complete = async (event: CalendarEvent) => {
    try {
      await completeCalendarEvent(event.id);
      setFormOpen(false);
      await load();
    } catch (err) {
      Alert.alert("Could not complete", err instanceof Error ? err.message : "Request failed");
    }
  };

  const remove = async (event: CalendarEvent) => {
    try {
      await deleteCalendarEvent(event.id);
      setFormOpen(false);
      await load();
    } catch (err) {
      Alert.alert("Could not delete", err instanceof Error ? err.message : "Request failed");
    }
  };

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <AppHeader />
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} style={styles.monthNav}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, paddingHorizontal: 10 }}>
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.subtitle}>Store calendar — same as the desktop app</Text>
          </View>
          <Pressable style={styles.addButton} onPress={() => openCreate()}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.monthBar}>
          <Pressable
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            style={styles.monthNav}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            style={styles.monthNav}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.filters}>
          {(["all", "projects", "tasks"] as Filter[]).map((item) => (
            <Pressable
              key={item}
              style={[styles.filterChip, filter === item && styles.filterChipActive]}
              onPress={() => setFilter(item)}
            >
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
                {item === "all" ? "All" : item === "projects" ? "Projects" : "Tasks"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((day, index) => (
            <Text key={`${day}-${index}`} style={styles.weekday}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {days.map((day) => {
            const key = toDateValue(day);
            const inMonth = day.getMonth() === month.getMonth();
            const selected = key === selectedDay;
            const count = eventsByDay.get(key)?.length ?? 0;
            return (
              <Pressable
                key={key}
                style={[styles.dayCell, selected && styles.dayCellSelected, !inMonth && styles.dayCellMuted]}
                onPress={() => setSelectedDay(key)}
                onLongPress={() => {
                  setSelectedDay(key);
                  openCreate(key);
                }}
              >
                <Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>{day.getDate()}</Text>
                {count > 0 ? <View style={[styles.dot, selected && styles.dotSelected]} /> : <View style={styles.dotSpacer} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>
          {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : selectedEvents.length === 0 ? (
          <Text style={styles.empty}>No projects or tasks on this day</Text>
        ) : (
          selectedEvents.map((event) => {
            const project = isProjectEvent(event);
            const due = Math.max((event.price ?? 0) - paidTotal(event), 0);
            return (
              <Pressable
                key={event.id}
                style={styles.eventCard}
                onPress={() => {
                  if (isProjectEvent(event) && event.orderId) {
                    router.push(`/project/${event.orderId}`);
                    return;
                  }
                  openEdit(event);
                }}
              >
                <View style={[styles.kindBadge, { backgroundColor: project ? colors.orangeSoft : colors.primarySoft }]}>
                  <Text style={[styles.kindText, { color: project ? colors.orange : colors.primary }]}>
                    {kindLabel(event)}
                  </Text>
                </View>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>
                  {toTimeValue(new Date(event.startsAt))}
                  {event.customerName || event.customer?.name
                    ? ` · ${event.customerName ?? event.customer?.name}`
                    : ""}
                  {event.order?.projectTitle ? ` · ${event.order.projectTitle}` : ""}
                </Text>
                <View style={styles.eventFooter}>
                  <Text style={styles.statusText}>{event.status === "OPEN" ? "Open" : "Done"}</Text>
                  {event.price ? (
                    <Text style={styles.priceText}>
                      {event.status === "OPEN" && due > 0
                        ? `Due ${formatMoney(due, currency)}`
                        : formatMoney(Number(event.price), currency)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing ? "Edit item" : "New task"}</Text>
            <Pressable onPress={() => setFormOpen(false)}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Install kitchen" placeholderTextColor={colors.textLight} />

            <Text style={styles.label}>Type</Text>
            <View style={styles.filters}>
              {EVENT_TYPES.map((item) => (
                <Pressable
                  key={item.value}
                  style={[styles.filterChip, type === item.value && styles.filterChipActive]}
                  onPress={() => setType(item.value)}
                >
                  <Text style={[styles.filterText, type === item.value && styles.filterTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <DateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
            <Text style={styles.label}>Customer name</Text>
            <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Name" placeholderTextColor={colors.textLight} />
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="0501234567" placeholderTextColor={colors.textLight} keyboardType="phone-pad" />
            <Text style={styles.label}>Price (optional)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={colors.textLight} keyboardType="decimal-pad" />
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={description}
              onChangeText={setDescription}
              placeholder="Details for the team"
              placeholderTextColor={colors.textLight}
              multiline
            />

            {editing?.order ? (
              <Text style={styles.linked}>
                Linked project {editing.order.orderNumber}
                {editing.order.projectTitle ? ` — ${editing.order.projectTitle}` : ""}
              </Text>
            ) : null}

            {editing?.status === "OPEN" ? (
              <Pressable style={styles.completeButton} onPress={() => complete(editing)}>
                <Text style={styles.completeText}>Mark complete</Text>
              </Pressable>
            ) : null}

            <Pressable style={[styles.saveButton, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
            {editing?.status === "OPEN" ? (
              <Pressable style={styles.deleteButton} onPress={() => remove(editing)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 120 },
  titleRow: {
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addButtonText: { color: "#FFFFFF", fontWeight: "800" },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  monthNav: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontSize: 18, fontWeight: "800", color: colors.text },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  filterTextActive: { color: "#FFFFFF" },
  weekRow: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", color: colors.textLight, fontWeight: "700", fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginBottom: 16 },
  dayCell: {
    width: "14.28%",
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
  },
  dayCellSelected: { backgroundColor: colors.primary },
  dayCellMuted: { opacity: 0.35 },
  dayNumber: { color: colors.text, fontWeight: "700" },
  dayNumberSelected: { color: "#FFFFFF" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 4 },
  dotSelected: { backgroundColor: "#FFFFFF" },
  dotSpacer: { height: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text, paddingHorizontal: 20, marginBottom: 12 },
  empty: { textAlign: "center", color: colors.textMuted, paddingVertical: 20 },
  eventCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: radii.md,
  },
  kindBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  kindText: { fontSize: 11, fontWeight: "800" },
  eventTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  eventMeta: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
  eventFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  statusText: { color: colors.textLight, fontWeight: "700", fontSize: 12 },
  priceText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  modalBody: { paddingHorizontal: 20, paddingBottom: 40 },
  label: { color: colors.textMuted, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  notes: { minHeight: 90, textAlignVertical: "top" },
  linked: { color: colors.textMuted, marginTop: 12, fontWeight: "600" },
  completeButton: {
    backgroundColor: colors.greenSoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  completeText: { color: colors.green, fontWeight: "800" },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  saveText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  deleteButton: { alignItems: "center", paddingVertical: 16 },
  deleteText: { color: colors.danger, fontWeight: "800" },
});
