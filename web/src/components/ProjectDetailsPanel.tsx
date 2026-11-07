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
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Fragment } from "react";
import { IconDownload, IconSearch, IconX } from "@tabler/icons-react";
import { exportProjectDetailsToExcel, projectMaterialCost } from "../lib/exportProjectDetails";
import {
  calendarEventTypeLabel,
  formatDate,
  formatMoney,
  orderStatusLabel,
  paymentLabel,
} from "../lib/format";
import {
  orderPaymentState,
  orderPaymentStateColor,
  orderPaymentStateLabel,
} from "../lib/orderState";
import { projectBalanceDue, projectPaidTotal } from "../lib/projectPayments";
import type { Currency, Order } from "../lib/types";

const ORDER_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "COMPLETED", label: "Completed" },
  { value: "VOIDED", label: "Voided" },
  { value: "DRAFT", label: "Draft" },
  { value: "REFUNDED", label: "Refunded" },
] as const;

const PAYMENT_STATES = [
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
] as const;

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

function scheduleOf(order: Order) {
  return [...(order.calendarEvents ?? [])].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )[0];
}

function historyLine(note: string) {
  return note.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,
    (iso) => formatDate(iso),
  );
}

type Props = {
  rows: Order[];
  loading: boolean;
  fetching: boolean;
  currency: Currency;
  orderNumber: string;
  onOrderNumberChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  status: string | null;
  onStatusChange: (value: string | null) => void;
  paymentState: "OPEN" | "CLOSED" | null;
  onPaymentStateChange: (value: "OPEN" | "CLOSED" | null) => void;
  cashierId: string | null;
  cashierOptions: { value: string; label: string }[];
  onCashierChange: (value: string | null) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
};

