import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { useAuth } from "../../context/AuthContext";
import { fetchProducts, formatMoney } from "../../lib/api";
import type { Product } from "../../lib/types";
import { colors, radii } from "../../lib/theme";

export default function ProductsScreen() {
  const { store } = useAuth();
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currency = store?.currency ?? "USD";

  const load = useCallback(async () => {
    const res = await fetchProducts({
      search: search.trim() || undefined,
      pricedOnly: true,
    });
    setProducts(res.products);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader />
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products..."
          placeholderTextColor={colors.textLight}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>Stock {item.onStock}</Text>
              </View>
              <Text style={styles.price}>{formatMoney(item.price, currency)}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No products found</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  rowInfo: { flex: 1, gap: 4 },
  name: { color: colors.text, fontWeight: "700", fontSize: 15 },
  meta: { color: colors.textMuted, fontSize: 13 },
  price: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
