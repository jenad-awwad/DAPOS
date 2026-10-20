import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useHasPermission } from "../hooks/usePermissions";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomerReport,
  updateCustomer,
} from "../lib/api";
import { formatDateOnly, formatMoney } from "../lib/format";
import type { Customer } from "../lib/types";

function toIsoDateTime(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function CustomersPage() {
  const canEditCustomers = useHasPermission("customers.manage");
  const canViewCustomers = useHasPermission(["customers.view", "customers.manage"]);
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const [nameSearch, setNameSearch] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [orderMonth, setOrderMonth] = useState("");
  const [loyaltyFilter, setLoyaltyFilter] = useState<string | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const [debouncedName] = useDebouncedValue(nameSearch.trim(), 300);

  const filters = useMemo(
    () => ({
      search: debouncedName || undefined,
      loyaltyOnly: loyaltyFilter === "loyalty",
      nonLoyaltyOnly: loyaltyFilter === "non-loyalty",
      createdFrom: toIsoDateTime(createdFrom),
      createdTo: toIsoDateTime(createdTo),
      orderMonth: orderMonth || undefined,
    }),
    [debouncedName, loyaltyFilter, createdFrom, createdTo, orderMonth],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["customers", "report", filters],
    queryFn: () => fetchCustomerReport(filters),
  });

  const form = useForm({
    initialValues: { name: "", email: "", phone: "", notes: "" },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form.values) => {
      const payload = {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null,
      };
      if (editing) return updateCustomer(editing.id, payload);
      return createCustomer(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      notifications.show({ color: "green", message: "Customer saved" });
      close();
      setEditing(null);
      form.reset();
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      notifications.show({ color: "green", message: "Customer deleted" });
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  const hasFilters =
    nameSearch.trim() !== "" ||
    createdFrom !== "" ||
    createdTo !== "" ||
    orderMonth !== "" ||
    loyaltyFilter !== null;

  const clearFilters = () => {
    setNameSearch("");
    setCreatedFrom("");
    setCreatedTo("");
    setOrderMonth("");
    setLoyaltyFilter(null);
  };

  if (!canViewCustomers) return <Navigate to="/" replace />;
  if (isLoading) return <Loader color="green" />;

  const customers = data?.customers ?? [];
  const summary = data?.summary;
  const orderMonthLabel = data?.orderMonthLabel ?? "This month";

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Customers</Title>
          <Text c="dimmed">Customer records, loyalty, and order activity</Text>
        </div>
        {canEditCustomers ? (
        <Button
          color="green"
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditing(null);
            form.reset();
            open();
          }}
        >
          Add customer
        </Button>
        ) : null}
      </Group>

      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <TextInput
            label="Customer name"
            placeholder="Search by name, phone, or email..."
            leftSection={<IconSearch size={16} />}
            value={nameSearch}
            onChange={(e) => setNameSearch(e.currentTarget.value)}
          />

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Created from"
                type="datetime-local"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Created to"
                type="datetime-local"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Orders month"
                type="month"
                value={orderMonth}
                onChange={(e) => setOrderMonth(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Loyalty"
                placeholder="All customers"
                clearable
                data={[
                  { value: "loyalty", label: "Loyalty members only" },
                  { value: "non-loyalty", label: "Non-loyalty only" },
                ]}
                value={loyaltyFilter}
                onChange={setLoyaltyFilter}
              />
            </Grid.Col>
          </Grid>

          {hasFilters ? (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {isFetching
                  ? "Updating results..."
                  : `${customers.length} customer(s) found`}
              </Text>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconX size={14} />}
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Card>

      {summary ? (
        <Group grow>
          <Card withBorder padding="md" radius="md">
            <Text size="sm" c="dimmed">
              Customers
            </Text>
            <Text fw={700} size="xl">
              {summary.customerCount}
            </Text>
          </Card>
          <Card withBorder padding="md" radius="md">
            <Text size="sm" c="dimmed">
              Total orders
            </Text>
            <Text fw={700} size="xl">
              {summary.totalOrders}
            </Text>
          </Card>
          <Card withBorder padding="md" radius="md">
            <Text size="sm" c="dimmed">
              Orders in {orderMonthLabel}
            </Text>
            <Text fw={700} size="xl">
              {summary.ordersThisMonth}
            </Text>
          </Card>
          <Card withBorder padding="md" radius="md">
            <Text size="sm" c="dimmed">
              Total order value
            </Text>
            <Text fw={700} size="xl" c="green">
              {formatMoney(summary.totalOrderValue, store!.currency)}
            </Text>
          </Card>
        </Group>
      ) : null}

      <Card withBorder padding={0} radius="md">
        <ScrollArea.Autosize mah={560} offsetScrollbars type="auto">
          <Table
            striped
            styles={{ th: { fontWeight: 400 }, td: { fontWeight: 400 } }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>First order</Table.Th>
                <Table.Th ta="center">Orders ({orderMonthLabel})</Table.Th>
                <Table.Th ta="center">Total orders</Table.Th>
                <Table.Th ta="right">Total value</Table.Th>
                <Table.Th>Loyalty</Table.Th>
                <Table.Th ta="center">Points</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {customers.map((customer) => (
                  <Table.Tr key={customer.id}>
                    <Table.Td>{customer.name}</Table.Td>
                    <Table.Td>{customer.phone ?? "—"}</Table.Td>
                    <Table.Td>{customer.email ?? "—"}</Table.Td>
                    <Table.Td>{formatDateOnly(customer.createdAt)}</Table.Td>
                    <Table.Td>{formatDateOnly(customer.firstOrderDate)}</Table.Td>
                    <Table.Td ta="center">{customer.ordersThisMonth ?? 0}</Table.Td>
                    <Table.Td ta="center">{customer.totalOrders ?? 0}</Table.Td>
                    <Table.Td ta="right">
                      {formatMoney(customer.totalOrderValue ?? 0, store!.currency)}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={customer.loyaltyEnrolled ? "green" : "gray"}
                        variant="light"
                      >
                        {customer.loyaltyEnrolled ? "Active" : "—"}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">
                      {customer.loyaltyEnrolled ? customer.loyaltyPoints : "—"}
                    </Table.Td>
                    <Table.Td ta="right">
                      {canEditCustomers ? (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <ActionIcon
                          variant="light"
                          onClick={() => {
                            setEditing(customer);
                            form.setValues({
                              name: customer.name,
                              email: customer.email ?? "",
                              phone: customer.phone ?? "",
                              notes: customer.notes ?? "",
                            });
                            open();
                          }}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon
                          color="red"
                          variant="light"
                          onClick={() => deleteMutation.mutate(customer.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                      ) : (
                        <Text size="xs" c="dimmed">
                          View only
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        {customers.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No customers match your filters
          </Text>
        ) : null}
      </Card>

      <Modal opened={opened} onClose={close} title={editing ? "Edit customer" : "New customer"}>
        <form onSubmit={form.onSubmit((v) => saveMutation.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Name" required {...form.getInputProps("name")} />
            <TextInput label="Phone" {...form.getInputProps("phone")} />
            <TextInput label="Email" {...form.getInputProps("email")} />
            <Textarea label="Notes" {...form.getInputProps("notes")} />
            <Button type="submit" color="green" loading={saveMutation.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