export function ProjectDetailsPanel({
  rows,
  loading,
  fetching,
  currency,
  orderNumber,
  onOrderNumberChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  status,
  onStatusChange,
  paymentState,
  onPaymentStateChange,
  cashierId,
  cashierOptions,
  onCashierChange,
  filtersActive,
  onClearFilters,
  expandedId,
  onToggle,
  onOpen,
}: Props) {
  const materialTotal = rows.reduce((sum, order) => sum + projectMaterialCost(order), 0);
  const customerTotal = rows.reduce((sum, order) => sum + Number(order.total), 0);
  const paidTotal = rows.reduce((sum, order) => sum + projectPaidTotal(order), 0);
  const balanceTotal = rows.reduce((sum, order) => sum + projectBalanceDue(order), 0);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Text fw={600} size="lg">
          Project details
        </Text>
        <Button
          variant="light"
          color="green"
          leftSection={<IconDownload size={16} />}
          disabled={rows.length === 0}
          onClick={() => {
            const stamp = new Date().toISOString().slice(0, 10);
            exportProjectDetailsToExcel(rows, `project-details-${stamp}.xlsx`);
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
            label="Order number"
            placeholder="Search by order number..."
            leftSection={<IconSearch size={16} />}
            value={orderNumber}
            onChange={(event) => onOrderNumberChange(event.currentTarget.value)}
          />
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="From"
                type="datetime-local"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="To"
                type="datetime-local"
                value={dateTo}
                onChange={(event) => onDateToChange(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Select
                label="Order status"
                placeholder="All statuses"
                clearable
                data={[...ORDER_STATUSES]}
                value={status}
                onChange={onStatusChange}
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
                  onPaymentStateChange((value as "OPEN" | "CLOSED" | null) ?? null)
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
                onChange={onCashierChange}
              />
            </Grid.Col>
          </Grid>
          {filtersActive ? (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {fetching ? "Updating results..." : `${rows.length} project(s) found`}
              </Text>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconX size={14} />}
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Card>

      <Group grow>
        <Card withBorder padding="md" radius="md">
          <Text size="sm" c="dimmed">
            Projects
          </Text>
          <Text fw={700} size="xl">
            {rows.length}
          </Text>
        </Card>
        <Card withBorder padding="md" radius="md">
          <Text size="sm" c="dimmed">
            Material cost
          </Text>
          <Text fw={700} size="xl">
            {formatMoney(materialTotal, currency)}
          </Text>
        </Card>
        <Card withBorder padding="md" radius="md">
          <Text size="sm" c="dimmed">
            Customer total
          </Text>
          <Text fw={700} size="xl" c="green">
            {formatMoney(customerTotal, currency)}
          </Text>
        </Card>
        <Card withBorder padding="md" radius="md">
          <Text size="sm" c="dimmed">
            Paid / balance
          </Text>
          <Text fw={700} size="xl">
            {formatMoney(paidTotal, currency)}
          </Text>
          <Text size="sm" c={balanceTotal > 0 ? "orange" : "teal"}>
            {formatMoney(balanceTotal, currency)} still due
          </Text>
        </Card>
      </Group>

      {loading ? (
        <Loader color="green" />
      ) : (
        <Card withBorder padding={0} radius="md">
          <ScrollArea.Autosize mah={640} offsetScrollbars type="auto">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Order #</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Schedule</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th ta="right">Material cost</Table.Th>
                  <Table.Th ta="right">Customer total</Table.Th>
                  <Table.Th ta="right">Paid</Table.Th>
                  <Table.Th ta="right">Balance</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((order) => {
                  const schedule = scheduleOf(order);
                  const paid = projectPaidTotal(order);
                  const balance = projectBalanceDue(order);
                  const payment = orderPaymentState(order);
                  const open = expandedId === order.id;
                  return (
                    <Fragment key={order.id}>
                      <Table.Tr
                        style={{ cursor: "pointer" }}
                        onClick={() => onToggle(order.id)}
                      >
                        <Table.Td>
                          <Text
                            fw={600}
                            c="blue"
                            style={{ cursor: "pointer" }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpen(order.id);
                            }}
                          >
                            {order.orderNumber}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {order.projectTitle || "Untitled project"}
                          </Text>
                          <Button
                            variant="subtle"
                            size="compact-xs"
                            px={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggle(order.id);
                            }}
                          >
                            {open ? "Hide details" : "Show details"}
                          </Button>
                        </Table.Td>
                        <Table.Td>{formatDate(order.completedAt ?? order.createdAt)}</Table.Td>
                        <Table.Td>
                          <Text>{order.customer?.name ?? "—"}</Text>
                          {order.customer?.phone ? (
                            <Text size="xs" c="dimmed">
                              {order.customer.phone}
                            </Text>
                          ) : null}
                        </Table.Td>
                        <Table.Td>
                          {schedule ? (
                            <>
                              <Text>{formatDate(schedule.startsAt)}</Text>
                              <Text size="xs" c="dimmed">
                                {calendarEventTypeLabel(schedule.type)}
                              </Text>
                            </>
                          ) : (
                            "—"
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            <Badge variant="light" color={statusColor(order.status)}>
                              {orderStatusLabel(order.status)}
                            </Badge>
                            <Badge variant="light" color={orderPaymentStateColor(payment)}>
                              {orderPaymentStateLabel(payment)}
                            </Badge>
                          </Stack>
                        </Table.Td>
                        <Table.Td ta="right">
                          {formatMoney(projectMaterialCost(order), currency)}
                        </Table.Td>
                        <Table.Td ta="right">{formatMoney(order.total, currency)}</Table.Td>
                        <Table.Td ta="right">{formatMoney(paid, currency)}</Table.Td>
                        <Table.Td ta="right">
                          <Text c={balance > 0 ? "orange" : "teal"}>
                            {formatMoney(balance, currency)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                      {open ? (
                        <Table.Tr key={`${order.id}-details`}>
                          <Table.Td colSpan={9} bg="gray.0">
                            <Stack gap="sm" py="xs">
                              <Group gap="xl">
                                <Text size="sm">
                                  Cashier: {order.cashier?.name ?? "—"}
                                </Text>
                                <Text size="sm">
                                  Price: {order.projectSellQuantity ?? 1} ×{" "}
                                  {formatMoney(order.projectSellUnitPrice ?? 0, currency)}
                                </Text>
                                <Text size="sm">
                                  Discount: {formatMoney(order.discountTotal, currency)}
                                </Text>
                              </Group>
                              {order.notes ? (
                                <Text size="sm">Notes: {order.notes}</Text>
                              ) : null}
                              {(order.payments ?? []).length > 0 ? (
                                <Text size="sm">
                                  Payments:{" "}
                                  {(order.payments ?? [])
                                    .map(
                                      (payment) =>
                                        `${paymentLabel(payment.method)} ${formatMoney(payment.amount, currency)}`,
                                    )
                                    .join(", ")}
                                </Text>
                              ) : (
                                <Text size="sm" c="dimmed">
                                  No payments recorded.
                                </Text>
                              )}

                              <Text fw={600} size="sm">
                                Materials
                              </Text>
                              {(order.projectMaterials ?? []).length === 0 ? (
                                <Text size="sm" c="dimmed">
                                  No materials on this project.
                                </Text>
                              ) : (
                                <Table withTableBorder>
                                  <Table.Thead>
                                    <Table.Tr>
                                      <Table.Th>Material</Table.Th>
                                      <Table.Th>Vendor</Table.Th>
                                      <Table.Th ta="right">Qty</Table.Th>
                                      <Table.Th ta="right">Unit cost</Table.Th>
                                      <Table.Th ta="right">Line cost</Table.Th>
                                    </Table.Tr>
                                  </Table.Thead>
                                  <Table.Tbody>
                                    {(order.projectMaterials ?? []).map((line) => (
                                      <Table.Tr key={line.id}>
                                        <Table.Td>{line.description}</Table.Td>
                                        <Table.Td>{line.vendor}</Table.Td>
                                        <Table.Td ta="right">{line.quantity}</Table.Td>
                                        <Table.Td ta="right">
                                          {formatMoney(line.unitCost, currency)}
                                        </Table.Td>
                                        <Table.Td ta="right">
                                          {formatMoney(line.lineTotal, currency)}
                                        </Table.Td>
                                      </Table.Tr>
                                    ))}
                                  </Table.Tbody>
                                </Table>
                              )}

                              <Text fw={600} size="sm">
                                Record history
                              </Text>
                              {(order.projectAdjustments ?? []).length === 0 ? (
                                <Text size="sm" c="dimmed">
                                  No records yet.
                                </Text>
                              ) : (
                                <Stack gap={6}>
                                  {(order.projectAdjustments ?? []).map((entry) => (
                                    <div key={entry.id}>
                                      {entry.note.split("; ").map((line, index) => (
                                        <Text key={`${entry.id}-${index}`} size="sm">
                                          {historyLine(line)}
                                        </Text>
                                      ))}
                                      <Text size="xs" c="dimmed">
                                        {formatDate(entry.createdAt)}
                                        {entry.user ? ` · ${entry.user.name}` : ""}
                                      </Text>
                                    </div>
                                  ))}
                                </Stack>
                              )}
                            </Stack>
                          </Table.Td>
                        </Table.Tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
          {rows.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No projects match your filters
            </Text>
          ) : null}
        </Card>
      )}
    </Stack>
  );
}
