import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../../components/AppHeader";
import { CartBar } from "../../../components/CartBar";
import { PosProductRow } from "../../../components/PosProductRow";
import { useAuth } from "../../../context/AuthContext";
import { useCart } from "../../../context/CartContext";
import {
  fetchCategories,
  fetchProductByBarcode,
  fetchProducts,
} from "../../../lib/api";
import type { Product } from "../../../lib/types";
import { colors, radii } from "../../../lib/theme";

export default function PosScreen() {
  const { user, store } = useAuth();
  const { addProduct, getQuantity, setQuantity, itemCount, subtotal } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const barcodeRef = useRef<TextInput>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currency = store?.currency ?? "USD";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };

  const load = useCallback(async () => {
    setError("");
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        fetchProducts({
          search: debouncedSearch || undefined,
          categoryId: selectedCategory ?? undefined,
          pricedOnly: true,
        }),
        fetchCategories(),
      ]);
      setProducts(productsRes.products);
      setCategories(categoriesRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    }
  }, [debouncedSearch, selectedCategory]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAdd = (product: Product) => {
    const added = addProduct(product);
    showToast(
      added
        ? `Added ${product.name}`
        : product.onStock < 1
          ? "Out of stock"
          : "Max stock reached",
    );
  };

  const handleBarcodeSubmit = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const { product } = await fetchProductByBarcode(code);
      handleAdd(product);
      setBarcode("");
      barcodeRef.current?.focus();
    } catch {
      showToast("Product not found");
    }
  };

  const canManageProducts =
    user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader />

      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or SKU..."
          placeholderTextColor={colors.textLight}
          returnKeyType="search"
        />
        <View style={styles.barcodeRow}>
          <TextInput
            ref={barcodeRef}
            style={[styles.search, styles.barcodeInput]}
            value={barcode}
            onChangeText={setBarcode}
            placeholder="Barcode — scan or type"
            placeholderTextColor={colors.textLight}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleBarcodeSubmit}
          />
          <Pressable style={styles.scanButton} onPress={handleBarcodeSubmit}>
            <Text style={styles.scanButtonText}>Find</Text>
          </Pressable>
        </View>
        {canManageProducts ? (
          <Pressable
            style={styles.addProductButton}
            onPress={() => router.push("/(inventory)/add-product")}
          >
            <Text style={styles.addProductText}>+ New product</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categories}
        contentContainerStyle={styles.categoriesContent}
      >
        <Pressable
          style={[styles.chip, !selectedCategory && styles.chipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>
            All
          </Text>
        </Pressable>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            style={[styles.chip, selectedCategory === category.id && styles.chipActive]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Text
              style={[
                styles.chipText,
                selectedCategory === category.id && styles.chipTextActive,
              ]}
            >
              {category.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, itemCount > 0 && styles.listWithCart]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const quantity = getQuantity(item.id);
            return (
              <PosProductRow
                product={item}
                currency={currency}
                quantity={quantity}
                onAdd={() => handleAdd(item)}
                onIncrease={() => setQuantity(item.id, quantity + 1)}
                onDecrease={() => setQuantity(item.id, quantity - 1)}
              />
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No products found</Text>}
        />
      )}

      {itemCount > 0 ? (
        <CartBar
          itemCount={itemCount}
          subtotal={subtotal}
          currency={currency}
          onPress={() => router.push("/(tabs)/pos/checkout")}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  barcodeRow: { flexDirection: "row", gap: 8 },
  barcodeInput: { flex: 1 },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  scanButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  addProductButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addProductText: { color: colors.green, fontWeight: "700", fontSize: 13 },
  categories: { maxHeight: 44, marginBottom: 4 },
  categoriesContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  toast: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: colors.greenSoft,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  toastText: {
    color: "#166534",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 14,
  },
  list: { paddingTop: 4, paddingBottom: 24 },
  listWithCart: { paddingBottom: 110 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  error: { color: colors.danger, textAlign: "center", paddingHorizontal: 24 },
  retryButton: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: colors.primary, fontWeight: "700" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
});
