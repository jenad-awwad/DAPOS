import {
  Badge,
  Card,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { useAuth } from "../context/AuthContext";
import { useHasPermission } from "../hooks/usePermissions";
import { fetchCategories, fetchProducts, updateProduct } from "../lib/api";
import type { Product } from "../lib/types";

export function InventoryPage() {
  const { store } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const lowStockOnly = searchParams.get("lowStock") === "1";
  const canChooseRegister = useHasPermission(["inventory.manage", "products.manage"]);
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const productsQuery = useQuery({
    queryKey: ["products", "inventory", search, categoryId, lowStockOnly],
    queryFn: () =>
      fetchProducts({
        search: search || undefined,
        categoryId: categoryId ?? undefined,
        lowStock: lowStockOnly,
      }),
  });

  const categoryOptions = useMemo(() => {
    const cats = categoriesQuery.data?.categories ?? [];
    return [
      { label: "All categories", value: "" },
      ...cats.map((c) => ({ label: c.name, value: c.id })),
    ];
  }, [categoriesQuery.data]);

  if (productsQuery.isLoading) return <Loader color="green" />;

  const products = productsQuery.data?.products ?? [];
  const onRegister = products.filter((product) => product.showOnPos).length;

  const toggleRegister = async (product: Product, showOnPos: boolean) => {
    setPendingId(product.id);
    try {
      await updateProduct(product.id, { showOnPos });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Could not update the register",
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Inventory</Title>
        <Text c="dimmed">
          Browse products and choose up to 12 items from each category for the register
        </Text>
      </div>

      <Group grow align="flex-end">
        <TextInput
          label="Search"
          placeholder="Name, SKU, barcode..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <SegmentedControl
          value={lowStockOnly ? "low" : "all"}
          onChange={(v) => {
            if (v === "low") setSearchParams({ lowStock: "1" });
            else setSearchParams({});
          }}
          data={[
            { label: "All products", value: "all" },
            { label: "Low stock", value: "low" },
          ]}
        />
      </Group>

      <SegmentedControl
        value={categoryId ?? ""}
        onChange={(v) => setCategoryId(v || null)}
        data={categoryOptions}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {products.map((product) => (
          <Stack key={product.id} gap={6}>
            <Link to={`/inventory/${product.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <ProductCard
                product={product}
                currency={store!.currency}
                onClick={() => {}}
              />
            </Link>
            {canChooseRegister ? (
              <Switch
                label="Show on register"
                checked={Boolean(product.showOnPos)}
                disabled={!product.isPriced || pendingId === product.id}
                onChange={(event) => void toggleRegister(product, event.currentTarget.checked)}
              />
            ) : null}
          </Stack>
        ))}
      </div>

      {products.length === 0 ? (
        <Card withBorder padding="xl" radius="md">
          <Text c="dimmed" ta="center">
            No products match your filters
          </Text>
        </Card>
      ) : null}

      <Group>
        <Badge variant="light" color="gray">
          {products.length} products
        </Badge>
        <Badge variant="light" color="green">
          {categoryId && !search
            ? `${onRegister} of 12 on the register`
            : `${onRegister} on the register`}
        </Badge>
      </Group>
    </Stack>
  );
}
