import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  ProductBarcodeField,
  type BarcodeMode,
} from "../components/ProductBarcodeField";
import { ProductImagePicker } from "../components/ProductImagePicker";
import { useAuth } from "../context/AuthContext";
import { useCanManage } from "../hooks/useRoles";
import {
  createProduct,
  deleteProduct,
  fetchAllCategories,
  fetchProducts,
  setProductPricing,
  updateProduct,
} from "../lib/api";
import { formatMoney } from "../lib/format";
import type { Product } from "../lib/types";

type BasicFormValues = {
  sku: string;
  name: string;
  supplier: string;
  imageUrl: string;
  onStock: number;
  categoryId: string;
  barcode: string;
};

type PricingFormValues = {
  price: number;
  cost: number;
};

type EditFormValues = BasicFormValues & PricingFormValues & { lowStockAt: number | "" };

const PRODUCT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "NEEDS_PRICING", label: "Needs pricing" },
  { value: "PRICED", label: "Ready for sale" },
] as const;

const emptyBasicForm: BasicFormValues = {
  sku: "",
  name: "",
  supplier: "",
  imageUrl: "",
  onStock: 0,
  categoryId: "",
  barcode: "",
};

const emptyPricingForm: PricingFormValues = {
  price: 0,
  cost: 0,
};

