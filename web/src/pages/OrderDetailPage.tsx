import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconBan, IconCash, IconPrinter } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ProjectPartialPayments } from "../components/ProjectPartialPayments";
import { useAuth } from "../context/AuthContext";
import { useCanManage } from "../hooks/useRoles";
import { fetchOrder, submitProjectOrder, voidOrder } from "../lib/api";
import {
  formatDate,
  formatMoney,
  orderStatusLabel,
  orderTypeLabel,
  paymentLabel,
} from "../lib/format";
import { projectBalanceDue, projectIsFullyPaid, projectPaidTotal } from "../lib/projectPayments";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { store } = useAuth();
  const canManage = useCanManage();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
  });

  const voidMutation = useMutation({
    mutationFn: () => voidOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => submitProjectOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      notifications.show({ color: "green", message: "Project submitted and closed" });
    },
    onError: (err) => {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Could not submit project",
      });
    },
  });

  if (isLoading) return <Loader color="green" />;
  if (error || !data?.order) {
    return (
      <Stack>
        <Text c="red">Order not found</Text>
        <Button component={Link} to="/orders" variant="light">
          Back to orders
        </Button>
      </Stack>
    );
  }

  const order = data.order;
  const isOpenProject = order.orderType === "PROJECT" && order.status === "OPEN";
  const paidTotal = projectPaidTotal(order);
  const balanceDue = projectBalanceDue(order);
  const fullyPaid = projectIsFullyPaid(order);
  const statusColor =
    order.status === "VOIDED" ? "red" : order.status === "OPEN" ? "blue" : "green";

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Button
            component={Link}
            to="/orders"
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            mb="xs"
            px={0}
          >
            Back to orders
          </Button>
          <Title order={2}>{order.orderNumber}</Title>
          <Text c="dimmed">{formatDate(order.completedAt ?? order.createdAt)}</Text>
          {order.orderType === "PROJECT" && order.projectTitle ? (
            <Text size="sm" mt={4}>
              {order.projectTitle}
            </Text>
          ) : null}
        </div>
        <Group>
          <Badge size="lg" color={statusColor} variant="light">
            {orderStatusLabel(order.status)}
          </Badge>
          {order.orderType === "PROJECT" ? (
            <Badge size="lg" color="grape" variant="light">
              {orderTypeLabel(order.orderType)}
            </Badge>
          ) : null}
          {canManage && order.status === "COMPLETED" ? (
            <Button
              color="red"
              variant="light"
              leftSection={<IconBan size={16} />}
              loading={voidMutation.isPending}
              onClick={() => voidMutation.mutate()}
            >
              Void order
            </Button>
          ) : null}
          <Button
            variant="light"
            leftSection={<IconPrinter size={16} />}
            onClick={() => window.print()}
          >
            Print receipt
          </Button>
        </Group>
      </Group>

      <Card withBorder padding="lg" radius="md" maw={720}>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Cashier</Text>
            <Text>{order.cashier?.name ?? "—"}</Text>
          </Group>
          {order.customer ? (
            <Group justify="space-between">
              <Text fw={600}>Customer</Text>
              <Text>{order.customer.name}</Text>
            </Group>
          ) : null}

          <Divider />

          {order.orderType === "PROJECT" ? (
            <>
              <Group justify="space-between">
                <Text fw={600}>Customer price</Text>
                <Text>
                  {order.projectSellQuantity ?? 1} ×{" "}
                  {formatMoney(order.projectSellUnitPrice ?? 0, store!.currency)}
                </Text>
              </Group>
              <Text fw={600} mb="xs">
                Material cost breakdown (internal)
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Material</Table.Th>
                    <Table.Th>Vendor</Table.Th>
                    <Table.Th ta="center">Qty</Table.Th>
                    <Table.Th ta="right">Unit cost</Table.Th>
                    <Table.Th ta="right">Line total</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(order.projectMaterials ?? []).map((material) => (
                    <Table.Tr key={material.id}>
                      <Table.Td>
                        <Text fw={500}>{material.description}</Text>
                      </Table.Td>
                      <Table.Td>{material.vendor}</Table.Td>
                      <Table.Td ta="center">{material.quantity}</Table.Td>
                      <Table.Td ta="right">
                        {formatMoney(material.unitCost, store!.currency)}
                      </Table.Td>
                      <Table.Td ta="right">
                        {formatMoney(material.lineTotal, store!.currency)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Divider />
            </>
          ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th ta="center">Qty</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(order.items ?? []).map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text fw={500}>{item.productName}</Text>
                    <Text size="xs" c="dimmed">
                      {item.productSku}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="center">{item.quantity}</Table.Td>
                  <Table.Td ta="right">
                    {formatMoney(item.unitPrice, store!.currency)}
                  </Table.Td>
                  <Table.Td ta="right">
                    {formatMoney(item.lineTotal, store!.currency)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          )}

          <Divider />

          <Stack gap={6}>
            {order.orderType === "PROJECT" ? (
              <>
                <Group justify="space-between">
                  <Text c="dimmed">Material cost (internal)</Text>
                  <Text>{formatMoney(order.subtotal, store!.currency)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Estimated margin</Text>
                  <Text c={order.total - order.subtotal >= 0 ? "teal" : "red"}>
                    {formatMoney(order.total - order.subtotal, store!.currency)}
                  </Text>
                </Group>
              </>
            ) : (
              <Group justify="space-between">
                <Text c="dimmed">Subtotal</Text>
                <Text>{formatMoney(order.subtotal, store!.currency)}</Text>
              </Group>
            )}
            {order.discountTotal > 0 ? (
              <Group justify="space-between">
                <Text c="dimmed">Discount</Text>
                <Text>
                  -{formatMoney(order.discountTotal, store!.currency)}
                </Text>
              </Group>
            ) : null}
            <Group justify="space-between">
              <Text fw={700} size="lg">
                {isOpenProject ? "Customer total (due)" : "Total"}
              </Text>
              <Text fw={700} size="lg" c="green">
                {formatMoney(order.total, store!.currency)}
              </Text>
            </Group>
            {isOpenProject ? (
              <>
                <Group justify="space-between">
                  <Text c="dimmed">Paid so far</Text>
                  <Text>{formatMoney(paidTotal, store!.currency)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text c="dimmed">Balance due</Text>
                  <Text c={balanceDue > 0 ? "orange" : "teal"}>
                    {formatMoney(balanceDue, store!.currency)}
                  </Text>
                </Group>
              </>
            ) : null}
          </Stack>

          {(order.payments ?? []).length > 0 ? (
            <>
              <Divider />
              <Text fw={600} mb="xs">
                Payment history
              </Text>
              {(order.payments ?? []).map((payment) => (
                <Group key={payment.id} justify="space-between">
                  <Text>{paymentLabel(payment.method)}</Text>
                  <Text>
                    {formatMoney(payment.amount, store!.currency)}
                  </Text>
                </Group>
              ))}
            </>
          ) : isOpenProject ? (
            <Text c="dimmed" size="sm">
              No payments recorded yet.
            </Text>
          ) : null}

          {(order.projectAdjustments ?? []).length > 0 ? (
            <>
              <Divider />
              <Text fw={600}>Adjustment history</Text>
              <Stack gap="xs">
                {(order.projectAdjustments ?? []).map((entry) => (
                  <Card key={entry.id} withBorder padding="sm" radius="md">
                    <Text size="sm">{entry.note}</Text>
                    <Text size="xs" c="dimmed">
                      {formatDate(entry.createdAt)}
                      {entry.user ? ` · ${entry.user.name}` : ""}
                    </Text>
                  </Card>
                ))}
              </Stack>
            </>
          ) : null}
        </Stack>
      </Card>

      {isOpenProject ? (
        <Card withBorder padding="lg" radius="md" maw={720}>
          <Group justify="space-between" mb="sm">
            <Title order={4}>Partial payments</Title>
            <Button
              component={Link}
              to={`/pos?edit=${order.id}`}
              variant="light"
              size="sm"
            >
              Edit project
            </Button>
          </Group>

          <ProjectPartialPayments
            order={order}
            currency={store!.currency}
            onUpdated={() => queryClient.invalidateQueries({ queryKey: ["order", id] })}
          />

          <Divider my="md" />

          <Title order={5} mb="sm">
            Submit project
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            {fullyPaid
              ? "All payments recorded. Submit to close this project and complete linked calendar activities."
              : `Record partial payments until the balance is zero (currently ${formatMoney(balanceDue, store!.currency)} due).`}
          </Text>
          <Button
            color="green"
            leftSection={<IconCash size={16} />}
            loading={submitMutation.isPending}
            disabled={!fullyPaid}
            onClick={() => submitMutation.mutate()}
          >
            Submit project
          </Button>
        </Card>
      ) : null}
    </Stack>
  );
}
