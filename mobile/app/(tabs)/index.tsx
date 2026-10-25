import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import {
  colors,
  formatShortDate,
  formatTimeAgo,
  greetingForHour,
  radii,
  todayRange,
} from "../../lib/theme";

type MetricProps = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  bg: string;
};

function MetricCard({ label, value, icon, tint, bg }: MetricProps) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user, store } = useAuth();
  const currency = store?.currency ?? "USD";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [salesTotal, setSalesTotal] = useState(0);
  const [itemsSold, setItemsSold] = useState(0);
  const [profit, setProfit] = useState<number | null>(0);

  const load = useCallback(async () => {
    const { from, to } = todayRange();
    const [ordersRes, reportRes] = await Promise.all([
      fetchOrders({ limit: 20, dateFrom: from, dateTo: to }),
      fetchItemSalesReport({ dateFrom: from, dateTo: to }),
    ]);

    const completed = ordersRes.orders.filter((o) => o.status === "COMPLETED");
    setOrderCount(completed.length);
    setOrders(completed.slice(0, 5));
    setSalesTotal(
      completed.reduce((sum, order) => sum + Number(order.total), 0),
    );
    setItemsSold(reportRes.summary.quantitySold);
    setProfit(
      reportRes.summary.totalCost != null
        ? reportRes.summary.totalRevenue - reportRes.summary.totalCost
        : null,
    );
  }, []);

  useEffect(() => {
    load()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const canAddProduct =
    user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <AppHeader />

        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>{greetingForHour()} 👋</Text>
          <Text style={styles.welcome}>Welcome back</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionCard, styles.actionPrimary]}
            onPress={() => router.push("/(tabs)/pos")}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="cart" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.actionTitle}>POS</Text>
            <Text style={styles.actionSubtitle}>Start Selling</Text>
          </Pressable>

          {canAddProduct ? (
            <Pressable
              style={[styles.actionCard, styles.actionGreen]}
              onPress={() => router.push("/(inventory)/add-product")}
            >
              <View style={styles.actionIconWrapGreen}>
                <Ionicons name="add" size={30} color={colors.green} />
              </View>
              <Text style={[styles.actionTitle, styles.actionTitleDark]}>
                Add Product
              </Text>
              <Text style={[styles.actionSubtitle, styles.actionSubtitleDark]}>
                New Product
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionCard, styles.actionGreen]}
              onPress={() => router.push("/(tabs)/products")}
            >
              <View style={styles.actionIconWrapGreen}>
                <Ionicons name="cube" size={26} color={colors.green} />
              </View>
              <Text style={[styles.actionTitle, styles.actionTitleDark]}>
                Products
              </Text>
              <Text style={[styles.actionSubtitle, styles.actionSubtitleDark]}>
                Browse catalog
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={styles.projectCard}
          onPress={() => router.push("/new-project")}
        >
          <View style={styles.actionIconWrap}>
            <Ionicons name="briefcase" size={26} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>New Project</Text>
            <Text style={styles.actionSubtitle}>Same as desktop — price, materials, schedule</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
        </Pressable>

        <Pressable
          style={styles.vendorsBar}
          onPress={() => router.push("/vendors")}
        >
          <View style={styles.vendorsBarIcon}>
            <Ionicons name="storefront" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Vendors</Text>
            <Text style={styles.actionSubtitle}>Invoices, payments, and balances</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today Overview</Text>
          <Text style={styles.sectionDate}>{formatShortDate()}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Sales"
              value={formatMoney(salesTotal, currency)}
              icon="cash-outline"
              tint={colors.primary}
              bg={colors.primarySoft}
            />
            <MetricCard
              label="Orders"
              value={String(orderCount)}
              icon="receipt-outline"
              tint={colors.green}
              bg={colors.greenSoft}
            />
            <MetricCard
              label="Items Sold"
              value={String(itemsSold)}
              icon="cube-outline"
              tint={colors.orange}
              bg={colors.orangeSoft}
            />
            <MetricCard
              label="Profit"
              value={profit != null ? formatMoney(profit, currency) : "—"}
              icon="trending-up-outline"
              tint={colors.blue}
              bg={colors.blueSoft}
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          <Pressable onPress={() => router.push("/(tabs)/reports")}>
            <Text style={styles.link}>View All</Text>
          </Pressable>
        </View>

        {orders.length === 0 ? (
          <Text style={styles.emptyOrders}>No orders yet today</Text>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderRow}>
              <View style={styles.orderIcon}>
                <Ionicons name="bag-handle-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.orderInfo}>
                <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                <Text style={styles.orderCustomer}>
                  {order.customer?.name ?? "Walk-In Customer"}
                </Text>
              </View>
              <View style={styles.orderMeta}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 120,
  },
  greetingBlock: {
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },
  welcome: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: radii.lg,
    padding: 18,
    backgroundColor: colors.orange,
  },
  vendorsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: radii.lg,
    padding: 18,
    backgroundColor: colors.teal,
  },
  vendorsBarIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionCard: {
    flex: 1,
    borderRadius: radii.lg,
    padding: 18,
    minHeight: 130,
    justifyContent: "space-between",
  },
  actionPrimary: {
    backgroundColor: colors.primary,
  },
  actionGreen: {
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconWrapGreen: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 12,
  },
  actionTitleDark: {
    color: colors.text,
  },
  actionSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  actionSubtitleDark: {
    color: colors.textMuted,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  sectionDate: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  link: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  metricCard: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: radii.md,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  orderIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  orderInfo: {
    flex: 1,
    gap: 2,
  },
  orderNumber: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  orderCustomer: {
    color: colors.textMuted,
    fontSize: 13,
  },
  orderMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  orderTotal: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  orderTime: {
    color: colors.textLight,
    fontSize: 12,
  },
  emptyOrders: {
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: 20,
  },
});
