import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useCanManage } from "../hooks/useRoles";
import {
  createCategory,
  deleteCategory,
  fetchAllCategories,
  updateCategory,
} from "../lib/api";
import type { CategoryAdmin } from "../lib/types";

export function CategoriesAdminPage() {
  const canManage = useCanManage();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<CategoryAdmin | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["categories", "all"],
    queryFn: fetchAllCategories,
  });

  const form = useForm({ initialValues: { name: "", sortOrder: 0 } });

  const saveMutation = useMutation({
    mutationFn: async (values: { name: string; sortOrder: number }) => {
      if (editing) return updateCategory(editing.id, values);
      return createCategory(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      notifications.show({ color: "green", message: "Category saved" });
      close();
      setEditing(null);
      form.reset();
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      notifications.show({ color: "green", message: "Category removed" });
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  if (!canManage) return <Navigate to="/" replace />;
  if (isLoading) return <Loader color="green" />;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Categories</Title>
          <Text c="dimmed">Organize your product catalog</Text>
        </div>
        <Button
          color="green"
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditing(null);
            form.setValues({ name: "", sortOrder: 0 });
            open();
          }}
        >
          Add category
        </Button>
      </Group>

      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Sort</Table.Th>
            <Table.Th>Products</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.categories ?? []).map((cat) => (
            <Table.Tr key={cat.id}>
              <Table.Td>{cat.name}</Table.Td>
              <Table.Td>{cat.sortOrder}</Table.Td>
              <Table.Td>{cat._count?.products ?? 0}</Table.Td>
              <Table.Td>
                <Badge color={cat.isActive === false ? "red" : "green"} variant="light">
                  {cat.isActive === false ? "Inactive" : "Active"}
                </Badge>
              </Table.Td>
              <Table.Td ta="right">
                <Group gap={4} justify="flex-end">
                  <ActionIcon
                    variant="light"
                    onClick={() => {
                      setEditing(cat);
                      form.setValues({ name: cat.name, sortOrder: cat.sortOrder });
                      open();
                    }}
                  >
                    <IconEdit size={16} />
                  </ActionIcon>
                  {cat.isActive !== false ? (
                    <ActionIcon
                      color="red"
                      variant="light"
                      onClick={() => deleteMutation.mutate(cat.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  ) : null}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? "Edit category" : "New category"}>
        <form onSubmit={form.onSubmit((v) => saveMutation.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Name" required {...form.getInputProps("name")} />
            <NumberInput label="Sort order" {...form.getInputProps("sortOrder")} />
            <Button type="submit" color="green" loading={saveMutation.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
