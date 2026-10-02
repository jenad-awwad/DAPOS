import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconCalendar,
  IconCash,
  IconPackage,
  IconReceipt,
  IconTrendingUp,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  fetchCalendarEvents,
  fetchCashiers,
  fetchItemSalesReport,
  fetchOrders,
  fetchProducts,
} from "../lib/api";
import { formatDate, formatMoney, formatTimeOnly } from "../lib/format";
import {
  buildProjectScheduleMap,
  calculateMonthlyProjectBreakdown,
  calculateProjectPeriodMetrics,
} from "../lib/projectMonthMetrics";
import { calculateProductRevenue, calculateSalesRevenue } from "../lib/salesRevenue";
import { orderPaymentState } from "../lib/orderState";
import type { CalendarEvent, Order, OrderType } from "../lib/types";

type DatePreset = "today" | "week" | "month" | "all" | "custom";

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


function presetRange(preset: DatePreset): { from?: string; to?: string } {
  if (preset === "all" || preset === "custom") return {};

  const now = new Date();

  if (preset === "today") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: from.toISOString(), to: end.toISOString() };
  }

  if (preset === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: end.toISOString() };
}

function presetLabel(preset: DatePreset): string {
  const labels: Record<DatePreset, string> = {
    today: "Today",
    week: "Last 7 days",
    month: "This month",
    all: "All time",
    custom: "Custom range",
  };
  return labels[preset];
}

function nextTwoDaysRange(): { from: string; to: string } {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 2);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function isProjectCalendarEvent(event: CalendarEvent): boolean {
  return (
    Boolean(event.orderId) ||
    event.type === "SCHEDULED_ORDER" ||
    event.type === "INSTALLATION" ||
    event.type === "DELIVERY"
  );
}

function isActivityCalendarEvent(event: CalendarEvent): boolean {
  return event.type === "ACTIVITY";
}

function isUpcomingOpenEvent(event: CalendarEvent, from: string, to: string): boolean {
  if (event.status !== "OPEN") return false;
  const startsAt = new Date(event.startsAt).getTime();
  return startsAt >= new Date(from).getTime() && startsAt <= new Date(to).getTime();
}

function isCountableSale(order: Order): boolean {
  return order.status !== "VOIDED" && order.status !== "REFUNDED";
}

