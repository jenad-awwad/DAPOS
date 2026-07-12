import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconSearch, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchCashiers, fetchItemSalesReport, fetchOrders } from "../lib/api";
import { exportItemSalesToExcel } from "../lib/exportItemSales";
import {
  formatDate,
  formatDateOnly,
  formatMoney,
  formatTimeOnly,
  orderStatusLabel,
  orderTypeLabel,
  paymentLabel,
} from "../lib/format";
import {
  orderPaymentState,
  orderPaymentStateColor,
  orderPaymentStateLabel,
  orderTypeOf,
} from "../lib/orderState";
import type { OrderType } from "../lib/types";

const ORDER_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "COMPLETED", label: "Completed" },
  { value: "VOIDED", label: "Voided" },
  { value: "DRAFT", label: "Draft" },
  { value: "REFUNDED", label: "Refunded" },
] as const;

const ORDER_TYPES = [
  { value: "REGULAR", label: "Regular sale" },
  { value: "PROJECT", label: "Project" },
] as const;

const PAYMENT_STATES = [
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
] as const;

function toIsoDateTime(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function statusColor(status: string) {
  switch (status) {
    case "COMPLETED":
      return "green";
    case "OPEN":
      return "blue";
    case "VOIDED":
      return "red";
    case "REFUNDED":
      return "orange";
    default:
      return "gray";
  }
}

export function OrdersPage() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("orders");

  const [orderNumber, setOrderNumber] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [paymentState, setPaymentState] = useState<"OPEN" | "CLOSED" | null>(null);
  const [cashierId, setCashierId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  const [debouncedOrderNumber] = useDebouncedValue(orderNumber.trim(), 300);
  const [debouncedItemSearch] = useDebouncedValue(itemSearch.trim(), 300);

  const staffQuery = useQuery({
    queryKey: ["cashiers"],
    queryFn: fetchCashiers,
  });

  const orderFilters = useMemo(
    () => ({
      limit: 200,
      orderNumber: debouncedOrderNumber || undefined,
      status: status ?? undefined,
      orderType: orderType ?? undefined,
      paymentOpen:
        paymentState === "OPEN"
          ? true
          : paymentState === "CLOSED"
            ? false
            : undefined,
      cashierId: cashierId ?? undefined,
      dateFrom: toIsoDateTime(dateFrom),
      dateTo: toIsoDateTime(dateTo),
    }),
    [
      debouncedOrderNumber,
      status,
      orderType,
      paymentState,
      cashierId,
      dateFrom,
      dateTo,
    ],
  );

  const itemSalesFilters = useMemo(
    () => ({
      search: debouncedItemSearch || undefined,
      cashierId: cashierId ?? undefined,
      dateFrom: toIsoDateTime(dateFrom),
      dateTo: toIsoDateTime(dateTo),
    }),
    [debouncedItemSearch, cashierId, dateFrom, dateTo],
  );

  const ordersQuery = useQuery({
    queryKey: ["orders", orderFilters],
    queryFn: () => fetchOrders(orderFilters),
    enabled: activeTab === "orders",
  });

  const itemSalesQuery = useQuery({
    queryKey: ["item-sales", itemSalesFilters],
    queryFn: () => fetchItemSalesReport(itemSalesFilters),
    enabled: activeTab === "item-sales",
  });

  const cashierOptions = useMemo(
    () =>
      (staffQuery.data?.users ?? []).map((user) => ({
        value: user.id,
        label: user.name,
      })),
    [staffQuery.data],
  );

  const hasOrderFilters =
    orderNumber.trim() !== "" ||
    status !== null ||
    orderType !== null ||
    paymentState !== null ||
    cashierId !== null ||
    dateFrom !== "" ||
    dateTo !== "";

  const hasItemFilters =
    itemSearch.trim() !== "" ||
    cashierId !== null ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearOrderFilters = () => {
    setOrderNumber("");
    setStatus(null);
    setOrderType(null);
    setPaymentState(null);
    setCashierId(null);
    setDateFrom("");
    setDateTo("");
  };

  const clearItemFilters = () => {
    setItemSearch("");
    setCashierId(null);
    setDateFrom("");
    setDateTo("");
  };

  const orders = ordersQuery.data?.orders ?? [];
  const itemSales = itemSalesQuery.data?.items ?? [];
  const itemSummary = itemSalesQuery.data?.summary;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Orders</Title>
        <Text c="dimmed">Sales history and item reports</Text>
      </div>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="orders">Orders</Tabs.Tab>
          <Tabs.Tab value="item-sales">Items sales</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="orders" pt="md">
          <Stack gap="md">
            <Card withBorder padding="md" radius="md">
              <Stack gap="md">
                <TextInput
                  label="Order number"
                  placeholder="Search by order number..."
                  leftSection={<IconSearch size={16} />}
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.currentTarget.value)}
                />

                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="From"
                      type="datetime-local"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.currentTarget.value)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="To"
                      type="datetime-local"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.currentTarget.value)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                    <Select
                      label="Order status"
                      placeholder="All statuses"
                      clearable
                      data={[...ORDER_STATUSES]}
                      value={status}
                      onChange={setStatus}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                    <Select
                      label="Type"
                      placeholder="All types"
                      clearable
                      data={[...ORDER_TYPES]}
                      value={orderType}
                      onChange={(value) => setOrderType((value as OrderType | null) ?? null)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                    <Select
                      label="Payment status"
                      placeholder="All payment statuses"
                      clearable
                      data={[...PAYMENT_STATES]}
                      value={paymentState}
                      onChange={(value) =>
                        setPaymentState((value as "OPEN" | "CLOSED" | null) ?? null)
                      }
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                    <Select
                      label="Cashier"
                      placeholder="All cashiers"
                      clearable
                      searchable
                      data={cashierOptions}
                      value={cashierId}
                      onChange={setCashierId}
                    />
                  </Grid.Col>
                </Grid>

                {hasOrderFilters ? (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {ordersQuery.isFetching
                        ? "Updating results..."
                        : `${orders.length} order(s) found`}
                    </Text>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconX size={14} />}
                      onClick={clearOrderFilters}
                    >
                      Clear filters
                    </Button>
                  </Group>
                ) : null}
              </Stack>
            </Card>

            {ordersQuery.isLoading ? (
              <Loader color="green" />
            ) : (
              <Card withBorder padding={0} radius="md">
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Order #</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Payment status</Table.Th>
                      <Table.Th>Cashier</Table.Th>
                      <Table.Th>Method</Table.Th>
                      <Table.Th>Order status</Table.Th>
                      <Table.Th ta="right">Total</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {orders.map((order) => {
                      const paymentStateValue = orderPaymentState(order);
                      const typeValue = orderTypeOf(order);

                      return (
                      <Table.Tr
                        key={order.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <Table.Td>
                          <Text fw={600}>{order.orderNumber}</Text>
                          {order.projectTitle ? (
                            <Text size="xs" c="dimmed">
                              {order.projectTitle}
                            </Text>
                          ) : null}
                        </Table.Td>
                        <Table.Td>
                          {formatDate(order.completedAt ?? order.createdAt)}
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={typeValue === "PROJECT" ? "grape" : "gray"}
                          >
                            {orderTypeLabel(typeValue)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={orderPaymentStateColor(paymentStateValue)}
                          >
                            {orderPaymentStateLabel(paymentStateValue)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{order.cashier?.name ?? "—"}</Table.Td>
                        <Table.Td>
                          {order.payments?.[0]
                            ? paymentLabel(order.payments[0].method)
                            : "—"}
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={statusColor(order.status)}>
                            {orderStatusLabel(order.status)}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={600}>
                            {formatMoney(order.total, store!.currency)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
                {orders.length === 0 ? (
                  <Text c="dimmed" ta="center" py="xl">
                    No orders match your filters
                  </Text>
                ) : null}
              </Card>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="item-sales" pt="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Text fw={600} size="lg">
                Items sales report
              </Text>
              <Button
                variant="light"
                color="green"
                leftSection={<IconDownload size={16} />}
                disabled={itemSales.length === 0}
                onClick={() => {
                  const stamp = new Date().toISOString().slice(0, 10);
                  exportItemSalesToExcel(itemSales, `items-sales-${stamp}.xlsx`);
                  notifications.show({
                    color: "green",
                    message: "Excel report downloaded",
                  });
                }}
              >
                Export Excel
              </Button>
            </Group>

            <Card withBorder padding="md" radius="md">
              <Stack gap="md">
                <TextInput
                  label="Item name or SKU"
                  placeholder="Search items..."
                  leftSection={<IconSearch size={16} />}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.currentTarget.value)}
                />

                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="From"
                      type="datetime-local"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.currentTarget.value)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="To"
                      type="datetime-local"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.currentTarget.value)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label="Cashier"
                      placeholder="All cashiers"
                      clearable
                      searchable
                      data={cashierOptions}
                      value={cashierId}
                      onChange={setCashierId}
                    />
                  </Grid.Col>
                </Grid>

                {hasItemFilters ? (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {itemSalesQuery.isFetching
                        ? "Updating results..."
                        : `${itemSales.length} line(s) in report`}
                    </Text>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconX size={14} />}
                      onClick={clearItemFilters}
                    >
                      Clear filters
                    </Button>
                  </Group>
                ) : null}
              </Stack>
            </Card>

            {itemSummary ? (
              <Group grow>
                <Card withBorder padding="md" radius="md">
                  <Text size="sm" c="dimmed">
                    Total units sold
                  </Text>
                  <Text fw={700} size="xl">
                    {itemSummary.quantitySold}
                  </Text>
                </Card>
                <Card withBorder padding="md" radius="md">
                  <Text size="sm" c="dimmed">
                    Total revenue
                  </Text>
                  <Text fw={700} size="xl" c="green">
                    {formatMoney(itemSummary.totalRevenue, store!.currency)}
                  </Text>
                </Card>
                <Card withBorder padding="md" radius="md">
                  <Text size="sm" c="dimmed">
                    Total cost
                  </Text>
                  <Text fw={700} size="xl">
                    {formatMoney(itemSummary.totalCost, store!.currency)}
                  </Text>
                </Card>
              </Group>
            ) : null}

            {itemSalesQuery.isLoading ? (
              <Loader color="green" />
            ) : (
              <Card withBorder padding={0} radius="md">
                <ScrollArea.Autosize mah={560} offsetScrollbars type="auto">
                  <Table
                    striped
                    highlightOnHover
                    styles={{ th: { fontWeight: 400 }, td: { fontWeight: 400 } }}
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Time</Table.Th>
                        <Table.Th>Order #</Table.Th>
                        <Table.Th>Item</Table.Th>
                        <Table.Th>SKU</Table.Th>
                        <Table.Th>Barcode</Table.Th>
                        <Table.Th>Category</Table.Th>
                        <Table.Th ta="center">Qty</Table.Th>
                        <Table.Th ta="right">Selling price</Table.Th>
                        <Table.Th ta="right">Cost</Table.Th>
                        <Table.Th ta="right">Line total</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {itemSales.map((row) => (
                        <Table.Tr
                          key={row.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => navigate(`/orders/${row.orderId}`)}
                        >
                          <Table.Td>{formatDateOnly(row.soldAt)}</Table.Td>
                          <Table.Td>{formatTimeOnly(row.soldAt)}</Table.Td>
                          <Table.Td>{row.orderNumber}</Table.Td>
                          <Table.Td>{row.productName}</Table.Td>
                          <Table.Td>{row.sku ?? "—"}</Table.Td>
                          <Table.Td>{row.barcode}</Table.Td>
                          <Table.Td>{row.categoryName ?? "—"}</Table.Td>
                          <Table.Td ta="center">{row.quantity}</Table.Td>
                          <Table.Td ta="right">
                            {formatMoney(row.unitPrice, store!.currency)}
                          </Table.Td>
                          <Table.Td ta="right">
                            {row.cost != null
                              ? formatMoney(row.cost, store!.currency)
                              : "—"}
                          </Table.Td>
                          <Table.Td ta="right">
                            {formatMoney(row.lineTotal, store!.currency)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
                {itemSales.length === 0 ? (
                  <Text c="dimmed" ta="center" py="xl">
                    No item sales match your filters
                  </Text>
                ) : null}
              </Card>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
