import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "../lib/api";
import type { Product } from "../lib/types";
import { colors, radii } from "../lib/theme";

type Props = {
  product: Product;
  currency: string;
  quantity: number;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
};

export function PosProductRow({
  product,
  currency,
  quantity,
  onAdd,
  onIncrease,
  onDecrease,
}: Props) {
  const outOfStock = product.onStock < 1;
  const atMax = quantity >= product.onStock;
  const lowStock =
    product.lowStockAt != null && product.onStock <= product.lowStockAt;

  return (
    <View style={[styles.row, outOfStock && styles.rowDisabled]}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>{product.name.slice(0, 1)}</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price}>{formatMoney(product.price, currency)}</Text>
        <Text style={[styles.stock, lowStock && styles.stockLow]}>
          {outOfStock ? "Out of stock" : `Stock ${product.onStock}`}
        </Text>
      </View>

      {quantity > 0 ? (
        <View style={styles.qtyGroup}>
          <Pressable style={styles.qtyButton} onPress={onDecrease}>
            <Text style={styles.qtyButtonText}>−</Text>
          </Pressable>
          <Text style={styles.qtyValue}>{quantity}</Text>
          <Pressable
            style={[styles.qtyButton, atMax && styles.qtyButtonDisabled]}
            onPress={onIncrease}
            disabled={atMax}
          >
            <Text style={styles.qtyButtonText}>+</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.addButton, outOfStock && styles.addButtonDisabled]}
          onPress={onAdd}
          disabled={outOfStock}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
    minHeight: 76,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowDisabled: { opacity: 0.55 },
  image: { width: 56, height: 56, borderRadius: 10 },
  imagePlaceholder: {
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: colors.primary, fontSize: 20, fontWeight: "700" },
  info: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 20 },
  price: { color: colors.primary, fontSize: 16, fontWeight: "800" },
  stock: { color: colors.textMuted, fontSize: 12 },
  stockLow: { color: colors.orange },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 64,
    alignItems: "center",
  },
  addButtonDisabled: { backgroundColor: colors.border },
  addButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  qtyGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonDisabled: { opacity: 0.45 },
  qtyButtonText: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  qtyValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    minWidth: 22,
    textAlign: "center",
  },
});
