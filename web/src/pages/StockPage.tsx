import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconAdjustments, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHasPermission } from "../hooks/usePermissions";
import { adjustStock, fetchProducts, fetchStockMovements } from "../lib/api";
import { formatDate } from "../lib/format";
import { Navigate } from "react-router-dom";

export function StockPage() {
  const canAdjustStock = useHasPermission("stock.adjust");
  const canViewStock = useHasPermission(["stock.view", "stock.adjust"]);
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const movementsQuery = useQuery({
    queryKey: ["stock-movements"],
    queryFn: () => fetchStockMovements({ limit: 100 }),
  });

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  const form = useForm({
    initialValues: {
      productId: "",
      quantity: 1,
      type: "RESTOCK" as "RESTOCK" | "ADJUSTMENT",
      reason: "",
    },
  });

  const adjustMutation = useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      notifications.show({ color: "green", message: "Stock updated" });
      close();
      form.reset();
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  if (!canViewStock) return <Navigate to="/inventory" replace />;
  if (movementsQuery.isLoading) return <Loader color="green" />;

  const productOptions = (productsQuery.data?.products ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} (${p.onStock} in stock)`,
  }));

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Stock Movements</Title>
          <Text c="dimmed">Inventory audit trail and adjustments</Text>
        </div>
        {canAdjustStock ? (
          <Button color="green" leftSection={<IconPlus size={16} />} onClick={open}>
            Adjust stock
          </Button>
        ) : null}
      </Group>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Product</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th ta="center">Qty</Table.Th>
            <Table.Th ta="center">Before</Table.Th>
            <Table.Th ta="center">After</Table.Th>
            <Table.Th>By</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(movementsQuery.data?.movements ?? []).map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>{formatDate(m.createdAt)}</Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {m.product.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.product.sku}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge variant="light">{m.type}</Badge>
              </Table.Td>
              <Table.Td ta="center">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</Table.Td>
              <Table.Td ta="center">{m.stockBefore}</Table.Td>
              <Table.Td ta="center">{m.stockAfter}</Table.Td>
              <Table.Td>{m.user?.name ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title="Adjust stock">
        <form onSubmit={form.onSubmit((v) => adjustMutation.mutate(v))}>
          <Stack gap="sm">
            <Select
              label="Product"
              data={productOptions}
              searchable
              required
              {...form.getInputProps("productId")}
            />
            <Select
              label="Type"
              data={[
                { value: "RESTOCK", label: "Restock (+)" },
                { value: "ADJUSTMENT", label: "Adjustment (+/−)" },
              ]}
              {...form.getInputProps("type")}
            />
            <NumberInput
              label="Quantity"
              description="Use negative numbers for adjustments that reduce stock"
              {...form.getInputProps("quantity")}
            />
            <Textarea label="Reason" {...form.getInputProps("reason")} />
            <Button
              type="submit"
              color="green"
              leftSection={<IconAdjustments size={16} />}
              loading={adjustMutation.isPending}
            >
              Apply
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
