import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { DateTimeFields } from "../components/DateTimeFields";
import {
  createProjectOrder,
  formatMoney,
  recordProjectPayment,
} from "../lib/api";
import type { CalendarEventType, PaymentMethod } from "../lib/types";
import { colors, radii } from "../lib/theme";

type MaterialDraft = {
  key: string;
  description: string;
  vendor: string;
  quantity: string;
  unitCost: string;
};

const SCHEDULE_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "SCHEDULED_ORDER", label: "Scheduled order" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "ACTIVITY", label: "Activity" },
  { value: "MEETING", label: "Meeting" },
  { value: "OTHER", label: "Other" },
];

const PAYMENTS: { id: PaymentMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "CARD", label: "Card" },
  { id: "CHEQUE", label: "Cheque" },
  { id: "DEBIT", label: "Debit" },
  { id: "BREAKAGE", label: "Breakage" },
  { id: "DELIVERY", label: "Delivery" },
];

function newMaterial(): MaterialDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description: "",
    vendor: "",
    quantity: "1",
    unitCost: "0",
  };
}

function localDateTimeToIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

export default function NewProjectScreen() {
  const { store } = useAuth();
  const currency = store?.currency ?? "USD";
  const [projectTitle, setProjectTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [materials, setMaterials] = useState<MaterialDraft[]>([newMaterial()]);
  const [sellQuantity, setSellQuantity] = useState("1");
  const [sellUnitPrice, setSellUnitPrice] = useState("0");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [scheduleDate, setScheduleDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [scheduleTime, setScheduleTime] = useState("10:00");
  const [scheduleType, setScheduleType] = useState<CalendarEventType>("SCHEDULED_ORDER");
  const [partialAmount, setPartialAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState<"save" | "schedule" | null>(null);

  const qty = Math.max(Number(sellQuantity) || 1, 0.001);
  const unitPrice = Math.max(Number(sellUnitPrice) || 0, 0);
  const sellGross = Math.round(qty * unitPrice * 100) / 100;
  const discountPct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountTotal = Math.round(sellGross * (discountPct / 100) * 100) / 100;
  const customerTotal = Math.round(Math.max(sellGross - discountTotal, 0) * 100) / 100;

  const updateMaterial = (key: string, patch: Partial<MaterialDraft>) => {
    setMaterials((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const buildPayload = (scheduleAt?: string) => {
    const validMaterials = materials.filter(
      (line) => line.description.trim() && line.vendor.trim() && Number(line.quantity) > 0,
    );
    return {
      projectTitle: projectTitle.trim(),
      sellQuantity: qty,
      sellUnitPrice: unitPrice,
      materials:
        validMaterials.length > 0
          ? validMaterials.map((line) => ({
              description: line.description.trim(),
              vendor: line.vendor.trim(),
              quantity: Number(line.quantity) || 0,
              unitCost: Number(line.unitCost) || 0,
            }))
          : undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      discountTotal: discountTotal > 0 ? discountTotal : undefined,
      ...(scheduleAt ? { scheduleAt, scheduleType } : {}),
    };
  };

  const validateBase = () => {
    if (!projectTitle.trim()) {
      Alert.alert("Missing title", "Project title is required.");
      return false;
    }
    if (qty <= 0) {
      Alert.alert("Invalid quantity", "Sell quantity must be greater than zero.");
      return false;
    }
    if (unitPrice < 0) {
      Alert.alert("Invalid price", "Sell unit price cannot be negative.");
      return false;
    }
    return true;
  };

  const recordPartialIfNeeded = async (orderId: string) => {
    const amount = Number(partialAmount) || 0;
    if (amount <= 0) return;
    if (amount > customerTotal) {
      throw new Error("Partial payment cannot exceed customer total");
    }
    await recordProjectPayment(orderId, { amount, paymentMethod });
  };

  const save = async (schedule: boolean) => {
    if (!validateBase()) return;
    if (!customerPhone.trim() || !customerName.trim()) {
      Alert.alert("Missing customer", "Name and phone are required so this project appears on the store calendar.");
      return;
    }
    const date = scheduleDate.trim();
    if (!date) {
      Alert.alert("Missing date", "Pick a schedule date for the calendar.");
      return;
    }

    setSaving(schedule ? "schedule" : "save");
    try {
      const scheduleAt = localDateTimeToIso(date, scheduleTime);
      const { order } = await createProjectOrder(buildPayload(scheduleAt));
      await recordPartialIfNeeded(order.id);
      Alert.alert(
        "Saved on store calendar",
        `${order.orderNumber} is on the same calendar as the desktop app.`,
        [{ text: "Open calendar", onPress: () => router.replace("/calendar") }],
      );
    } catch (err) {
      Alert.alert("Could not save", err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "New project" }} />

      <Text style={styles.label}>Project title *</Text>
      <TextInput
        style={styles.input}
        value={projectTitle}
        onChangeText={setProjectTitle}
        placeholder="e.g. Custom curtain 3m × 2m"
        placeholderTextColor={colors.textLight}
      />

      <Text style={styles.label}>Customer name</Text>
      <TextInput
        style={styles.input}
        value={customerName}
        onChangeText={setCustomerName}
        placeholder="Name"
        placeholderTextColor={colors.textLight}
      />
      <Text style={styles.label}>Phone</Text>
      <TextInput
        style={styles.input}
        value={customerPhone}
        onChangeText={setCustomerPhone}
        placeholder="0501234567"
        placeholderTextColor={colors.textLight}
        keyboardType="phone-pad"
      />

      <Text style={styles.section}>Raw materials (internal cost)</Text>
      {materials.map((line, index) => (
        <View key={line.key} style={styles.materialCard}>
          <View style={styles.materialHeader}>
            <Text style={styles.materialTitle}>Material {index + 1}</Text>
            {materials.length > 1 ? (
              <Pressable onPress={() => setMaterials((rows) => rows.filter((row) => row.key !== line.key))}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          <TextInput
            style={styles.input}
            value={line.description}
            onChangeText={(value) => updateMaterial(line.key, { description: value })}
            placeholder="Material / description"
            placeholderTextColor={colors.textLight}
          />
          <TextInput
            style={styles.input}
            value={line.vendor}
            onChangeText={(value) => updateMaterial(line.key, { vendor: value })}
            placeholder="Vendor / supplier"
            placeholderTextColor={colors.textLight}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.half]}
              value={line.quantity}
              onChangeText={(value) => updateMaterial(line.key, { quantity: value })}
              placeholder="Qty"
              placeholderTextColor={colors.textLight}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.half]}
              value={line.unitCost}
              onChangeText={(value) => updateMaterial(line.key, { unitCost: value })}
              placeholder="Unit cost"
              placeholderTextColor={colors.textLight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      ))}
      <Pressable style={styles.addMaterial} onPress={() => setMaterials((rows) => [...rows, newMaterial()])}>
        <Text style={styles.addMaterialText}>+ Add material</Text>
      </Pressable>

      <Text style={styles.section}>Customer price</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={sellQuantity}
            onChangeText={setSellQuantity}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textLight}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Unit price</Text>
          <TextInput
            style={styles.input}
            value={sellUnitPrice}
            onChangeText={setSellUnitPrice}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textLight}
          />
        </View>
      </View>
      <Text style={styles.label}>Discount %</Text>
      <TextInput
        style={styles.input}
        value={discountPercent}
        onChangeText={setDiscountPercent}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textLight}
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Price subtotal</Text>
          <Text style={styles.summaryValue}>{formatMoney(sellGross, currency)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.customerTotalLabel}>Customer total</Text>
          <Text style={styles.customerTotal}>{formatMoney(customerTotal, currency)}</Text>
        </View>
      </View>

      <Text style={styles.section}>Partial payment (optional)</Text>
      <TextInput
        style={styles.input}
        value={partialAmount}
        onChangeText={setPartialAmount}
        placeholder="Amount now"
        placeholderTextColor={colors.textLight}
        keyboardType="decimal-pad"
      />
      <View style={styles.chipRow}>
        {PAYMENTS.map((method) => (
          <Pressable
            key={method.id}
            style={[styles.chip, paymentMethod === method.id && styles.chipActive]}
            onPress={() => setPaymentMethod(method.id)}
          >
            <Text style={[styles.chipText, paymentMethod === method.id && styles.chipTextActive]}>
              {method.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional notes"
        placeholderTextColor={colors.textLight}
        multiline
      />

      <Text style={styles.section}>Schedule</Text>
      <DateTimeFields
        date={scheduleDate}
        time={scheduleTime}
        onDateChange={setScheduleDate}
        onTimeChange={setScheduleTime}
      />
      <View style={styles.chipRow}>
        {SCHEDULE_TYPES.map((item) => (
          <Pressable
            key={item.value}
            style={[styles.chip, scheduleType === item.value && styles.chipActive]}
            onPress={() => setScheduleType(item.value)}
          >
            <Text style={[styles.chipText, scheduleType === item.value && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, saving && { opacity: 0.7 }]}
        onPress={() => save(false)}
        disabled={!!saving}
      >
        {saving === "save" ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.saveButtonText}>Save open project</Text>
        )}
      </Pressable>
      <Pressable
        style={[styles.scheduleButton, saving && { opacity: 0.7 }]}
        onPress={() => save(true)}
        disabled={!!saving}
      >
        {saving === "schedule" ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.scheduleButtonText}>Schedule project</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48, gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", marginTop: 8 },
  section: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginTop: 4,
  },
  notes: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  materialCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  materialHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  materialTitle: { fontWeight: "700", color: colors.text },
  addMaterial: {
    alignSelf: "flex-start",
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addMaterialText: { color: colors.green, fontWeight: "700" },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { color: colors.textMuted, fontWeight: "600" },
  summaryValue: { color: colors.text, fontWeight: "700" },
  customerTotalLabel: { color: colors.text, fontWeight: "800" },
  customerTotal: { color: colors.green, fontWeight: "800", fontSize: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#FFFFFF" },
  saveButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveButtonText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  scheduleButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  scheduleButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
});
