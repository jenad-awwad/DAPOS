import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useModulesMenu } from "../context/ModulesMenuContext";
import { colors } from "../lib/theme";

type ModuleItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  href?: string;
  adminOnly?: boolean;
};

const MODULES: ModuleItem[] = [
  {
    key: "vendors",
    label: "Vendors",
    icon: "storefront-outline",
    color: colors.teal,
    bg: colors.tealSoft,
    href: "/vendors",
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: "calendar-outline",
    color: colors.primary,
    bg: colors.primarySoft,
    href: "/calendar",
  },
  {
    key: "orders",
    label: "Orders",
    icon: "receipt-outline",
    color: colors.orange,
    bg: colors.orangeSoft,
    href: "/(tabs)/reports",
  },
  {
    key: "products",
    label: "Products",
    icon: "cube-outline",
    color: colors.orange,
    bg: colors.orangeSoft,
    href: "/(tabs)/products",
  },
  {
    key: "inventory",
    label: "Inventory",
    icon: "layers-outline",
    color: colors.teal,
    bg: colors.tealSoft,
    href: "/(inventory)/add-product",
    adminOnly: true,
  },
  {
    key: "reports",
    label: "Reports",
    icon: "bar-chart-outline",
    color: colors.blue,
    bg: colors.blueSoft,
    href: "/(tabs)/reports",
  },
  {
    key: "customers",
    label: "Customers",
    icon: "people-outline",
    color: colors.pink,
    bg: colors.pinkSoft,
    href: "/(tabs)/reports",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    color: colors.textMuted,
    bg: "#F1F5F9",
    href: "/(tabs)/reports",
  },
];

export function ModulesMenu() {
  const { visible, close } = useModulesMenu();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const items = MODULES.filter((item) => !item.adminOnly || isManager);

  const navigate = async (href?: string) => {
    close();
    if (href) {
      router.push(href as never);
    }
  };

  const logout = async () => {
    close();
    await signOut();
    router.replace("/login");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>All Modules</Text>
            <Pressable onPress={close} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetBody}
          >
            <Pressable
              style={styles.vendorsRow}
              onPress={() => navigate("/vendors")}
            >
              <View style={styles.vendorsRowIcon}>
                <Ionicons name="storefront" size={26} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vendorsRowTitle}>Vendors</Text>
                <Text style={styles.vendorsRowSubtitle}>
                  Invoices, payments, and balances
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </Pressable>

            <View style={styles.grid}>
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  style={styles.moduleCard}
                  onPress={() => navigate(item.href)}
                >
                  <View style={[styles.moduleIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={26} color={item.color} />
                  </View>
                  <Text style={styles.moduleLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable style={styles.logoutRow} onPress={logout}>
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "88%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  sheetBody: {
    paddingBottom: 8,
  },
  vendorsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.teal,
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  vendorsRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  vendorsRowTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  vendorsRowSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  moduleCard: {
    width: "22%",
    minWidth: 72,
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  moduleIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "700",
  },
});
