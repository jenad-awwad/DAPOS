import {
  Badge,
  Card,
  Group,
  Image,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { Currency, Product } from "../lib/types";
import { formatMoney } from "../lib/format";

type Props = {
  product: Product;
  currency: Currency;
  onClick: () => void;
  compact?: boolean;
};

export function ProductCard({ product, currency, onClick, compact }: Props) {
  const lowStock =
    product.lowStockAt != null && product.onStock <= product.lowStockAt;

  return (
    <UnstyledButton onClick={onClick} w="100%">
      <Card
        withBorder
        padding={compact ? "sm" : "md"}
        radius="md"
        style={{
          cursor: product.onStock > 0 ? "pointer" : "not-allowed",
          opacity: product.onStock > 0 ? 1 : 0.55,
          transition: "transform 120ms ease, box-shadow 120ms ease",
        }}
        className="product-card"
      >
        <Card.Section>
          <Image
            src={product.imageUrl ?? undefined}
            alt={product.name}
            h={compact ? 100 : 130}
            fallbackSrc="https://placehold.co/400x300/e2e8f0/64748b?text=No+Image"
          />
        </Card.Section>
        <Stack gap={6} mt="sm">
          <Text fw={600} size="sm" lineClamp={2}>
            {product.name}
          </Text>
          <Text fw={700} c="green">
            {formatMoney(product.price, currency)}
          </Text>
          <Group justify="space-between" gap={4}>
            <Text size="xs" c="dimmed">
              {product.sku ?? product.barcode}
            </Text>
            <Badge
              size="xs"
              color={product.onStock === 0 ? "red" : lowStock ? "orange" : "gray"}
              variant="light"
            >
              {product.onStock} in stock
            </Badge>
          </Group>
        </Stack>
      </Card>
    </UnstyledButton>
  );
}