function toIsoDateTime(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function ProductsAdminPage() {
  const canManage = useCanManage();
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [pricingOpened, { open: openPricing, close: closePricing }] = useDisclosure(false);
  const [step, setStep] = useState(0);
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("auto");
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);

  const [nameSearch, setNameSearch] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [debouncedName] = useDebouncedValue(nameSearch.trim(), 300);
  const [debouncedBarcode] = useDebouncedValue(barcodeSearch.trim(), 300);

  const filters = useMemo(
    () => ({
      includeInactive: true,
      name: debouncedName || undefined,
      barcode: debouncedBarcode || undefined,
      status: (statusFilter as typeof PRODUCT_STATUSES[number]["value"]) ?? undefined,
      dateFrom: toIsoDateTime(dateFrom),
      dateTo: toIsoDateTime(dateTo),
    }),
    [debouncedName, debouncedBarcode, statusFilter, dateFrom, dateTo],
  );

  const productsQuery = useQuery({
    queryKey: ["products", "admin", filters],
    queryFn: () => fetchProducts(filters),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: fetchAllCategories,
  });

  const basicForm = useForm<BasicFormValues>({
    initialValues: emptyBasicForm,
    validate: {
      name: (v) => (!v.trim() ? "Name is required" : null),
      supplier: (v) => (!v.trim() ? "Supplier is required" : null),
      imageUrl: (v) => (!v ? "Product photo is required" : null),
    },
  });

  const pricingForm = useForm<PricingFormValues>({
    initialValues: emptyPricingForm,
    validate: {
      price: (v) => (v <= 0 ? "Price is required" : null),
      cost: (v) => (v < 0 ? "Cost is required" : null),
    },
  });

  const editForm = useForm<EditFormValues>({
    initialValues: {
      ...emptyBasicForm,
      ...emptyPricingForm,
      lowStockAt: "",
    },
  });

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const createBasicMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: ({ product }) => {
      invalidateProducts();
      setCreatedProduct(product);
      setStep(1);
      notifications.show({
        color: "green",
        message: `Product created · Barcode ${product.barcode}`,
      });
    },
    onError: (err: Error) => {
      notifications.show({ color: "red", message: err.message });
    },
  });

  const pricingMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: PricingFormValues }) =>
      setProductPricing(id, values),
    onSuccess: () => {
      invalidateProducts();
      notifications.show({ color: "green", message: "Pricing saved" });
      close();
      closePricing();
      resetCreateFlow();
      setPricingProduct(null);
    },
    onError: (err: Error) => {
      notifications.show({ color: "red", message: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditFormValues }) =>
      updateProduct(id, {
        sku: values.sku || null,
        name: values.name,
        supplier: values.supplier,
        imageUrl: values.imageUrl,
        onStock: values.onStock,
        lowStockAt: values.lowStockAt === "" ? null : values.lowStockAt,
        categoryId: values.categoryId || null,
        price: values.price,
        cost: values.cost,
      }),
    onSuccess: () => {
      invalidateProducts();
      notifications.show({ color: "green", message: "Product updated" });
      close();
      setEditing(null);
      editForm.reset();
    },
    onError: (err: Error) => {
      notifications.show({ color: "red", message: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      invalidateProducts();
      notifications.show({ color: "green", message: "Product deactivated" });
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  const resetCreateFlow = () => {
    setStep(0);
    setBarcodeMode("auto");
    setCreatedProduct(null);
    basicForm.reset();
    pricingForm.reset();
  };

  const hasFilters =
    nameSearch.trim() !== "" ||
    barcodeSearch.trim() !== "" ||
    statusFilter !== null ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setNameSearch("");
    setBarcodeSearch("");
    setStatusFilter(null);
    setDateFrom("");
    setDateTo("");
  };

  if (!canManage) return <Navigate to="/" replace />;
  if (productsQuery.isLoading) return <Loader color="green" />;

  const categoryOptions = (categoriesQuery.data?.categories ?? [])
    .filter((c) => c.isActive !== false)
    .map((c) => ({ value: c.id, label: c.name }));

  const products = productsQuery.data?.products ?? [];

  const openCreate = () => {
    setEditing(null);
    resetCreateFlow();
    open();
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    editForm.setValues({
      sku: product.sku ?? "",
      name: product.name,
      supplier: product.supplier,
      imageUrl: product.imageUrl,
      onStock: product.onStock,
      categoryId: product.categoryId ?? "",
      barcode: product.barcode,
      price: product.price,
      cost: product.cost ?? 0,
      lowStockAt: product.lowStockAt ?? "",
    });
    open();
  };

  const openPricingOnly = (product: Product) => {
    setPricingProduct(product);
    pricingForm.setValues({
      price: product.price > 0 ? product.price : 0,
      cost: product.cost ?? 0,
    });
    openPricing();
  };

  const handleCloseCreate = () => {
    close();
    resetCreateFlow();
    setEditing(null);
    editForm.reset();
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Manage Products</Title>
          <Text c="dimmed">
            Phase 1: item details and photo. Phase 2: price and cost.
          </Text>
        </div>
        <Button color="green" leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add product
        </Button>
      </Group>

      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Item name"
                placeholder="Search by name..."
                leftSection={<IconSearch size={16} />}
                value={nameSearch}
                onChange={(e) => setNameSearch(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Barcode"
                placeholder="Search by barcode..."
                leftSection={<IconSearch size={16} />}
                value={barcodeSearch}
                onChange={(e) => setBarcodeSearch(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Inserted from"
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Inserted to"
                type="datetime-local"
                value={dateTo}
                onChange={(e) => setDateTo(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Item status"
                placeholder="All statuses"
                clearable
                data={[...PRODUCT_STATUSES]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </Grid.Col>
          </Grid>

          {hasFilters ? (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {productsQuery.isFetching
                  ? "Updating results..."
                  : `${products.length} product(s) found`}
              </Text>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconX size={14} />}
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Card>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Barcode</Table.Th>
            <Table.Th>SKU</Table.Th>
            <Table.Th>Supplier</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Stock</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {products.map((product) => (
            <Table.Tr key={product.id}>
              <Table.Td>{product.name}</Table.Td>
              <Table.Td>{product.barcode}</Table.Td>
              <Table.Td>{product.sku ?? "—"}</Table.Td>
              <Table.Td>{product.supplier}</Table.Td>
              <Table.Td>
                {product.isPriced
                  ? formatMoney(product.price, store!.currency)
                  : "—"}
              </Table.Td>
              <Table.Td>{product.onStock}</Table.Td>
              <Table.Td>
                <Group gap={6}>
                  <Badge color={product.isActive === false ? "red" : "green"} variant="light">
                    {product.isActive === false ? "Inactive" : "Active"}
                  </Badge>
                  {!product.isPriced ? (
                    <Badge color="orange" variant="light">
                      Needs pricing
                    </Badge>
                  ) : null}
                </Group>
              </Table.Td>
              <Table.Td ta="right">
                <Group gap={4} justify="flex-end">
                  {!product.isPriced ? (
                    <Button
                      size="xs"
                      variant="light"
                      color="orange"
                      onClick={() => openPricingOnly(product)}
                    >
                      Add pricing
                    </Button>
                  ) : null}
                  <ActionIcon variant="light" onClick={() => openEdit(product)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  {product.isActive !== false ? (
                    <ActionIcon
                      color="red"
                      variant="light"
                      onClick={() => deleteMutation.mutate(product.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  ) : null}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {products.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          No products match your filters
        </Text>
      ) : null}

      <Modal
        opened={opened}
        onClose={handleCloseCreate}
        title={editing ? "Edit product" : "New product"}
        size="lg"
      >
        {editing ? (
          <form onSubmit={editForm.onSubmit((values) => updateMutation.mutate({ id: editing.id, values }))}>
            <Stack gap="sm">
              <TextInput label="Barcode" readOnly value={editForm.values.barcode} />
              <TextInput label="SKU" {...editForm.getInputProps("sku")} />
              <TextInput label="Name" required {...editForm.getInputProps("name")} />
              <TextInput label="Supplier" required {...editForm.getInputProps("supplier")} />
              <ProductImagePicker
                value={editForm.values.imageUrl}
                onChange={(value) => editForm.setFieldValue("imageUrl", value)}
                error={editForm.errors.imageUrl as string | undefined}
              />
              <Group grow>
                <NumberInput label="Price" min={0} decimalScale={2} required {...editForm.getInputProps("price")} />
                <NumberInput label="Cost" min={0} decimalScale={2} required {...editForm.getInputProps("cost")} />
              </Group>
              <Group grow>
                <NumberInput label="Stock" min={0} {...editForm.getInputProps("onStock")} />
                <NumberInput label="Low stock at" min={0} {...editForm.getInputProps("lowStockAt")} />
              </Group>
              <Select
                label="Category"
                data={categoryOptions}
                clearable
                {...editForm.getInputProps("categoryId")}
              />
              <Button type="submit" color="green" loading={updateMutation.isPending}>
                Save changes
              </Button>
            </Stack>
          </form>
        ) : (
          <>
            <Stepper active={step} mb="lg">
              <Stepper.Step label="Item details" description="Photo, supplier, stock" />
              <Stepper.Step label="Pricing" description="Price and cost" />
            </Stepper>

            {step === 0 ? (
              <form
                onSubmit={basicForm.onSubmit((values) => {
                  if (barcodeMode === "scan" && !values.barcode.trim()) {
                    basicForm.setFieldError("barcode", "Barcode is required when scanning");
                    return;
                  }
                  createBasicMutation.mutate({
                    sku: values.sku || null,
                    barcode: barcodeMode === "scan" ? values.barcode.trim() : null,
                    name: values.name,
                    supplier: values.supplier,
                    imageUrl: values.imageUrl,
                    onStock: values.onStock,
                    categoryId: values.categoryId || null,
                  });
                })}
              >
                <Stack gap="sm">
                  <TextInput label="SKU" placeholder="Optional" {...basicForm.getInputProps("sku")} />
                  <TextInput label="Name" required {...basicForm.getInputProps("name")} />
                  <ProductBarcodeField
                    mode={barcodeMode}
                    onModeChange={(mode) => {
                      setBarcodeMode(mode);
                      if (mode === "auto") {
                        basicForm.setFieldValue("barcode", "");
                      }
                    }}
                    value={basicForm.values.barcode}
                    onChange={(value) => basicForm.setFieldValue("barcode", value)}
                    error={basicForm.errors.barcode as string | undefined}
                  />
                  <TextInput label="Supplier" required {...basicForm.getInputProps("supplier")} />
                  <ProductImagePicker
                    value={basicForm.values.imageUrl}
                    onChange={(value) => basicForm.setFieldValue("imageUrl", value)}
                    error={basicForm.errors.imageUrl as string | undefined}
                  />
                  <NumberInput label="Stock" min={0} required {...basicForm.getInputProps("onStock")} />
                  <Select
                    label="Category"
                    data={categoryOptions}
                    clearable
                    {...basicForm.getInputProps("categoryId")}
                  />
                  <Button type="submit" color="green" loading={createBasicMutation.isPending}>
                    Save and continue to pricing
                  </Button>
                </Stack>
              </form>
            ) : null}

            {step === 1 && createdProduct ? (
              <form
                onSubmit={pricingForm.onSubmit((values) =>
                  pricingMutation.mutate({ id: createdProduct.id, values }),
                )}
              >
                <Stack gap="sm">
                  <Text fw={600}>{createdProduct.name}</Text>
                  <Text size="sm" c="dimmed">
                    Barcode: {createdProduct.barcode}
                    {createdProduct.sku ? ` · SKU: ${createdProduct.sku}` : ""}
                  </Text>
                  <Group grow>
                    <NumberInput label="Price" min={0} decimalScale={2} required {...pricingForm.getInputProps("price")} />
                    <NumberInput label="Cost" min={0} decimalScale={2} required {...pricingForm.getInputProps("cost")} />
                  </Group>
                  <Button type="submit" color="green" loading={pricingMutation.isPending}>
                    Complete product setup
                  </Button>
                </Stack>
              </form>
            ) : null}
          </>
        )}
      </Modal>

      <Modal
        opened={pricingOpened}
        onClose={() => {
          closePricing();
          setPricingProduct(null);
        }}
        title="Add pricing"
      >
        {pricingProduct ? (
          <form
            onSubmit={pricingForm.onSubmit((values) =>
              pricingMutation.mutate({ id: pricingProduct.id, values }),
            )}
          >
            <Stack gap="sm">
              <Text fw={600}>{pricingProduct.name}</Text>
              <Text size="sm" c="dimmed">
                Barcode: {pricingProduct.barcode}
              </Text>
              <Group grow>
                <NumberInput label="Price" min={0} decimalScale={2} required {...pricingForm.getInputProps("price")} />
                <NumberInput label="Cost" min={0} decimalScale={2} required {...pricingForm.getInputProps("cost")} />
              </Group>
              <Button type="submit" color="green" loading={pricingMutation.isPending}>
                Save pricing
              </Button>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Stack>
  );
}
