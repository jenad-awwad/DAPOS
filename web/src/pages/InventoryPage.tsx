import {
  Badge,
  Card,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { useAuth } from "../context/AuthContext";
import { fetchCategories, fetchProducts } from "../lib/api";

export function InventoryPage() {
  const { store } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const lowStockOnly = searchParams.get("lowStock") === "1";

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

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Inventory</Title>
        <Text c="dimmed">Browse products, stock levels, and suppliers</Text>
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
          <Link
            key={product.id}
            to={`/inventory/${product.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <ProductCard
              product={product}
              currency={store!.currency}
              onClick={() => {}}
            />
          </Link>
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
      </Group>
    </Stack>
  );
}
