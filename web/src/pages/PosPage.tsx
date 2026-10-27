import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBarcode, IconTrash } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BarcodeCameraScanner,
  requestBarcodeCamera,
} from "../components/BarcodeCameraScanner";
import { PosProjectPanel } from "../components/PosProjectPanel";
import { useAuth } from "../context/AuthContext";
import { useHasPermission } from "../hooks/usePermissions";
import { useCart } from "../context/CartContext";
import {
  createOrder,
  enrollLoyaltyCustomer,
  fetchCategories,
  fetchCustomers,
  fetchProductByBarcode,
  fetchProducts,
  upsertPosCustomer,
} from "../lib/api";
import { invalidateDashboardQueries } from "../lib/dashboardQueries";
import { formatMoney, paymentLabel } from "../lib/format";
import type { PaymentMethod, Product } from "../lib/types";

const PRIMARY_PAYMENTS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];

const OTHER_PAYMENTS: PaymentMethod[] = ["DEBIT", "BREAKAGE", "DELIVERY"];

export function PosPage() {
  const { store } = useAuth();
  const canSell = useHasPermission("pos.sales");
  const canOpenProjects = useHasPermission("pos.projects");
  const canDiscount = useHasPermission("pos.discount");
  const canChangePrice = useHasPermission("pos.price");
  const canLoyalty = useHasPermission("pos.loyalty");
  const canOtherPayments = useHasPermission("pos.payments.other");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [posTab, setPosTab] = useState(
    canOpenProjects && (searchParams.get("edit") || !canSell) ? "projects" : "sales",
  );
  const activeTab = !canSell && canOpenProjects
    ? "projects"
    : canSell && !canOpenProjects
      ? "sales"
      : posTab;
  const {
    items,
    subtotal,
    addProduct,
    removeProduct,
    setQuantity,
    setUnitPrice,
    clear,
  } = useCart();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const cameraRequestRef = useRef<Promise<MediaStream> | null>(null);
  const [invoiceDiscountPercent, setInvoiceDiscountPercent] = useState<number | "">(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [otherPayment, setOtherPayment] = useState<PaymentMethod>("DEBIT");
  const [showOtherPayments, setShowOtherPayments] = useState(false);
  const [loyaltyActive, setLoyaltyActive] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [debitModalOpen, setDebitModalOpen] = useState(false);
  const [debitCustomerName, setDebitCustomerName] = useState("");
  const [debitCustomerPhone, setDebitCustomerPhone] = useState("");
  const [debitCustomerConfirmed, setDebitCustomerConfirmed] = useState(false);
  const [debitModalLoading, setDebitModalLoading] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const catalogQuery = useQuery({
    queryKey: ["products", "pos-catalog"],
    queryFn: () => fetchProducts({ pricedOnly: true }),
    enabled: canSell,
  });

  const catalog = catalogQuery.data?.products ?? [];

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query) ||
        (product.sku ?? "").toLowerCase().includes(query) ||
        product.barcode.toLowerCase().includes(query)
      );
    });
  }, [catalog, categoryId, search]);

  const customersQuery = useQuery({
    queryKey: ["customers", "loyalty"],
    queryFn: () => fetchCustomers(undefined, true),
  });

  const discountPercent =
    invoiceDiscountPercent === "" ? 0 : Math.min(100, Math.max(0, invoiceDiscountPercent));

  const invoiceDiscountAmount = useMemo(
    () => Math.round(subtotal * (discountPercent / 100) * 100) / 100,
    [subtotal, discountPercent],
  );

  const total = useMemo(
    () => Math.round(Math.max(subtotal - invoiceDiscountAmount, 0) * 100) / 100,
    [subtotal, invoiceDiscountAmount],
  );

  const categoryOptions = useMemo(() => {
    const cats = categoriesQuery.data?.categories ?? [];
    return [
      { label: "All", value: "" },
      ...cats.map((c) => ({ label: c.name, value: c.id })),
    ];
  }, [categoriesQuery.data]);

  const lookupBarcode = async (raw: string, announce = false) => {
    const code = raw.trim();
    if (!code) {
      return { ok: false, message: "Barcode is empty" };
    }
    try {
      const { product } = await fetchProductByBarcode(code);
      addProduct(product);
      setBarcode("");
      if (announce) {
        notifications.show({
          color: "green",
          message: `Added ${product.name}`,
        });
      }
      return { ok: true, message: `Added ${product.name}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Product not found";
      if (announce) notifications.show({ color: "red", message });
      return { ok: false, message };
    }
  };

  const handleBarcode = () => {
    void lookupBarcode(barcode, true);
  };

  const openCameraScanner = () => {
    cameraRequestRef.current = requestBarcodeCamera();
    setScannerOpen(true);
  };

  const selectLoyaltyCustomer = (id: string | null) => {
    setCustomerId(id);
    if (!id) {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      return;
    }
    const customer = customersQuery.data?.customers.find((c) => c.id === id);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone ?? "");
      setCustomerEmail(customer.email ?? "");
    }
  };

  const clearDebitCustomer = () => {
    setDebitCustomerName("");
    setDebitCustomerPhone("");
    setDebitCustomerConfirmed(false);
  };

  const openDebitModal = () => {
    setDebitModalOpen(true);
  };

  const handleSelectDebit = () => {
    setOtherPayment("DEBIT");
    openDebitModal();
  };

  const handleOtherPaymentChange = (value: string | null) => {
    const method = (value as PaymentMethod) ?? "DEBIT";
    if (method === "DEBIT") {
      handleSelectDebit();
      return;
    }
    clearDebitCustomer();
    setOtherPayment(method);
  };

  const handlePaymentSegmentChange = (value: string) => {
    if (value === "OTHER") {
      setShowOtherPayments(true);
      if (otherPayment === "DEBIT" && !debitCustomerConfirmed) {
        openDebitModal();
      }
      return;
    }
    setShowOtherPayments(false);
    clearDebitCustomer();
    setPaymentMethod(value as PaymentMethod);
  };

  const confirmDebitCustomer = async () => {
    if (!debitCustomerName.trim() || !debitCustomerPhone.trim()) {
      notifications.show({
        color: "red",
        message: "Name and phone are required for debit payment",
      });
      return;
    }

    setDebitModalLoading(true);
    try {
      await upsertPosCustomer({
        name: debitCustomerName.trim(),
        phone: debitCustomerPhone.trim(),
      });
      setDebitCustomerConfirmed(true);
      setDebitModalOpen(false);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Could not save customer",
      });
    } finally {
      setDebitModalLoading(false);
    }
  };

  const cancelDebitModal = () => {
    setDebitModalOpen(false);
    if (!debitCustomerConfirmed) {
      clearDebitCustomer();
      if (showOtherPayments && otherPayment === "DEBIT") {
        setOtherPayment("BREAKAGE");
      }
    }
  };

  const completeSale = async () => {
    if (items.length === 0) return;

    if (canLoyalty && loyaltyActive) {
      if (!customerName.trim() || !customerPhone.trim()) {
        notifications.show({
          color: "red",
          message: "Name and phone are required for the loyalty program",
        });
        return;
      }
    }

    const resolvedPayment =
      canOtherPayments && showOtherPayments ? otherPayment : paymentMethod;

    if (resolvedPayment === "DEBIT") {
      if (!debitCustomerConfirmed || !debitCustomerName.trim() || !debitCustomerPhone.trim()) {
        notifications.show({
          color: "red",
          message: "Customer name and phone are required for debit payment",
        });
        openDebitModal();
        return;
      }
    }

    setCheckoutLoading(true);
    try {
      let saleCustomerId: string | undefined;

      if (canLoyalty && loyaltyActive) {
        const { customer } = await enrollLoyaltyCustomer({
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim() || null,
          customerId: customerId ?? undefined,
        });
        saleCustomerId = customer.id;
      } else if (resolvedPayment === "DEBIT") {
        const { customer } = await upsertPosCustomer({
          name: debitCustomerName.trim(),
          phone: debitCustomerPhone.trim(),
        });
        saleCustomerId = customer.id;
      }

      const { order } = await createOrder({
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: Number(item.quantity),
          unitPrice: canChangePrice ? Number(item.unitPrice) : Number(item.product.price),
        })),
        paymentMethod: resolvedPayment,
        customerId: saleCustomerId,
        discountTotal:
          canDiscount && invoiceDiscountAmount > 0 ? Number(invoiceDiscountAmount) : undefined,
      });
      await invalidateDashboardQueries(queryClient);
      clear();
      setInvoiceDiscountPercent(0);
      setLoyaltyActive(false);
      selectLoyaltyCustomer(null);
      clearDebitCustomer();
      setShowOtherPayments(false);
      setPaymentMethod("CASH");
      notifications.show({
        color: "green",
        title: "Sale completed",
        message: loyaltyActive
          ? `${order.orderNumber} · Loyalty points earned`
          : `${order.orderNumber} · ${formatMoney(order.total, store!.currency)}`,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Checkout failed",
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!canSell && !canOpenProjects) {
    return (
      <Stack>
        <Title order={2}>Point of Sale</Title>
        <Text c="dimmed">You do not have permission to use the point of sale.</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" className="pos-page">
      <Group gap="xs" align="baseline" className="pos-heading">
        <Title order={4}>Point of Sale</Title>
        <Text c="dimmed" size="xs">
          Regular sales or custom projects with multi-vendor costs
        </Text>
      </Group>

      <Tabs
        className="pos-tabs"
        value={activeTab}
        onChange={(v) => setPosTab(v ?? "sales")}
        color="green"
        keepMounted={false}
      >
        <Tabs.List>
          {canSell ? <Tabs.Tab value="sales">Regular sales</Tabs.Tab> : null}
          {canOpenProjects ? <Tabs.Tab value="projects">Projects</Tabs.Tab> : null}
        </Tabs.List>

        {canSell ? (
        <Tabs.Panel value="sales" pt="sm">
          <div className="pos-board">
            <div className="pos-sale-column">
            <section className="pos-ticket">
              <Group gap={8} wrap="nowrap" p="xs" align="flex-end" className="pos-ticket-toolbar">
                <TextInput
                  aria-label="Barcode scan"
                  placeholder="Scan or type barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBarcode()}
                  style={{ flex: 1.15 }}
                  rightSectionWidth={36}
                  rightSection={
                    <ActionIcon
                      variant="light"
                      color="green"
                      aria-label="Scan barcode with camera"
                      onClick={openCameraScanner}
                    >
                      <IconBarcode size={16} />
                    </ActionIcon>
                  }
                />
                <TextInput
                  size="xs"
                  label="Search"
                  placeholder="Name, SKU, or barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
              </Group>

              <div className="pos-lines">
                <Table
                  className="pos-sale-table"
                  striped
                  highlightOnHover
                  horizontalSpacing="sm"
                  verticalSpacing={4}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Description</Table.Th>
                      <Table.Th w={88}>Qty</Table.Th>
                      <Table.Th w={120}>Price</Table.Th>
                      <Table.Th w={110}>Total</Table.Th>
                      <Table.Th w={52}>Del</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item) => (
                      <Table.Tr key={item.product.id}>
                        <Table.Td>
                          <Text size="sm" fw={600} lineClamp={1}>
                            {item.product.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            aria-label={`Quantity for ${item.product.name}`}
                            size="xs"
                            w={72}
                            min={1}
                            max={item.product.onStock}
                            value={item.quantity}
                            onChange={(v) => setQuantity(item.product.id, Number(v) || 1)}
                            hideControls
                          />
                        </Table.Td>
                        <Table.Td>
                          {canChangePrice ? (
                            <NumberInput
                              aria-label={`Unit price for ${item.product.name}`}
                              size="xs"
                              w={100}
                              min={0}
                              decimalScale={2}
                              value={item.unitPrice}
                              onChange={(v) => setUnitPrice(item.product.id, Number(v) || 0)}
                              hideControls
                            />
                          ) : (
                            <Text size="sm">{formatMoney(item.product.price, store!.currency)}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            {formatMoney(item.unitPrice * item.quantity, store!.currency)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            aria-label={`Remove ${item.product.name}`}
                            onClick={() => removeProduct(item.product.id)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {items.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Text c="dimmed" size="sm" ta="center" py="xl">
                            Tap a product to add it to the cart
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Table.Tbody>
                </Table>
              </div>
            </section>

            <Stack gap={6} p="sm" className="pos-totals">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Subtotal
                  </Text>
                  <Text size="sm">{formatMoney(subtotal, store!.currency)}</Text>
                </Group>
                {canDiscount ? (
                  <NumberInput
                    label="Invoice discount (%)"
                    size="xs"
                    min={0}
                    max={100}
                    decimalScale={1}
                    suffix="%"
                    value={invoiceDiscountPercent}
                    onChange={(v) => setInvoiceDiscountPercent(v === "" ? "" : Number(v) || 0)}
                  />
                ) : null}
                <Group justify="space-between">
                  <Text fw={700}>Total</Text>
                  <Text fw={700} c="green" size="lg">
                    {formatMoney(total, store!.currency)}
                  </Text>
                </Group>
            </Stack>

            <Stack gap="xs" p="sm" className="pos-pay">
                  {canLoyalty ? (
                    <Group justify="space-between">
                      <div>
                        <Text size="xs" fw={600}>
                          Loyalty program
                        </Text>
                        <Text size="xs" c="dimmed">
                          Add customer info to earn points
                        </Text>
                      </div>
                      <Switch
                        checked={loyaltyActive}
                        onChange={(e) => setLoyaltyActive(e.currentTarget.checked)}
                        color="green"
                        size="sm"
                      />
                    </Group>
                  ) : null}

                  {canLoyalty && loyaltyActive ? (
                    <Stack gap="xs">
                      <Select
                        label="Existing loyalty member"
                        placeholder="New customer"
                        clearable
                        searchable
                        size="xs"
                        data={(customersQuery.data?.customers ?? []).map((c) => ({
                          value: c.id,
                          label: `${c.name} · ${c.loyaltyPoints} pts`,
                        }))}
                        value={customerId}
                        onChange={(v) => selectLoyaltyCustomer(v)}
                      />
                      <TextInput
                        label="Name"
                        required
                        size="xs"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.currentTarget.value)}
                      />
                      <TextInput
                        label="Phone"
                        required
                        size="xs"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.currentTarget.value)}
                      />
                      <TextInput
                        label="Email"
                        size="xs"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.currentTarget.value)}
                      />
                    </Stack>
                  ) : null}

                  <Text size="xs" fw={600}>
                    Payment method
                  </Text>
                  <SegmentedControl
                    fullWidth
                    size="xs"
                    value={showOtherPayments ? "OTHER" : paymentMethod}
                    onChange={handlePaymentSegmentChange}
                    data={[
                      ...PRIMARY_PAYMENTS.map((m) => ({
                        label: paymentLabel(m),
                        value: m,
                      })),
                      ...(canOtherPayments ? [{ label: "Other", value: "OTHER" }] : []),
                    ]}
                  />
                  {canOtherPayments && showOtherPayments ? (
                    <Select
                      label="Other payment type"
                      size="xs"
                      data={OTHER_PAYMENTS.map((m) => ({
                        value: m,
                        label: paymentLabel(m),
                      }))}
                      value={otherPayment}
                      onChange={handleOtherPaymentChange}
                    />
                  ) : null}
                  {canOtherPayments &&
                  showOtherPayments &&
                  otherPayment === "DEBIT" &&
                  debitCustomerConfirmed ? (
                    <Text size="xs" c="dimmed">
                      Debit customer: {debitCustomerName} · {debitCustomerPhone}
                    </Text>
                  ) : null}
                  <Button
                    color="green"
                    fullWidth
                    size="sm"
                    disabled={items.length === 0}
                    loading={checkoutLoading}
                    onClick={completeSale}
                  >
                    Complete sale
                  </Button>
            </Stack>
            </div>

            <section className="pos-catalog">
              <Box className="pos-category-scroll" px="sm" pt="sm">
                  <SegmentedControl
                    value={categoryId ?? ""}
                    onChange={(v) => setCategoryId(v || null)}
                    data={categoryOptions}
                  />
                </Box>

              <div className="pos-catalog-grid">
                {catalogQuery.isLoading ? (
                  <Loader color="green" />
                ) : (
                  <SimpleProductGrid
                    products={visibleProducts}
                    currency={store!.currency}
                    onAdd={addProduct}
                  />
                )}
              </div>
            </section>
          </div>
        </Tabs.Panel>
        ) : null}

        {canOpenProjects ? (
          <Tabs.Panel value="projects" pt="md">
            <PosProjectPanel />
          </Tabs.Panel>
        ) : null}
      </Tabs>

      <BarcodeCameraScanner
        opened={scannerOpen}
        streamRequestRef={cameraRequestRef}
        onClose={() => setScannerOpen(false)}
        onDetected={lookupBarcode}
      />

      <Modal
        opened={debitModalOpen}
        onClose={cancelDebitModal}
        title="Debit payment — customer details"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Enter the customer name and phone number for this debit sale.
          </Text>
          <TextInput
            label="Customer name"
            required
            value={debitCustomerName}
            onChange={(e) => setDebitCustomerName(e.currentTarget.value)}
          />
          <TextInput
            label="Phone number"
            required
            value={debitCustomerPhone}
            onChange={(e) => setDebitCustomerPhone(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={cancelDebitModal}>
              Cancel
            </Button>
            <Button
              color="green"
              loading={debitModalLoading}
              onClick={confirmDebitCustomer}
            >
              Confirm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function SimpleProductGrid({
  products,
  currency,
  onAdd,
}: {
  products: Product[];
  currency: string;
  onAdd: (product: Product) => void;
}) {
  return (
    <div className="pos-product-grid">
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          className="pos-photo-tile"
          disabled={product.onStock < 1}
          onClick={() => onAdd(product)}
        >
          <img
            src={product.imageUrl || "https://placehold.co/160x160/e2e8f0/64748b?text=No+Image"}
            alt={product.name}
            loading="lazy"
            decoding="async"
          />
          <span>{product.name}</span>
          <strong>{formatMoney(product.price, currency)}</strong>
        </button>
      ))}
      {products.length === 0 ? (
        <Text c="dimmed" py="xl">
          No products found
        </Text>
      ) : null}
    </div>
  );
}