export function DashboardPage() {
  const { store } = useAuth();
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cashierId, setCashierId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [paymentState, setPaymentState] = useState<"OPEN" | "CLOSED" | null>(null);

  const staffQuery = useQuery({
    queryKey: ["cashiers"],
    queryFn: fetchCashiers,
  });

  const reportFilters = useMemo(() => {
    const preset = datePreset === "custom" ? {} : presetRange(datePreset);
    return {
      limit: 500,
      dateFrom:
        datePreset === "custom" ? toIsoDateTime(dateFrom) : preset.from,
      dateTo: datePreset === "custom" ? toIsoDateTime(dateTo) : preset.to,
      cashierId: cashierId ?? undefined,
      orderType: orderType ?? undefined,
      paymentOpen:
        paymentState === "OPEN"
          ? true
          : paymentState === "CLOSED"
            ? false
            : undefined,
    };
  }, [datePreset, dateFrom, dateTo, cashierId, orderType, paymentState]);

  const ordersQuery = useQuery({
    queryKey: ["dashboard-orders", reportFilters],
    queryFn: () => fetchOrders(reportFilters),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const revenueOrdersFilters = useMemo(
    () => ({
      limit: 500,
      cashierId: cashierId ?? undefined,
      orderType: orderType ?? undefined,
    }),
    [cashierId, orderType],
  );

  const revenueOrdersQuery = useQuery({
    queryKey: ["dashboard-revenue-orders", revenueOrdersFilters],
    queryFn: () => fetchOrders(revenueOrdersFilters),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const itemSalesQuery = useQuery({
    queryKey: ["dashboard-item-sales", reportFilters],
    queryFn: () =>
      fetchItemSalesReport({
        dateFrom: reportFilters.dateFrom,
        dateTo: reportFilters.dateTo,
        cashierId: reportFilters.cashierId,
      }),
  });

  const productsQuery = useQuery({
    queryKey: ["products", "lowStock"],
    queryFn: () => fetchProducts({ lowStock: true }),
  });

  const allProjectsQuery = useQuery({
    queryKey: ["dashboard-all-projects"],
    queryFn: () => fetchOrders({ orderType: "PROJECT", limit: 500 }),
  });

  const allCalendarQuery = useQuery({
    queryKey: ["dashboard-all-calendar"],
    queryFn: () => fetchCalendarEvents(),
  });

  const upcomingRange = useMemo(() => nextTwoDaysRange(), []);

  const upcomingCalendarQuery = useQuery({
    queryKey: ["dashboard-upcoming-calendar", upcomingRange],
    queryFn: () =>
      fetchCalendarEvents({
        from: upcomingRange.from,
        to: upcomingRange.to,
      }),
  });

  const cashierOptions = useMemo(
    () =>
      (staffQuery.data?.users ?? []).map((user) => ({
        value: user.id,
        label: user.name,
      })),
    [staffQuery.data],
  );

  const hasFilters =
    datePreset !== "today" ||
    cashierId !== null ||
    orderType !== null ||
    paymentState !== null ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setDatePreset("today");
    setDateFrom("");
    setDateTo("");
    setCashierId(null);
    setOrderType(null);
    setPaymentState(null);
  };

  if (
    ordersQuery.isLoading ||
    revenueOrdersQuery.isLoading ||
    itemSalesQuery.isLoading ||
    productsQuery.isLoading ||
    allProjectsQuery.isLoading ||
    allCalendarQuery.isLoading ||
    upcomingCalendarQuery.isLoading
  ) {
    return <Loader color="green" />;
  }

  const orders = ordersQuery.data?.orders ?? [];
  const revenueOrders = revenueOrdersQuery.data?.orders ?? [];
  const itemSummary = itemSalesQuery.data?.summary;
  const lowStock = productsQuery.data?.products ?? [];
  const allProjects = allProjectsQuery.data?.orders ?? [];
  const allCalendarEvents = allCalendarQuery.data?.events ?? [];
  const upcomingCalendarEvents = upcomingCalendarQuery.data?.events ?? [];

  const allActivities = allCalendarEvents.filter(isActivityCalendarEvent);
  const upcomingProjects = upcomingCalendarEvents.filter(
    (event) =>
      isProjectCalendarEvent(event) &&
      isUpcomingOpenEvent(event, upcomingRange.from, upcomingRange.to),
  );
  const upcomingActivities = upcomingCalendarEvents.filter(
    (event) =>
      isActivityCalendarEvent(event) &&
      isUpcomingOpenEvent(event, upcomingRange.from, upcomingRange.to),
  );

  const saleOrders = orders.filter(isCountableSale);
  const salesRevenue = calculateSalesRevenue(
    revenueOrders,
    reportFilters.dateFrom,
    reportFilters.dateTo,
  );
  const revenue = salesRevenue.total;
  const productRevenue = calculateProductRevenue(
    revenueOrders,
    reportFilters.dateFrom,
    reportFilters.dateTo,
  );
  const completedOrders = orders.filter((order) => order.status === "COMPLETED");
  const openPayments = orders.filter(
    (order) => orderPaymentState(order) === "OPEN",
  ).length;
  const uniqueCustomers = new Set(
    saleOrders.map((order) => order.customer?.id).filter(Boolean),
  ).size;
  const itemProfit =
    (itemSummary?.totalRevenue ?? 0) - (itemSummary?.totalCost ?? 0);

  const salesStats = [
    {
      label: "Sales revenue",
      value: formatMoney(revenue, store!.currency),
      hint: `Invoices ${formatMoney(salesRevenue.invoiceTotal, store!.currency)} + project payments ${formatMoney(salesRevenue.projectPayments, store!.currency)}`,
      icon: IconCash,
      color: "green",
    },
    {
      label: "Orders",
      value: String(orders.length),
      icon: IconReceipt,
      color: "blue",
    },
    {
      label: "Completed",
      value: String(completedOrders.length),
      icon: IconTrendingUp,
      color: "violet",
    },
    {
      label: "Open payments",
      value: String(openPayments),
      icon: IconCash,
      color: "cyan",
    },
  ];

  const productStats = [
    {
      label: "Units sold",
      value: String(itemSummary?.quantitySold ?? 0),
      icon: IconPackage,
      color: "orange",
    },
    {
      label: "Product revenue",
      value: formatMoney(productRevenue, store!.currency),
      hint: "Regular completed invoices only",
      icon: IconTrendingUp,
      color: "green",
    },
    {
      label: "Product cost",
      value: formatMoney(itemSummary?.totalCost ?? 0, store!.currency),
      icon: IconPackage,
      color: "gray",
    },
    {
      label: "Product margin",
      value: formatMoney(itemProfit, store!.currency),
      icon: IconCash,
      color: itemProfit >= 0 ? "teal" : "red",
    },
  ];

  const customerStats = [
    {
      label: "Customers with orders",
      value: String(uniqueCustomers),
      icon: IconUsers,
      color: "indigo",
    },
    {
      label: "Low stock items",
      value: String(lowStock.length),
      icon: IconPackage,
      color: "orange",
    },
  ];

  const projectScheduleMap = buildProjectScheduleMap(allCalendarEvents);

  const projectPeriodMetrics = calculateProjectPeriodMetrics(
    allProjects,
    projectScheduleMap,
    reportFilters.dateFrom,
    reportFilters.dateTo,
  );

  const monthlyProjectRows = calculateMonthlyProjectBreakdown(
    allProjects,
    projectScheduleMap,
    6,
  );

  const projectCalendarStats = [
    {
      label: "Payments received",
      value: formatMoney(projectPeriodMetrics.totalPayments, store!.currency),
      hint: "All payments on projects scheduled in this period",
      icon: IconCash,
      color: "green",
    },
    {
      label: "Total due",
      value: formatMoney(projectPeriodMetrics.totalDue, store!.currency),
      hint: "Open projects scheduled in this period",
      icon: IconCash,
      color: "orange",
    },
    {
      label: "Open projects",
      value: String(projectPeriodMetrics.openProjects),
      hint: `${projectPeriodMetrics.scheduledProjects} scheduled in period`,
      icon: IconReceipt,
      color: "blue",
    },
    {
      label: "Closed projects",
      value: String(projectPeriodMetrics.closedProjects),
      icon: IconTrendingUp,
      color: "violet",
    },
    {
      label: "All activities",
      value: String(allActivities.length),
      icon: IconCalendar,
      color: "teal",
    },
    {
      label: "Upcoming (2 days)",
      value: String(upcomingProjects.length + upcomingActivities.length),
      icon: IconCalendar,
      color: "cyan",
    },
  ];

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed">Overview for {store?.name}</Text>
      </div>

      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text fw={600} mb={4}>
                Report filters
              </Text>
              <Text size="sm" c="dimmed">
                Summary for {presetLabel(datePreset).toLowerCase()}
              </Text>
            </div>
            {hasFilters ? (
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconX size={14} />}
                onClick={clearFilters}
              >
                Reset filters
              </Button>
            ) : null}
          </Group>

          <SegmentedControl
            value={datePreset}
            onChange={(value) => setDatePreset(value as DatePreset)}
            data={[
              { label: "Today", value: "today" },
              { label: "7 days", value: "week" },
              { label: "This month", value: "month" },
              { label: "All time", value: "all" },
              { label: "Custom", value: "custom" },
            ]}
          />

          {datePreset === "custom" ? (
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
            </Grid>
          ) : null}

          <Grid>
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
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Select
                label="Order type"
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
          </Grid>

          <Text size="sm" c="dimmed">
            {ordersQuery.isFetching || itemSalesQuery.isFetching
              ? "Updating report..."
              : `${orders.length} order(s) in this report`}
          </Text>
        </Stack>
      </Card>

      <div>
        <Title order={4} mb="sm">
          Sales summary
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {salesStats.map((stat) => (
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
              {"hint" in stat && stat.hint ? (
                <Text size="xs" c="dimmed" mt={6}>
                  {stat.hint}
                </Text>
              ) : null}
            </Card>
          ))}
        </SimpleGrid>
      </div>

      <div>
        <Title order={4} mb="sm">
          Products summary
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {productStats.map((stat) => (
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
              {"hint" in stat && stat.hint ? (
                <Text size="xs" c="dimmed" mt={6}>
                  {stat.hint}
                </Text>
              ) : null}
            </Card>
          ))}
        </SimpleGrid>
      </div>

      <div>
        <Group justify="space-between" mb="sm" align="flex-end">
          <div>
            <Title order={4}>Projects by schedule date</Title>
            <Text size="sm" c="dimmed">
              Counted by calendar schedule, not creation date. Payments on a project
              count in the month it is scheduled, including partial payments made earlier.
            </Text>
          </div>
          <Button component={Link} to="/calendar" variant="light" color="green" size="xs">
            Open calendar
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="lg">
          {projectCalendarStats.map((stat) => (
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
              {"hint" in stat && stat.hint ? (
                <Text size="xs" c="dimmed" mt={6}>
                  {stat.hint}
                </Text>
              ) : null}
            </Card>
          ))}
        </SimpleGrid>

        <Card withBorder padding="md" radius="md">
          <Text fw={600} mb="xs">
            Monthly project summary
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Payments received during each month for projects scheduled in that same month.
          </Text>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Month</Table.Th>
                <Table.Th ta="right">Payments</Table.Th>
                <Table.Th ta="right">Total due</Table.Th>
                <Table.Th ta="right">Open</Table.Th>
                <Table.Th ta="right">Closed</Table.Th>
                <Table.Th ta="right">Scheduled</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {monthlyProjectRows.map((row) => (
                <Table.Tr key={row.monthKey}>
                  <Table.Td>{row.label}</Table.Td>
                  <Table.Td ta="right">
                    {formatMoney(row.totalPayments, store!.currency)}
                  </Table.Td>
                  <Table.Td ta="right">
                    {formatMoney(row.totalDue, store!.currency)}
                  </Table.Td>
                  <Table.Td ta="right">{row.openProjects}</Table.Td>
                  <Table.Td ta="right">{row.closedProjects}</Table.Td>
                  <Table.Td ta="right">{row.scheduledProjects}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </div>

      <div>
        <Title order={4} mb="sm">
          Customers & inventory
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 2 }} spacing="md">
          {customerStats.map((stat) => (
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
      </div>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder padding="lg" radius="md">
            <Group justify="space-between" mb="md">
              <Title order={4}>Upcoming in 2 days</Title>
              <Text component={Link} to="/calendar" size="sm" c="green">
                Open calendar
              </Text>
            </Group>
            <Stack gap="sm">
              {[...upcomingProjects, ...upcomingActivities]
                .sort(
                  (a, b) =>
                    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
                )
                .slice(0, 6)
                .map((event) => (
                  <Group key={event.id} justify="space-between" wrap="nowrap">
                    <div>
                      <Group gap="xs">
                        <Badge
                          variant="light"
                          color={isActivityCalendarEvent(event) ? "teal" : "grape"}
                        >
                          {isActivityCalendarEvent(event) ? "Activity" : "Project"}
                        </Badge>
                        <Text fw={600} size="sm">
                          {event.title}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {formatDate(event.startsAt)} · {formatTimeOnly(event.startsAt)}
                        {event.customerName ? ` · ${event.customerName}` : ""}
                      </Text>
                    </div>
                    <Badge color="blue" variant="light">
                      Open
                    </Badge>
                  </Group>
                ))}
              {upcomingProjects.length + upcomingActivities.length === 0 ? (
                <Text c="dimmed">No projects or activities scheduled in the next 2 days.</Text>
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
            <Text c="dimmed">No orders match the selected filters.</Text>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
