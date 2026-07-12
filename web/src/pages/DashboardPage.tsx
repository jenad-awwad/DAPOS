import {
  Badge,
  Card,
  Grid,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconCash,
  IconPackage,
  IconReceipt,
  IconTrendingUp,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchOrders, fetchProducts } from "../lib/api";
import { formatDate, formatMoney } from "../lib/format";

export function DashboardPage() {
  const { store } = useAuth();

  const ordersQuery = useQuery({
    queryKey: ["orders", 100],
    queryFn: () => fetchOrders({ limit: 100 }),
  });

  const productsQuery = useQuery({
    queryKey: ["products", "lowStock"],
    queryFn: () => fetchProducts({ lowStock: true }),
  });

  if (ordersQuery.isLoading || productsQuery.isLoading) {
    return <Loader color="green" />;
  }

  const orders = ordersQuery.data?.orders ?? [];
  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) => o.completedAt && new Date(o.completedAt).toDateString() === today,
  );
  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
  const lowStock = productsQuery.data?.products ?? [];

  const stats = [
    {
      label: "Today's sales",
      value: formatMoney(todayRevenue, store!.currency),
      icon: IconCash,
      color: "green",
    },
    {
      label: "Orders today",
      value: String(todayOrders.length),
      icon: IconReceipt,
      color: "blue",
    },
    {
      label: "Total orders",
      value: String(orders.length),
      icon: IconTrendingUp,
      color: "violet",
    },
    {
      label: "Low stock items",
      value: String(lowStock.length),
      icon: IconPackage,
      color: "orange",
    },
  ];

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed">Overview for {store?.name}</Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {stats.map((stat) => (
          <Card key={stat.label} withBorder padding="lg" radius="md">
            <Group justify="space-between" mb="sm">
              <Text size="sm" c="dimmed" fw={500}>
                {stat.label}
              </Text>
              <stat.icon size={20} color={`var(--mantine-color-${stat.color}-6)`} />
            </Group>
            <Text size="xl" fw={700}>
              {stat.value}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between" mb="md">
              <Title order={4}>Recent orders</Title>
              <Text component={Link} to="/orders" size="sm" c="green">
                View all
              </Text>
            </Group>
            <Stack gap="sm">
              {orders.slice(0, 6).map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Group justify="space-between" p="xs" className="hover-row">
                    <div>
                      <Text fw={600} size="sm">
                        {order.orderNumber}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDate(order.completedAt ?? order.createdAt)}
                      </Text>
                    </div>
                    <Group gap="xs">
                      <Badge variant="light" color="green">
                        {order.status}
                      </Badge>
                      <Text fw={600}>
                        {formatMoney(order.total, store!.currency)}
                      </Text>
                    </Group>
                  </Group>
                </Link>
              ))}
              {orders.length === 0 ? (
                <Text c="dimmed">No orders yet. Start selling from POS.</Text>
              ) : null}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between" mb="md">
              <Title order={4}>Low stock alerts</Title>
              <Text component={Link} to="/inventory?lowStock=1" size="sm" c="green">
                View all
              </Text>
            </Group>
            <Stack gap="sm">
              {lowStock.slice(0, 6).map((product) => (
                <Link
                  key={product.id}
                  to={`/inventory/${product.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>
                      {product.name}
                    </Text>
                    <Badge color="orange" variant="light">
                      {product.onStock} left
                    </Badge>
                  </Group>
                </Link>
              ))}
              {lowStock.length === 0 ? (
                <Text c="dimmed">All products are well stocked.</Text>
              ) : null}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
