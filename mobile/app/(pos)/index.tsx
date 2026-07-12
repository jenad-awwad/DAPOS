import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { ProductCard } from "../../components/ProductCard";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { fetchCategories, fetchProducts, formatMoney } from "../../lib/api";
import type { Product } from "../../lib/types";

export default function PosScreen() {
  const { user, store, signOut } = useAuth();
  const { addProduct, itemCount, subtotal } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const currency = store?.currency ?? "USD";

  const load = useCallback(async () => {
    setError("");
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        fetchProducts({
          search: search || undefined,
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
  }, [search, selectedCategory]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={async () => {
                await signOut();
                router.replace("/login");
              }}
              style={styles.signOut}
            >
              <Text style={styles.signOutText}>Logout</Text>
            </Pressable>
          ),
        }}
      />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name}</Text>
            <Text style={styles.store}>{store?.name}</Text>
          </View>
          {user?.role === "ADMIN" || user?.role === "MANAGER" ? (
            <Pressable
              style={styles.addProductButton}
              onPress={() => router.push("/(inventory)/add-product")}
            >
              <Text style={styles.addProductText}>+ Product</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products..."
          placeholderTextColor="#64748b"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categories}
        contentContainerStyle={styles.categoriesContent}
      >
        <Pressable
          style={[
            styles.chip,
            !selectedCategory && styles.chipActive,
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text
            style={[
              styles.chipText,
              !selectedCategory && styles.chipTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            style={[
              styles.chip,
              selectedCategory === category.id && styles.chipActive,
            ]}
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              currency={currency}
              onPress={() => addProduct(item)}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No products found</Text>
          }
        />
      )}

      {itemCount > 0 ? (
        <Pressable
          style={styles.cartBar}
          onPress={() => router.push("/(pos)/checkout")}
        >
          <Text style={styles.cartText}>
            Cart ({itemCount}) · {formatMoney(subtotal, currency)}
          </Text>
          <Text style={styles.checkout}>Checkout →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    padding: 16,
    gap: 4,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  addProductButton: {
    backgroundColor: "#166534",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addProductText: {
    color: "#f8fafc",
    fontWeight: "700",
  },
  greeting: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  store: {
    color: "#94a3b8",
    marginBottom: 8,
  },
  search: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#f8fafc",
    borderWidth: 1,
    borderColor: "#334155",
  },
  categories: {
    maxHeight: 44,
    marginBottom: 8,
  },
  categoriesContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  chipActive: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  chipText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#0f172a",
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: "#f87171",
    textAlign: "center",
    padding: 16,
  },
  empty: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 40,
  },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#22c55e",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  checkout: {
    color: "#0f172a",
    fontWeight: "700",
  },
  signOut: {
    marginRight: 8,
  },
  signOutText: {
    color: "#94a3b8",
    fontSize: 14,
  },
});
