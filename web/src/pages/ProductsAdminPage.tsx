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
  Textarea,
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
import { useHasPermission } from "../hooks/usePermissions";
import {
  assignPricingRequest,
  createProduct,
  createVendor,
  deleteProduct,
  fetchCategories,
  fetchPricingRequests,
  fetchProducts,
  fetchVendorOptions,
  setProductPricing,
  updateProduct,
} from "../lib/api";
import { formatDate, formatMoney, toMoney } from "../lib/format";
import type { Product } from "../lib/types";

type BasicFormValues = {
  sku: string;
  name: string;
  description: string;
  vendorId: string;
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
  { value: "NEEDS_PRICING", label: "Pending pricing" },
  { value: "PRICED", label: "Published" },
] as const;

const emptyBasicForm: BasicFormValues = {
  sku: "",
  name: "",
  description: "",
  vendorId: "",
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
  const canEditDetails = useHasPermission(["products.details", "products.manage"]);
  const canSetPrice = useHasPermission(["products.price", "products.manage"]);
  const canManageProducts = useHasPermission("products.manage");
  const canAddVendor = useHasPermission("vendors.manage");
  const canViewProducts = useHasPermission([
    "products.view",
    "products.details",
    "products.price",
    "products.manage",
  ]);
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [pricingOpened, { open: openPricing, close: closePricing }] = useDisclosure(false);
  const [step, setStep] = useState(0);
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("auto");
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [vendorTarget, setVendorTarget] = useState<"create" | "edit">("create");

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
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "options"],
    queryFn: fetchVendorOptions,
    enabled: canEditDetails,
  });

  const pricingRequestsQuery = useQuery({
    queryKey: ["pricing-requests"],
    queryFn: fetchPricingRequests,
    enabled: canSetPrice,
  });

  const vendorSelectData = useMemo(
    () =>
      (vendorsQuery.data?.vendors ?? []).map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
      })),
    [vendorsQuery.data],
  );

  const basicForm = useForm<BasicFormValues>({
    initialValues: emptyBasicForm,
    validate: {
      name: (v) => (!v.trim() ? "Name is required" : null),
      vendorId: (v) => (!v ? "Supplier is required" : null),
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
    validate: {
      vendorId: (value) => (!value ? "Supplier is required" : null),
    },
  });

  const createVendorMutation = useMutation({
    mutationFn: () => createVendor({ name: newVendorName.trim() }),
    onSuccess: ({ vendor }) => {
      queryClient.invalidateQueries({ queryKey: ["vendors", "options"] });
      if (vendorTarget === "edit") editForm.setFieldValue("vendorId", vendor.id);
      else basicForm.setFieldValue("vendorId", vendor.id);
      setNewVendorName("");
      setVendorModalOpen(false);
      notifications.show({ color: "green", message: "Vendor added" });
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const createBasicMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: ({ product }) => {
      invalidateProducts();
      queryClient.invalidateQueries({ queryKey: ["pricing-requests"] });
      if (canSetPrice) {
        setCreatedProduct(product);
        setStep(1);
        notifications.show({
          color: "green",
          message: `Item saved · Barcode ${product.barcode}. Set the price to publish it.`,
        });
        return;
      }
      notifications.show({
        color: "green",
        message: `${product.name} is pending pricing. A pricing request was sent.`,
      });
      close();
      resetCreateFlow();
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
      queryClient.invalidateQueries({ queryKey: ["pricing-requests"] });
      notifications.show({ color: "green", message: "Price saved. Product is published." });
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
        ...(canEditDetails
          ? {
              sku: values.sku || null,
              name: values.name,
              description: values.description || null,
              vendorId: values.vendorId,
              imageUrl: values.imageUrl,
              onStock: values.onStock,
              lowStockAt: values.lowStockAt === "" ? null : values.lowStockAt,
              categoryId: values.categoryId || null,
            }
          : {}),
        // Pricing is only sent once a positive price is entered. A product that is
        // still "pending pricing" has price 0, which the server rejects as a price.
        ...(canSetPrice && values.price > 0 ? { price: values.price, cost: values.cost } : {}),
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

  const assignMutation = useMutation({
    mutationFn: ({ id, assignedToId }: { id: string; assignedToId: string | null }) =>
      assignPricingRequest(id, assignedToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing-requests"] });
      notifications.show({ color: "green", message: "Pricing request assigned" });
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
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

  if (!canViewProducts) return <Navigate to="/" replace />;
  if (productsQuery.isLoading) return <Loader color="green" />;

  const categoryOptions = (categoriesQuery.data?.categories ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

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
      description: product.description ?? "",
      vendorId: product.vendorId ?? product.vendor?.id ?? "",
      imageUrl: product.imageUrl,
      onStock: product.onStock,
      categoryId: product.categoryId ?? "",
      barcode: product.barcode,
      price: toMoney(product.price),
      cost: toMoney(product.cost),
      lowStockAt: product.lowStockAt ?? "",
    });
    open();
  };

  const openPricingOnly = (product: Product) => {
    setPricingProduct(product);
    pricingForm.setValues({
      price: toMoney(product.price) > 0 ? toMoney(product.price) : 0,
      cost: toMoney(product.cost),
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
          <Title order={2}>Products</Title>
          <Text c="dimmed">
            Item details and pricing are separate. A new item stays pending until someone with pricing permission publishes a price.
          </Text>
        </div>
        {canEditDetails ? (
          <Button color="green" leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Add product
          </Button>
        ) : null}
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

      {canSetPrice ? (
        <Card withBorder padding="md" radius="md">
          <Title order={4} mb="sm">
            Pricing requests
          </Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Product</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Submitted</Table.Th>
                <Table.Th>Assigned</Table.Th>
                <Table.Th>Completed</Table.Th>
                <Table.Th ta="right">Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(pricingRequestsQuery.data?.requests ?? []).map((request) => (
                <Table.Tr key={request.id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {request.product.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {request.product.barcode} · requested by {request.requestedBy.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={request.status === "PENDING" ? "orange" : "green"} variant="light">
                      {request.status === "PENDING" ? "Pending pricing" : "Published"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatDate(request.submittedAt)}</Table.Td>
                  <Table.Td>
                    {request.status === "PENDING" ? (
                      <Select
                        size="xs"
                        placeholder="Unassigned"
                        clearable
                        data={(pricingRequestsQuery.data?.assignees ?? []).map((user) => ({
                          value: user.id,
                          label: user.name,
                        }))}
                        value={request.assignedTo?.id ?? null}
                        onChange={(value) =>
                          assignMutation.mutate({
                            id: request.id,
                            assignedToId: value,
                          })
                        }
                      />
                    ) : (
                      request.assignedTo?.name ?? request.completedBy?.name ?? "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    {request.completedAt
                      ? `${formatDate(request.completedAt)}${request.completedBy ? ` · ${request.completedBy.name}` : ""}`
                      : "—"}
                  </Table.Td>
                  <Table.Td ta="right">
                    {request.status === "PENDING" ? (
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        onClick={() => openPricingOnly(request.product)}
                      >
                        Set price
                      </Button>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Done
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {(pricingRequestsQuery.data?.requests.length ?? 0) === 0 ? (
            <Text c="dimmed" size="sm" mt="sm">
              No pricing requests yet.
            </Text>
          ) : null}
        </Card>
      ) : null}

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
              <Table.Td>{product.vendor?.name ?? product.supplier}</Table.Td>
              <Table.Td>
                {product.isPriced
                  ? formatMoney(toMoney(product.price), store!.currency)
                  : "—"}
              </Table.Td>
              <Table.Td>{product.onStock}</Table.Td>
              <Table.Td>
                <Badge
                  color={
                    product.isActive === false ? "red" : product.isPriced ? "green" : "orange"
                  }
                  variant="light"
                >
                  {product.isActive === false
                    ? "Inactive"
                    : product.isPriced
                      ? "Published"
                      : "Pending pricing"}
                </Badge>
              </Table.Td>
              <Table.Td ta="right">
                {canSetPrice || canEditDetails || canManageProducts ? (
                <Group gap={4} justify="flex-end">
                  {canSetPrice && !product.isPriced ? (
                    <Button
                      size="xs"
                      variant="light"
                      color="orange"
                      onClick={() => openPricingOnly(product)}
                    >
                      Set price
                    </Button>
                  ) : null}
                  {canEditDetails ? (
                    <ActionIcon variant="light" onClick={() => openEdit(product)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  ) : null}
                  {canManageProducts && product.isActive !== false ? (
                    <ActionIcon
                      color="red"
                      variant="light"
                      onClick={() => deleteMutation.mutate(product.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  ) : null}
                </Group>
                ) : (
                  <Text size="xs" c="dimmed">
                    View only
                  </Text>
                )}
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
              <Textarea label="Description" {...editForm.getInputProps("description")} />
              <Select
                label="Supplier"
                placeholder="Search vendors"
                searchable
                required
                data={vendorSelectData}
                nothingFoundMessage="No matching vendor"
                value={editForm.values.vendorId || null}
                onChange={(value) => editForm.setFieldValue("vendorId", value ?? "")}
                error={editForm.errors.vendorId}
              />
              {editForm.values.vendorId ? null : editing?.supplier ? (
                <Text size="xs" c="dimmed">
                  Current supplier text: {editing.supplier}. Choose a vendor to link this product.
                </Text>
              ) : null}
              {canAddVendor ? (
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => {
                    setVendorTarget("edit");
                    setVendorModalOpen(true);
                  }}
                >
                  Add vendor
                </Button>
              ) : null}
              <ProductImagePicker
                value={editForm.values.imageUrl}
                onChange={(value) => editForm.setFieldValue("imageUrl", value)}
                error={editForm.errors.imageUrl as string | undefined}
              />
              {canSetPrice ? (
                <Group grow>
                  <NumberInput label="Price" min={0} decimalScale={2} required {...editForm.getInputProps("price")} />
                  <NumberInput label="Cost" min={0} decimalScale={2} required {...editForm.getInputProps("cost")} />
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  Pricing is handled by a user with the Set product prices permission.
                </Text>
              )}
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
                    description: values.description || null,
                    vendorId: values.vendorId,
                    imageUrl: values.imageUrl,
                    onStock: values.onStock,
                    categoryId: values.categoryId || null,
                  });
                })}
              >
                <Stack gap="sm">
                  <TextInput label="SKU" placeholder="Optional" {...basicForm.getInputProps("sku")} />
                  <TextInput label="Name" required {...basicForm.getInputProps("name")} />
                  <Textarea label="Description" {...basicForm.getInputProps("description")} />
                  <Select
                    label="Supplier"
                    placeholder="Search vendors"
                    searchable
                    required
                    data={vendorSelectData}
                    nothingFoundMessage="No matching vendor"
                    value={basicForm.values.vendorId || null}
                    onChange={(value) => basicForm.setFieldValue("vendorId", value ?? "")}
                    error={basicForm.errors.vendorId}
                  />
                  {canAddVendor ? (
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      onClick={() => {
                        setVendorTarget("create");
                        setVendorModalOpen(true);
                      }}
                    >
                      Add vendor
                    </Button>
                  ) : (
                    <Text size="xs" c="dimmed">
                      If the supplier is missing, someone with vendor permission needs to add them.
                    </Text>
                  )}
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
                    {canSetPrice ? "Save and continue to pricing" : "Submit for pricing"}
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
                    Publish product
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
        title="Set price and publish"
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
                Publish product
              </Button>
            </Stack>
          </form>
        ) : null}
      </Modal>

      <Modal
        opened={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        title="Add vendor"
      >
        <Stack gap="sm">
          <TextInput
            label="Vendor name"
            required
            value={newVendorName}
            onChange={(event) => setNewVendorName(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setVendorModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="green"
              loading={createVendorMutation.isPending}
              disabled={!newVendorName.trim()}
              onClick={() => createVendorMutation.mutate()}
            >
              Save vendor
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
