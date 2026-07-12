import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { createOrder, formatMoney } from "../../lib/api";
import type { PaymentMethod } from "../../lib/types";

const PRIMARY_PAYMENTS: { id: PaymentMethod; label: string }[] = [
  { id: "CASH", label: "Cash" },
  { id: "CARD", label: "Card" },
  { id: "CHEQUE", label: "Cheque" },
];

const OTHER_PAYMENTS: { id: PaymentMethod; label: string }[] = [
  { id: "DEBIT", label: "Debit" },
  { id: "BREAKAGE", label: "Breakage" },
  { id: "DELIVERY", label: "Delivery order" },
];

export default function CheckoutScreen() {
  const { store } = useAuth();
  const { items, subtotal, setQuantity, clear } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [otherPayment, setOtherPayment] = useState<PaymentMethod>("DEBIT");
  const [showOtherPayments, setShowOtherPayments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currency = store?.currency ?? "USD";
  const total = subtotal;

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
        showOtherPayments ? otherPayment : paymentMethod,
      );
      clear();
      setSuccess(`Sale ${result.order.orderNumber} completed`);
      setTimeout(() => router.replace("/(pos)"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && !success) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Cart is empty</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back to products</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {items.map((item) => (
        <View key={item.product.id} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.itemName}>{item.product.name}</Text>
            <Text style={styles.itemPrice}>
              {formatMoney(item.product.price, currency)} each
            </Text>
          </View>
          <View style={styles.qtyControls}>
            <Pressable
              style={styles.qtyButton}
              onPress={() =>
                setQuantity(item.product.id, item.quantity - 1)
              }
            >
              <Text style={styles.qtyButtonText}>−</Text>
            </Pressable>
            <Text style={styles.qty}>{item.quantity}</Text>
            <Pressable
              style={styles.qtyButton}
              onPress={() =>
                setQuantity(item.product.id, item.quantity + 1)
              }
            >
              <Text style={styles.qtyButtonText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.lineTotal}>
            {formatMoney(item.product.price * item.quantity, currency)}
          </Text>
        </View>
      ))}

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatMoney(total, currency)}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Payment method</Text>
      <View style={styles.methods}>
        {PRIMARY_PAYMENTS.map((method) => (
          <Pressable
            key={method.id}
            style={[
              styles.methodChip,
              !showOtherPayments && paymentMethod === method.id && styles.methodChipActive,
            ]}
            onPress={() => {
              setShowOtherPayments(false);
              setPaymentMethod(method.id);
            }}
          >
            <Text
              style={[
                styles.methodText,
                !showOtherPayments && paymentMethod === method.id && styles.methodTextActive,
              ]}
            >
              {method.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            styles.methodChip,
            showOtherPayments && styles.methodChipActive,
          ]}
          onPress={() => setShowOtherPayments(true)}
        >
          <Text
            style={[
              styles.methodText,
              showOtherPayments && styles.methodTextActive,
            ]}
          >
            Other
          </Text>
        </Pressable>
      </View>
      {showOtherPayments ? (
        <View style={[styles.methods, { marginTop: 8 }]}>
          {OTHER_PAYMENTS.map((method) => (
            <Pressable
              key={method.id}
              style={[
                styles.methodChip,
                otherPayment === method.id && styles.methodChipActive,
              ]}
              onPress={() => setOtherPayment(method.id)}
            >
              <Text
                style={[
                  styles.methodText,
                  otherPayment === method.id && styles.methodTextActive,
                ]}
              >
                {method.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <Pressable
        style={[styles.payButton, loading && styles.payButtonDisabled]}
        onPress={completeSale}
        disabled={loading || items.length === 0}
      >
        {loading ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.payButtonText}>
            Complete sale · {formatMoney(total, currency)}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  row: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rowInfo: {
    gap: 2,
  },
  itemName: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
  itemPrice: {
    color: "#94a3b8",
    fontSize: 13,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  qty: {
    color: "#f8fafc",
    fontSize: 16,
    minWidth: 24,
    textAlign: "center",
  },
  lineTotal: {
    color: "#22c55e",
    fontSize: 16,
    fontWeight: "700",
    alignSelf: "flex-end",
  },
  summary: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "#94a3b8",
  },
  summaryValue: {
    color: "#f8fafc",
  },
  totalLabel: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  totalValue: {
    color: "#22c55e",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  methods: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  methodChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  methodChipActive: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  methodText: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  methodTextActive: {
    color: "#0f172a",
  },
  error: {
    color: "#f87171",
    textAlign: "center",
  },
  success: {
    color: "#22c55e",
    textAlign: "center",
    fontWeight: "600",
  },
  payButton: {
    backgroundColor: "#22c55e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payButtonText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    gap: 12,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 16,
  },
  link: {
    color: "#22c55e",
    fontWeight: "600",
  },
});
