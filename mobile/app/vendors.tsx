import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../components/AppHeader";
import { useAuth } from "../context/AuthContext";
import {
  createVendorInvoice,
  createVendorPayment,
  fetchVendorBalances,
  fetchVendorInvoices,
  fetchVendorOptions,
  fetchVendorPayments,
  formatMoney,
  uploadVendorAttachment,
  type VendorOption,
} from "../lib/api";
import { userCanAccess } from "../lib/permissions";
import { colors } from "../lib/theme";

type TabKey = "invoices" | "payments" | "balances";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function VendorsScreen() {
  const { user, store } = useAuth();
  const currency = store?.currency ?? "USD";

  const canViewBalances = userCanAccess(user, ["vendors.view", "vendors.manage"]);
  const canRecord = userCanAccess(user, ["vendors.record", "vendors.manage"]);
  const hasAccess = canViewBalances || canRecord;

  const [tab, setTab] = useState<TabKey>("invoices");
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [invoices, setInvoices] = useState<Awaited<ReturnType<typeof fetchVendorInvoices>>["invoices"]>([]);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof fetchVendorPayments>>["payments"]>([]);
  const [balances, setBalances] = useState<Awaited<ReturnType<typeof fetchVendorBalances>>["balances"]>([]);

  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);

  const load = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const [vendorRes, invoiceRes, paymentRes] = await Promise.all([
        fetchVendorOptions(),
        fetchVendorInvoices(),
        fetchVendorPayments(),
      ]);
      setVendors(vendorRes.vendors);
      setInvoices(invoiceRes.invoices);
      setPayments(paymentRes.payments);
      if (canViewBalances) {
        const balanceRes = await fetchVendorBalances();
        setBalances(balanceRes.balances);
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not load vendors");
    } finally {
      setLoading(false);
    }
  }, [canViewBalances, hasAccess]);

  useEffect(() => {
    if (!hasAccess) {
      router.replace("/(tabs)");
      return;
    }
    void load();
  }, [hasAccess, load]);

  const tabs = useMemo(() => {
    const items: { key: TabKey; label: string }[] = [
      { key: "invoices", label: "Invoices" },
      { key: "payments", label: "Payments" },
    ];
    if (canViewBalances) items.push({ key: "balances", label: "Balance" });
    return items;
  }, [canViewBalances]);

  if (!hasAccess) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader showMenu={false} />
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <Text style={styles.backText}>Vendors</Text>
      </Pressable>

      <View style={styles.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.tab, tab === item.key && styles.tabActive]}
            onPress={() => setTab(item.key)}
          >
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {canRecord && tab !== "balances" ? (
        <Pressable
          style={styles.addBtn}
          onPress={() =>
            tab === "invoices" ? setAddInvoiceOpen(true) : setAddPaymentOpen(true)
          }
        >
          <Text style={styles.addBtnText}>+ Add {tab === "invoices" ? "invoice" : "payment"}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tab === "invoices"
            ? invoices.map((row) => (
                <View key={row.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{row.vendor.name}</Text>
                  <Text style={styles.meta}>{formatDate(row.invoiceDate)}</Text>
                  <Text style={styles.meta}>Invoice #{row.invoiceNumber}</Text>
                  {canViewBalances ? (
                    <Text style={styles.amount}>{formatMoney(row.total, currency)}</Text>
                  ) : null}
                  {row.attachmentUrl ? (
                    <Pressable onPress={() => Linking.openURL(row.attachmentUrl!)}>
                      <Text style={styles.link}>View attachment</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            : null}

          {tab === "payments"
            ? payments.map((row) => (
                <View key={row.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{row.vendor.name}</Text>
                  <Text style={styles.meta}>{formatDate(row.paidAt)}</Text>
                  <Text style={styles.amount}>{formatMoney(row.amount, currency)}</Text>
                  {canViewBalances ? (
                    <Text style={styles.meta}>
                      Remaining: {formatMoney(row.remainingBalance, currency)}
                    </Text>
                  ) : null}
                  {row.attachmentUrl ? (
                    <Pressable onPress={() => Linking.openURL(row.attachmentUrl!)}>
                      <Text style={styles.link}>View attachment</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            : null}

          {tab === "balances"
            ? balances.map((row) => (
                <View key={row.vendorId} style={styles.card}>
                  <Text style={styles.cardTitle}>{row.name}</Text>
                  <Text style={styles.meta}>
                    Starting: {formatMoney(row.startingBalance, currency)} (locked)
                  </Text>
                  <Text style={styles.meta}>
                    Invoices: {formatMoney(row.invoiceTotal, currency)}
                  </Text>
                  <Text style={styles.meta}>
                    Payments: {formatMoney(row.paymentTotal, currency)}
                  </Text>
                  <Text style={styles.amount}>
                    Balance: {formatMoney(row.currentBalance, currency)}
                  </Text>
                </View>
              ))
            : null}
        </ScrollView>
      )}

      <AddInvoiceModal
        visible={addInvoiceOpen}
        vendors={vendors}
        currency={currency}
        onClose={() => setAddInvoiceOpen(false)}
        onSaved={() => {
          setAddInvoiceOpen(false);
          void load();
        }}
      />

      <AddPaymentModal
        visible={addPaymentOpen}
        vendors={vendors}
        currency={currency}
        onClose={() => setAddPaymentOpen(false)}
        onSaved={() => {
          setAddPaymentOpen(false);
          void load();
        }}
      />
    </SafeAreaView>
  );
}

function pickImage(onPicked: (dataUrl: string) => void) {
  Alert.alert("Attachment", "Choose source", [
    {
      text: "Camera",
      onPress: async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Permission required", "Allow camera access.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          base64: true,
        });
        if (result.canceled || !result.assets[0]?.base64) return;
        const mime = result.assets[0].mimeType ?? "image/jpeg";
        onPicked(`data:${mime};base64,${result.assets[0].base64}`);
      },
    },
    {
      text: "Gallery",
      onPress: async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Permission required", "Allow photo library access.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          base64: true,
        });
        if (result.canceled || !result.assets[0]?.base64) return;
        const mime = result.assets[0].mimeType ?? "image/jpeg";
        onPicked(`data:${mime};base64,${result.assets[0].base64}`);
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

function AddInvoiceModal({
  visible,
  vendors,
  currency,
  onClose,
  onSaved,
}: {
  visible: boolean;
  vendors: VendorOption[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  }) {
  const [vendorName, setVendorName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate());
  const [invoiceNumberAuto, setInvoiceNumberAuto] = useState(true);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [total, setTotal] = useState("");
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setVendorName("");
    setInvoiceDate(todayIsoDate());
    setInvoiceNumberAuto(true);
    setInvoiceNumber("");
    setTotal("");
    setAttachmentKey(null);
    setPreview(null);
  };

  const save = async () => {
    const amount = Number(total);
    if (!vendorName.trim()) {
      Alert.alert("Missing vendor", "Enter vendor name.");
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert("Missing total", "Enter invoice total.");
      return;
    }
    setSaving(true);
    try {
      await createVendorInvoice({
        vendorName: vendorName.trim(),
        invoiceDate,
        invoiceNumberAuto,
        invoiceNumber: invoiceNumberAuto ? undefined : invoiceNumber.trim(),
        total: amount,
        attachmentKey,
      });
      reset();
      onSaved();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const upload = (dataUrl: string) => {
    setPreview(dataUrl);
    setSaving(true);
    uploadVendorAttachment(dataUrl)
      .then(({ key }) => setAttachmentKey(key))
      .catch((err) => {
        setPreview(null);
        Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again");
      })
      .finally(() => setSaving(false));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={styles.modalBody}>
        <Text style={styles.modalTitle}>Add invoice</Text>
        {vendors.length > 0 ? (
          <Text style={styles.hint}>Known vendors: {vendors.map((v) => v.name).join(", ")}</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Vendor name"
          value={vendorName}
          onChangeText={setVendorName}
        />
        <TextInput
          style={styles.input}
          placeholder="Date (YYYY-MM-DD)"
          value={invoiceDate}
          onChangeText={setInvoiceDate}
        />
        <View style={styles.switchRow}>
          <Text>Auto invoice number</Text>
          <Switch value={invoiceNumberAuto} onValueChange={setInvoiceNumberAuto} />
        </View>
        {!invoiceNumberAuto ? (
          <TextInput
            style={styles.input}
            placeholder="Invoice number"
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
          />
        ) : null}
        <TextInput
          style={styles.input}
          placeholder={`Total (${currency})`}
          keyboardType="decimal-pad"
          value={total}
          onChangeText={setTotal}
        />
        <Pressable style={styles.secondaryBtn} onPress={() => pickImage(upload)}>
          <Text style={styles.secondaryBtnText}>Photo attachment</Text>
        </Pressable>
        {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : null}
        <Pressable style={styles.primaryBtn} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Save</Text>
          )}
        </Pressable>
        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

function AddPaymentModal({
  visible,
  onClose,
  onSaved,
  vendors,
  currency,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  vendors: VendorOption[];
  currency: string;
}) {
  const [vendorName, setVendorName] = useState("");
  const [paidAt, setPaidAt] = useState(todayIsoDate());
  const [amount, setAmount] = useState("");
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(amount);
    if (!vendorName.trim()) {
      Alert.alert("Missing vendor", "Enter vendor name.");
      return;
    }
    if (!value || value <= 0) {
      Alert.alert("Missing amount", "Enter payment amount.");
      return;
    }
    setSaving(true);
    try {
      await createVendorPayment({
        vendorName: vendorName.trim(),
        paidAt,
        amount: value,
        attachmentKey,
      });
      setVendorName("");
      setPaidAt(todayIsoDate());
      setAmount("");
      setAttachmentKey(null);
      setPreview(null);
      onSaved();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const upload = (dataUrl: string) => {
    setPreview(dataUrl);
    setSaving(true);
    uploadVendorAttachment(dataUrl)
      .then(({ key }) => setAttachmentKey(key))
      .catch((err) => {
        setPreview(null);
        Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again");
      })
      .finally(() => setSaving(false));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={styles.modalBody}>
        <Text style={styles.modalTitle}>Add payment</Text>
        {vendors.length > 0 ? (
          <Text style={styles.hint}>Known vendors: {vendors.map((v) => v.name).join(", ")}</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Vendor name"
          value={vendorName}
          onChangeText={setVendorName}
        />
        <TextInput
          style={styles.input}
          placeholder="Date (YYYY-MM-DD)"
          value={paidAt}
          onChangeText={setPaidAt}
        />
        <TextInput
          style={styles.input}
          placeholder={`Amount (${currency})`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <Pressable style={styles.secondaryBtn} onPress={() => pickImage(upload)}>
          <Text style={styles.secondaryBtnText}>Photo attachment</Text>
        </Pressable>
        {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : null}
        <Pressable style={styles.primaryBtn} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Save</Text>
          )}
        </Pressable>
        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backText: { fontSize: 18, fontWeight: "700", color: colors.text },
  tabs: { flexDirection: "row", padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { color: colors.textMuted, fontWeight: "600" },
  tabTextActive: { color: colors.primary },
  addBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  addBtnText: { color: "#fff", fontWeight: "700" },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { color: colors.textMuted, marginTop: 4 },
  amount: { marginTop: 6, fontWeight: "700", color: colors.text },
  link: { marginTop: 8, color: colors.primary, fontWeight: "600" },
  modalBody: { padding: 20, paddingTop: 48, gap: 10 },
  modalTitle: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.primary, fontWeight: "600" },
  preview: { width: "100%", height: 160, borderRadius: 10 },
  cancel: { textAlign: "center", color: colors.textMuted, marginTop: 12 },
});
