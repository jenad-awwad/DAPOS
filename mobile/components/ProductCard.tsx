import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "../lib/api";
import type { Product } from "../lib/types";

type Props = {
  product: Product;
  currency: string;
  onPress: () => void;
};

export function ProductCard({ product, currency, onPress }: Props) {
  const lowStock =
    product.lowStockAt != null && product.onStock <= product.lowStockAt;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>No image</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price}>
          {formatMoney(product.price, currency)}
        </Text>
        <Text style={[styles.stock, lowStock && styles.stockLow]}>
          Stock: {product.onStock}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    overflow: "hidden",
    margin: 6,
    minWidth: "45%",
    maxWidth: "48%",
  },
  image: {
    width: "100%",
    height: 100,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#334155",
  },
  placeholderText: {
    color: "#94a3b8",
    fontSize: 12,
  },
  body: {
    padding: 10,
    gap: 4,
  },
  name: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
    minHeight: 36,
  },
  price: {
    color: "#22c55e",
    fontSize: 16,
    fontWeight: "700",
  },
  stock: {
    color: "#94a3b8",
    fontSize: 12,
  },
  stockLow: {
    color: "#fbbf24",
  },
});
