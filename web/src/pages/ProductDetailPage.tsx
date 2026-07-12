import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Image,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconShoppingCart } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { fetchProduct } from "../lib/api";
import { formatMoney } from "../lib/format";

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { store } = useAuth();
  const { addProduct } = useCart();

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id!),
    enabled: !!id,
  });

  if (isLoading) return <Loader color="green" />;
  if (error || !data?.product) {
    return (
      <Stack>
        <Text c="red">Product not found</Text>
        <Button component={Link} to="/inventory" variant="light">
          Back to inventory
        </Button>
      </Stack>
    );
  }

  const product = data.product;
  const lowStock =
    product.lowStockAt != null && product.onStock <= product.lowStockAt;

  return (
    <Stack gap="lg">
      <Button
        component={Link}
        to="/inventory"
        variant="subtle"
        color="gray"
        leftSection={<IconArrowLeft size={16} />}
        w="fit-content"
        px={0}
      >
        Back to inventory
      </Button>

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder padding={0} radius="md" style={{ overflow: "hidden" }}>
            <Image
              src={product.imageUrl ?? undefined}
              alt={product.name}
              h={320}
              fallbackSrc="https://placehold.co/600x400/e2e8f0/64748b?text=No+Image"
            />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="md">
            <div>
              <Title order={2}>{product.name}</Title>
              <Text c="dimmed">{product.sku ?? product.barcode}</Text>
            </div>

            {!product.isPriced ? (
              <Badge color="orange" variant="light" size="lg">
                Pricing pending — not available for sale
              </Badge>
            ) : (
              <Text size="xl" fw={700} c="green">
                {formatMoney(product.price, store!.currency)}
              </Text>
            )}

            <Group gap="sm">
              <Badge
                color={product.onStock === 0 ? "red" : lowStock ? "orange" : "green"}
                variant="light"
                size="lg"
              >
                {product.onStock} in stock
              </Badge>
              {product.category ? (
                <Badge variant="light" color="gray">
                  {product.category.name}
                </Badge>
              ) : null}
            </Group>

            {product.description ? (
              <Text>{product.description}</Text>
            ) : null}

            <Stack gap={4}>
              {product.barcode ? (
                <Text size="sm">
                  <Text span fw={600}>
                    Barcode:{" "}
                  </Text>
                  {product.barcode}
                </Text>
              ) : null}
              {product.supplier ? (
                <Text size="sm">
                  <Text span fw={600}>
                    Supplier:{" "}
                  </Text>
                  {product.supplier}
                </Text>
              ) : null}
              {product.cost != null ? (
                <Text size="sm">
                  <Text span fw={600}>
                    Cost:{" "}
                  </Text>
                  {formatMoney(product.cost, store!.currency)}
                </Text>
              ) : null}
              {product.lowStockAt != null ? (
                <Text size="sm">
                  <Text span fw={600}>
                    Low stock threshold:{" "}
                  </Text>
                  {product.lowStockAt}
                </Text>
              ) : null}
            </Stack>

            <Button
              color="green"
              leftSection={<IconShoppingCart size={18} />}
              disabled={product.onStock < 1 || !product.isPriced}
              onClick={() => addProduct(product)}
              w="fit-content"
            >
              {product.isPriced ? "Add to cart" : "Pricing required"}
            </Button>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
