import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney } from "../lib/api";
import { colors, radii } from "../lib/theme";

type Props = {
  itemCount: number;
  subtotal: number;
  currency: string;
  onPress: () => void;
};

export function CartBar({ itemCount, subtotal, currency, onPress }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{itemCount}</Text>
        </View>
        <View>
          <Text style={styles.label}>View cart</Text>
          <Text style={styles.total}>{formatMoney(subtotal, currency)}</Text>
        </View>
      </View>
      <View style={styles.checkoutButton}>
        <Text style={styles.checkoutText}>Checkout</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  badge: {
    backgroundColor: colors.primary,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  total: { color: colors.text, fontSize: 18, fontWeight: "800" },
  checkoutButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  checkoutText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
});
