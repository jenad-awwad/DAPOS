import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { useAuth } from "../../context/AuthContext";
import {
  fetchItemSalesReport,
  fetchOrders,
  formatMoney,
} from "../../lib/api";
import type { Order } from "../../lib/types";
import { colors, formatShortDate, formatTimeAgo, radii, todayRange } from "../../lib/theme";

export default function ReportsScreen() {
  const { store } = useAuth();
  const currency = store?.currency ?? "USD";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [itemsSold, setItemsSold] = useState(0);
  const [profit, setProfit] = useState(0);

  const load = useCallback(async () => {
    const { from, to } = todayRange();
    const [ordersRes, reportRes] = await Promise.all([
      fetchOrders({ limit: 50, dateFrom: from, dateTo: to }),
      fetchItemSalesReport({ dateFrom: from, dateTo: to }),
    ]);
    const completed = ordersRes.orders.filter((o) => o.status === "COMPLETED");
    setOrders(completed);
    setSalesTotal(completed.reduce((sum, o) => sum + Number(o.total), 0));
    setItemsSold(reportRes.summary.quantitySold);
    setProfit(reportRes.summary.totalRevenue - reportRes.summary.totalCost);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>{formatShortDate()} · Today</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sales</Text>
                <Text style={styles.summaryValue}>
                  {formatMoney(salesTotal, currency)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Orders</Text>
                <Text style={styles.summaryValue}>{orders.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Items sold</Text>
                <Text style={styles.summaryValue}>{itemsSold}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Profit</Text>
                <Text style={[styles.summaryValue, styles.profit]}>
                  {formatMoney(profit, currency)}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Today's orders</Text>
            {orders.length === 0 ? (
              <Text style={styles.empty}>No completed orders today</Text>
            ) : (
              orders.map((order) => (
                <View key={order.id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                    <Text style={styles.orderCustomer}>
                      {order.customer?.name ?? "Walk-In Customer"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.orderTotal}>
                      {formatMoney(Number(order.total), currency)}
                    </Text>
                    <Text style={styles.orderTime}>
                      {formatTimeAgo(order.completedAt ?? order.createdAt)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 120 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  subtitle: {
    color: colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    borderRadius: radii.lg,
    padding: 18,
    gap: 12,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: { color: colors.textMuted, fontWeight: "600", fontSize: 15 },
  summaryValue: { color: colors.text, fontWeight: "800", fontSize: 18 },
  profit: { color: colors.green },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  orderRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: radii.md,
    gap: 12,
  },
  orderNumber: { color: colors.text, fontWeight: "700" },
  orderCustomer: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  orderTotal: { color: colors.text, fontWeight: "800" },
  orderTime: { color: colors.textLight, fontSize: 12, marginTop: 2 },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: 24,
  },
});
