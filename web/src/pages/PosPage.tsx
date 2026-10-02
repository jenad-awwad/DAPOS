import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBarcode, IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { PosProjectPanel } from "../components/PosProjectPanel";
import { useAuth } from "../context/AuthContext";
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
import type { PaymentMethod } from "../lib/types";

const PRIMARY_PAYMENTS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];

const OTHER_PAYMENTS: PaymentMethod[] = ["DEBIT", "BREAKAGE", "DELIVERY"];

export function PosPage() {
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [posTab, setPosTab] = useState(
    searchParams.get("edit") ? "projects" : "sales",
  );
  const {
    items,
    itemCount,
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

  const productsQuery = useQuery({
    queryKey: ["products", search, categoryId],
    queryFn: () =>
      fetchProducts({
        search: search || undefined,
        categoryId: categoryId ?? undefined,
        pricedOnly: true,
      }),
  });

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

  const handleBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const { product } = await fetchProductByBarcode(code);
      addProduct(product);
      setBarcode("");
      notifications.show({
        color: "green",
        message: `Added ${product.name}`,
      });
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Product not found",
      });
    }
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

    if (loyaltyActive) {
      if (!customerName.trim() || !customerPhone.trim()) {
        notifications.show({
          color: "red",
          message: "Name and phone are required for the loyalty program",
        });
        return;
      }
    }

    const resolvedPayment = showOtherPayments ? otherPayment : paymentMethod;

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

      if (loyaltyActive) {
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
          unitPrice: Number(item.unitPrice),
        })),
        paymentMethod: resolvedPayment,
        customerId: saleCustomerId,
        discountTotal:
          invoiceDiscountAmount > 0 ? Number(invoiceDiscountAmount) : undefined,
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

  if (productsQuery.isLoading) return <Loader color="green" />;

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Point of Sale</Title>
        <Text c="dimmed">Regular sales or custom projects with multi-vendor costs</Text>
      </div>

      <Tabs value={posTab} onChange={(v) => setPosTab(v ?? "sales")} color="green">
        <Tabs.List>
          <Tabs.Tab value="sales">Regular sales</Tabs.Tab>
          <Tabs.Tab value="projects">Projects</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="sales" pt="md">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
            <Group grow align="flex-end">
              <TextInput
                label="Search"
                placeholder="Name, SKU, or barcode..."
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
              />
              <TextInput
                label="Barcode scan"
                placeholder="Scan or type barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBarcode()}
                rightSection={
                  <ActionIcon variant="light" color="green" onClick={handleBarcode}>
                    <IconBarcode size={16} />
                  </ActionIcon>
                }
              />
            </Group>

            <SegmentedControl
              value={categoryId ?? ""}
              onChange={(v) => setCategoryId(v || null)}
              data={categoryOptions}
            />

            <SimpleProductGrid
              products={productsQuery.data?.products ?? []}
              currency={store!.currency}
              onAdd={addProduct}
            />
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card withBorder padding="md" radius="md" style={{ position: "sticky", top: 80 }}>
            <Group justify="space-between" mb="sm">
              <Title order={4}>Cart</Title>
              <Badge color="green" variant="light">
                {itemCount} items
              </Badge>
            </Group>

            <ScrollArea.Autosize mah={360} offsetScrollbars>
              <Stack gap="sm">
                {items.map((item) => (
                  <Box key={item.product.id}>
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {item.product.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Catalog: {formatMoney(item.product.price, store!.currency)}
                        </Text>
                      </div>
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => removeProduct(item.product.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                    <Group justify="space-between" mt={6} align="flex-end">
                      <NumberInput
                        label="Unit price"
                        size="xs"
                        min={0}
                        decimalScale={2}
                        value={item.unitPrice}
                        onChange={(v) =>
                          setUnitPrice(item.product.id, Number(v) || 0)
                        }
                        w={110}
                      />
                      <Group gap={6}>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          onClick={() =>
                            setQuantity(item.product.id, item.quantity - 1)
                          }
                        >
                          <IconMinus size={14} />
                        </ActionIcon>
                        <NumberInput
                          size="xs"
                          w={70}
                          min={1}
                          max={item.product.onStock}
                          value={item.quantity}
                          onChange={(v) =>
                            setQuantity(item.product.id, Number(v) || 1)
                          }
                          hideControls
                        />
                        <ActionIcon
                          size="sm"
                          variant="light"
                          onClick={() =>
                            setQuantity(item.product.id, item.quantity + 1)
                          }
                        >
                          <IconPlus size={14} />
                        </ActionIcon>
                      </Group>
                      <Text fw={600} size="sm">
                        {formatMoney(item.unitPrice * item.quantity, store!.currency)}
                      </Text>
                    </Group>
                  </Box>
                ))}
                {items.length === 0 ? (
                  <Text c="dimmed" size="sm" ta="center" py="xl">
                    Tap a product to add it to the cart
                  </Text>
                ) : null}
              </Stack>
            </ScrollArea.Autosize>

            <Divider my="md" />

            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Subtotal
                </Text>
                <Text size="sm">{formatMoney(subtotal, store!.currency)}</Text>
              </Group>
              <NumberInput
                label="Invoice discount (%)"
                min={0}
                max={100}
                decimalScale={1}
                suffix="%"
                value={invoiceDiscountPercent}
                onChange={(v) =>
                  setInvoiceDiscountPercent(v === "" ? "" : Number(v) || 0)
                }
              />
              {discountPercent > 0 ? (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Discount ({discountPercent}%)
                  </Text>
                  <Text size="sm" c="red">
                    -{formatMoney(invoiceDiscountAmount, store!.currency)}
                  </Text>
                </Group>
              ) : null}
              <Group justify="space-between">
                <Text fw={700}>Total</Text>
                <Text fw={700} c="green" size="lg">
                  {formatMoney(total, store!.currency)}
                </Text>
              </Group>
            </Stack>

            <Divider my="md" />

            <Group justify="space-between" mb="xs">
              <div>
                <Text size="sm" fw={600}>
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
              />
            </Group>

            {loyaltyActive ? (
              <Stack gap="sm" mb="md">
                <Select
                  label="Existing loyalty member"
                  placeholder="New customer"
                  clearable
                  searchable
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
                  value={customerName}
                  onChange={(e) => setCustomerName(e.currentTarget.value)}
                />
                <TextInput
                  label="Phone"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.currentTarget.value)}
                />
                <TextInput
                  label="Email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.currentTarget.value)}
                />
              </Stack>
            ) : null}

            <Text size="sm" fw={600} mb={6}>
              Payment method
            </Text>
            <SegmentedControl
              fullWidth
              value={showOtherPayments ? "OTHER" : paymentMethod}
              onChange={handlePaymentSegmentChange}
              data={[
                ...PRIMARY_PAYMENTS.map((m) => ({
                  label: paymentLabel(m),
                  value: m,
                })),
                { label: "Other", value: "OTHER" },
              ]}
              mb="sm"
            />
            {showOtherPayments ? (
              <Select
                label="Other payment type"
                data={OTHER_PAYMENTS.map((m) => ({
                  value: m,
                  label: paymentLabel(m),
                }))}
                value={otherPayment}
                onChange={handleOtherPaymentChange}
                mb="md"
              />
            ) : null}

            {showOtherPayments && otherPayment === "DEBIT" && debitCustomerConfirmed ? (
              <Text size="sm" c="dimmed" mb="md">
                Debit customer: {debitCustomerName} · {debitCustomerPhone}
              </Text>
            ) : null}

            <Button
              color="green"
              fullWidth
              size="md"
              disabled={items.length === 0}
              loading={checkoutLoading}
              onClick={completeSale}
            >
              Complete sale
            </Button>
          </Card>
        </Grid.Col>
      </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="projects" pt="md">
          <PosProjectPanel />
        </Tabs.Panel>
      </Tabs>

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
  products: Parameters<typeof ProductCard>[0]["product"][];
  currency: Parameters<typeof ProductCard>[0]["currency"];
  onAdd: (product: Parameters<typeof ProductCard>[0]["product"]) => void;
}) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 16,
      }}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          currency={currency}
          onClick={() => onAdd(product)}
          compact
        />
      ))}
      {products.length === 0 ? (
        <Text c="dimmed" py="xl">
          No products found
        </Text>
      ) : null}
    </Box>
  );
}
