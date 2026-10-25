import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { userCanAccess } from "../../lib/permissions";
import {
  createProduct,
  fetchCategories,
  setProductPricing,
} from "../../lib/api";
import type { Product } from "../../lib/types";

export default function AddProductScreen() {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [onStock, setOnStock] = useState("0");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [barcodeMode, setBarcodeMode] = useState<"auto" | "scan">("auto");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canSetPrice = userCanAccess(user, ["products.price", "products.manage"]) || canManage;

  useEffect(() => {
    fetchCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
  }, []);

  const pickImage = async (source: "camera" | "gallery") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission required", "Allow access to continue.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            quality: 0.7,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            base64: true,
          });

    if (result.canceled || !result.assets[0]?.base64) return;

    const mime = result.assets[0].mimeType ?? "image/jpeg";
    setImageUrl(`data:${mime};base64,${result.assets[0].base64}`);
  };

  const saveBasic = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Item name is required.");
      return;
    }
    if (!supplier.trim()) {
      Alert.alert("Missing supplier", "Supplier is required.");
      return;
    }
    if (!imageUrl) {
      Alert.alert("Missing photo", "Product photo is required.");
      return;
    }
    if (barcodeMode === "scan" && !barcode.trim()) {
      Alert.alert("Missing barcode", "Scan or enter the product barcode.");
      return;
    }

    setLoading(true);
    try {
      const { product } = await createProduct({
        sku: sku.trim() || null,
        barcode: barcodeMode === "scan" ? barcode.trim() : null,
        name: name.trim(),
        supplier: supplier.trim(),
        imageUrl,
        onStock: Number(onStock) || 0,
        categoryId,
      });
      setCreatedProduct(product);
      if (!canSetPrice) {
        Alert.alert(
          "Pending pricing",
          `${product.name} was submitted. Someone with pricing permission must set the price before it can be sold.`,
          [{ text: "OK", onPress: () => router.back() }],
        );
        return;
      }
      setStep(2);
      Alert.alert("Saved", `Barcode: ${product.barcode}`);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  };

  const savePricing = async () => {
    if (!createdProduct) return;
    const priceValue = Number(price);
    const costValue = Number(cost);
    if (!priceValue || priceValue <= 0) {
      Alert.alert("Missing price", "Price is required.");
      return;
    }
    if (Number.isNaN(costValue) || costValue < 0) {
      Alert.alert("Missing cost", "Cost is required.");
      return;
    }

    setLoading(true);
    try {
      await setProductPricing(createdProduct.id, {
        price: priceValue,
        cost: costValue,
      });
      Alert.alert("Complete", "Product is ready for sale.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Managers only</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: step === 1 ? "New product · Step 1" : "New product · Step 2",
        }}
      />

      <Text style={styles.stepLabel}>
        {step === 1 ? "Item details" : "Pricing"}
      </Text>

      {step === 1 ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="SKU (optional)"
            placeholderTextColor="#64748b"
            value={sku}
            onChangeText={setSku}
          />
          <TextInput
            style={styles.input}
            placeholder="Item name *"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Barcode</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.chip, barcodeMode === "auto" && styles.chipActive]}
              onPress={() => {
                setBarcodeMode("auto");
                setBarcode("");
              }}
            >
              <Text style={styles.chipText}>Auto</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, barcodeMode === "scan" && styles.chipActive]}
              onPress={() => setBarcodeMode("scan")}
            >
              <Text style={styles.chipText}>Scan existing</Text>
            </Pressable>
          </View>
          {barcodeMode === "scan" ? (
            <TextInput
              style={styles.input}
              placeholder="Scan or type barcode *"
              placeholderTextColor="#64748b"
              value={barcode}
              onChangeText={setBarcode}
              autoCapitalize="none"
            />
          ) : (
            <Text style={styles.hint}>Barcode is generated automatically on save.</Text>
          )}

          <TextInput
            style={styles.input}
            placeholder="Supplier *"
            placeholderTextColor="#64748b"
            value={supplier}
            onChangeText={setSupplier}
          />
          <TextInput
            style={styles.input}
            placeholder="Stock *"
            placeholderTextColor="#64748b"
            keyboardType="number-pad"
            value={onStock}
            onChangeText={setOnStock}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            <Pressable
              style={[styles.chip, categoryId === null && styles.chipActive]}
              onPress={() => setCategoryId(null)}
            >
              <Text style={styles.chipText}>None</Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                style={[
                  styles.chip,
                  categoryId === category.id && styles.chipActive,
                ]}
                onPress={() => setCategoryId(category.id)}
              >
                <Text style={styles.chipText}>{category.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Product photo *</Text>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.preview} />
          ) : null}
          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={() => pickImage("camera")}>
              <Text style={styles.secondaryButtonText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => pickImage("gallery")}>
              <Text style={styles.secondaryButtonText}>Gallery</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>Barcode is assigned when you save phase 1.</Text>

          <Pressable style={styles.primaryButton} onPress={saveBasic} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Save and continue</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.productName}>{createdProduct?.name}</Text>
          <Text style={styles.hint}>Barcode: {createdProduct?.barcode}</Text>
          <TextInput
            style={styles.input}
            placeholder="Price *"
            placeholderTextColor="#64748b"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
          <TextInput
            style={styles.input}
            placeholder="Cost *"
            placeholderTextColor="#64748b"
            keyboardType="decimal-pad"
            value={cost}
            onChangeText={setCost}
          />
          <Pressable style={styles.primaryButton} onPress={savePricing} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Complete product</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 16, gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  errorText: { color: "#f87171" },
  stepLabel: { color: "#94a3b8", fontSize: 14, marginBottom: 4 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { color: "#64748b", fontSize: 13 },
  productName: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  preview: { width: "100%", height: 180, borderRadius: 12 },
  row: { flexDirection: "row", gap: 10 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipActive: { backgroundColor: "#166534" },
  chipText: { color: "#f8fafc", fontSize: 13 },
  primaryButton: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#f8fafc", fontWeight: "600" },
});
