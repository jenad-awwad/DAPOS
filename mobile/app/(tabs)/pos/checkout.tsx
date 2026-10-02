import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../context/AuthContext";
import { useCart } from "../../../context/CartContext";
import { createOrder, formatMoney } from "../../../lib/api";
import type { PaymentMethod } from "../../../lib/types";
import { colors, radii } from "../../../lib/theme";

const PAYMENTS: { id: PaymentMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "CARD", label: "Card" },
  { id: "CHEQUE", label: "Cheque" },
  { id: "DEBIT", label: "Debit" },
  { id: "BREAKAGE", label: "Breakage" },
  { id: "DELIVERY", label: "Delivery" },
];

export default function CheckoutScreen() {
  const { store } = useAuth();
  const { items, subtotal, setQuantity, clear } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const insets = useSafeAreaInsets();

  const currency = store?.currency ?? "USD";
  const total = subtotal;
  const footerHeight = 88 + Math.max(insets.bottom, 12);

  const completeSale = async () => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await createOrder(
        items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        paymentMethod,
      );
      clear();
      setSuccess(`Sale ${result.order.orderNumber} completed`);
      setTimeout(() => router.replace("/(tabs)/pos"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && !success) {
    return (
      <SafeAreaView style={styles.empty}>
        <Text style={styles.emptyText}>Cart is empty</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back to products</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: footerHeight }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{items.length} items</Text>
          <Pressable onPress={clear} hitSlop={8}>
            <Text style={styles.clearText}>Clear cart</Text>
          </Pressable>
        </View>

        {items.map((item) => (
          <View key={item.product.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.product.name}
              </Text>
              <Text style={styles.itemMeta}>
                {formatMoney(item.product.price, currency)} each
              </Text>
            </View>
            <View style={styles.rowActions}>
              <View style={styles.qtyControls}>
                <Pressable
                  style={styles.qtyButton}
                  onPress={() => setQuantity(item.product.id, item.quantity - 1)}
                >
                  <Text style={styles.qtyButtonText}>−</Text>
                </Pressable>
                <Text style={styles.qty}>{item.quantity}</Text>
                <Pressable
                  style={styles.qtyButton}
                  onPress={() => setQuantity(item.product.id, item.quantity + 1)}
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.lineTotal}>
                {formatMoney(item.product.price * item.quantity, currency)}
              </Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.methods}>
          {PAYMENTS.map((method) => (
            <Pressable
              key={method.id}
              style={[
                styles.methodChip,
                paymentMethod === method.id && styles.methodChipActive,
              ]}
              onPress={() => setPaymentMethod(method.id)}
            >
              <Text
                style={[
                  styles.methodText,
                  paymentMethod === method.id && styles.methodTextActive,
                ]}
              >
                {method.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatMoney(total, currency)}</Text>
        </View>
        <Pressable
          style={[styles.payButton, loading && styles.payButtonDisabled]}
          onPress={completeSale}
          disabled={loading || items.length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.payButtonText}>Complete sale</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  clearText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowMain: { gap: 4 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  itemMeta: { color: colors.textMuted, fontSize: 13 },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  qty: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    minWidth: 28,
    textAlign: "center",
  },
  lineTotal: { color: colors.primary, fontSize: 17, fontWeight: "800" },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: "30%",
    alignItems: "center",
  },
  methodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  methodTextActive: { color: "#FFFFFF" },
  error: { color: colors.danger, textAlign: "center", marginTop: 8 },
  success: {
    color: colors.green,
    textAlign: "center",
    fontWeight: "700",
    marginTop: 8,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  footerTotal: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  payButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
    minWidth: 160,
    alignItems: "center",
  },
  payButtonDisabled: { opacity: 0.7 },
  payButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  emptyText: { color: colors.textMuted, fontSize: 16 },
  link: { color: colors.primary, fontWeight: "700" },
});
