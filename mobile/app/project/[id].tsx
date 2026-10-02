import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import {
  fetchOrder,
  formatMoney,
  recordProjectPayment,
  submitProjectOrder,
} from "../../lib/api";
import type { Order, PaymentMethod } from "../../lib/types";
import { colors, radii } from "../../lib/theme";

const PAYMENTS: { id: PaymentMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "CARD", label: "Card" },
  { id: "CHEQUE", label: "Cheque" },
  { id: "DEBIT", label: "Debit" },
  { id: "BREAKAGE", label: "Breakage" },
  { id: "DELIVERY", label: "Delivery" },
];

function paidTotal(order: Order) {
  return Math.round(
    (order.payments ?? [])
      .filter((payment) => !payment.status || payment.status === "COMPLETED")
      .reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
  ) / 100;
}

function balanceDue(order: Order) {
  return Math.round(Math.max(Number(order.total) - paidTotal(order), 0) * 100) / 100;
}

function paymentLabel(method: string) {
  return PAYMENTS.find((item) => item.id === method)?.label ?? method;
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store } = useAuth();
  const currency = store?.currency ?? "USD";
  const [tab, setTab] = useState<"info" | "payments">("info");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetchOrder(id);
    setOrder(res.order);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => {
          Alert.alert("Could not load project", err instanceof Error ? err.message : "Request failed");
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    }, [load]),
  );

  const recordPayment = async () => {
    if (!order) return;
    const value = Number(amount) || 0;
    const due = balanceDue(order);
    if (value <= 0) {
      Alert.alert("Missing amount", "Enter a payment greater than zero.");
      return;
    }
    if (value > due) {
      Alert.alert("Too much", `Amount cannot exceed ${formatMoney(due, currency)}`);
      return;
    }
    setSaving(true);
    try {
      const res = await recordProjectPayment(order.id, { amount: value, paymentMethod: method });
      setOrder(res.order);
      setAmount("");
    } catch (err) {
      Alert.alert("Could not record payment", err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await submitProjectOrder(order.id);
      setOrder(res.order);
      Alert.alert("Project closed", `${res.order.orderNumber} is completed.`);
    } catch (err) {
      Alert.alert("Could not close project", err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !order) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.empty}>Project not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const due = balanceDue(order);
  const paid = paidTotal(order);
  const isOpen = order.status === "OPEN";
  const materials = order.projectMaterials ?? [];
  const qty = order.projectSellQuantity ?? 1;
  const unitPrice = order.projectSellUnitPrice ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{order.projectTitle || order.orderNumber}</Text>
          <Text style={styles.meta}>{order.orderNumber} · {order.status === "OPEN" ? "Open" : "Done"}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === "info" && styles.tabActive]} onPress={() => setTab("info")}>
          <Text style={[styles.tabText, tab === "info" && styles.tabTextActive]}>Project</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "payments" && styles.tabActive]} onPress={() => setTab("payments")}>
          <Text style={[styles.tabText, tab === "payments" && styles.tabTextActive]}>Payments</Text>
        </Pressable>
      </View>

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
        {tab === "info" ? (
          <>
            <View style={styles.card}>
              <Row label="Customer" value={order.customer?.name ?? "—"} />
              <Row label="Phone" value={order.customer?.phone ?? "—"} />
              <Row label="Cashier" value={order.cashier?.name ?? "—"} />
              {order.notes ? <Row label="Notes" value={order.notes} /> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.section}>Customer price</Text>
              <Row label="Quantity" value={String(qty)} />
              <Row label="Unit price" value={formatMoney(unitPrice, currency)} />
              <Row label="Discount" value={formatMoney(order.discountTotal, currency)} />
              <Row label="Customer total" value={formatMoney(order.total, currency)} strong />
            </View>

            <View style={styles.card}>
              <Text style={styles.section}>Materials (internal)</Text>
              {materials.length === 0 ? (
                <Text style={styles.empty}>No materials recorded</Text>
              ) : (
                materials.map((line) => (
                  <View key={line.id} style={styles.material}>
                    <Text style={styles.materialName}>{line.description}</Text>
                    <Text style={styles.meta}>
                      {line.vendor} · {line.quantity} × {formatMoney(line.unitCost, currency)}
                    </Text>
                    <Text style={styles.materialTotal}>{formatMoney(line.lineTotal, currency)}</Text>
                  </View>
                ))
              )}
              <Row label="Material cost" value={formatMoney(order.subtotal, currency)} />
              <Row
                label="Estimated margin"
                value={formatMoney(order.total - order.subtotal, currency)}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Paid</Text>
                <Text style={styles.summaryValue}>{formatMoney(paid, currency)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Due</Text>
                <Text style={[styles.summaryValue, { color: due > 0 ? colors.orange : colors.green }]}>
                  {formatMoney(due, currency)}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.section}>Payment history</Text>
              {(order.payments ?? []).length === 0 ? (
                <Text style={styles.empty}>No payments yet</Text>
              ) : (
                (order.payments ?? []).map((payment) => (
                  <View key={payment.id} style={styles.paymentRow}>
                    <View>
                      <Text style={styles.materialName}>{paymentLabel(payment.method)}</Text>
                      <Text style={styles.meta}>
                        {payment.paidAt
                          ? new Date(payment.paidAt).toLocaleString()
                          : payment.status}
                      </Text>
                    </View>
                    <Text style={styles.materialTotal}>{formatMoney(Number(payment.amount), currency)}</Text>
                  </View>
                ))
              )}
            </View>

            {isOpen && due > 0 ? (
              <View style={styles.card}>
                <Text style={styles.section}>Add partial payment</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder={`Up to ${formatMoney(due, currency)}`}
                  placeholderTextColor={colors.textLight}
                  keyboardType="decimal-pad"
                />
                <View style={styles.chipRow}>
                  {PAYMENTS.map((item) => (
                    <Pressable
                      key={item.id}
                      style={[styles.chip, method === item.id && styles.chipActive]}
                      onPress={() => setMethod(item.id)}
                    >
                      <Text style={[styles.chipText, method === item.id && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[styles.payButton, saving && { opacity: 0.7 }]}
                  onPress={recordPayment}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.payButtonText}>Record payment</Text>
                  )}
                </Pressable>
              </View>
            ) : isOpen && due <= 0 ? (
              <View style={styles.card}>
                <Text style={styles.fullyPaid}>Fully paid. You can close this project.</Text>
                <Pressable
                  style={[styles.payButton, saving && { opacity: 0.7 }]}
                  onPress={submit}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.payButtonText}>Submit project</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Text style={styles.empty}>This project is closed.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, gap: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: 8,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontWeight: "800", color: colors.textMuted },
  tabTextActive: { color: "#FFFFFF" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    gap: 10,
  },
  section: { fontWeight: "800", color: colors.text, fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: colors.textMuted, fontWeight: "600" },
  rowValue: { color: colors.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  rowStrong: { color: colors.primary, fontSize: 16 },
  material: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  materialName: { fontWeight: "700", color: colors.text },
  materialTotal: { color: colors.primary, fontWeight: "800", marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
  },
  summaryLabel: { color: colors.textMuted, fontWeight: "600" },
  summaryValue: { color: colors.text, fontWeight: "800", fontSize: 20, marginTop: 4 },
  paymentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  input: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#FFFFFF" },
  payButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  payButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  fullyPaid: { color: colors.green, fontWeight: "700" },
  empty: { color: colors.textMuted, textAlign: "center" },
  link: { color: colors.primary, fontWeight: "800" },
});
