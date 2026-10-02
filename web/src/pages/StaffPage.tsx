import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useHasPermission } from "../hooks/useRoles";
import { createStaff, fetchRolePolicies, fetchStaff, updateStaff } from "../lib/api";
import { storeRoleLabel } from "../lib/format";
import type { StaffUser } from "../lib/types";

export function StaffPage() {
  const canManageStaff = useHasPermission("staff.manage");
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: fetchStaff,
    enabled: canManageStaff,
  });

  const rolesQuery = useQuery({
    queryKey: ["role-policies"],
    queryFn: fetchRolePolicies,
    enabled: canManageStaff,
  });

  const roleOptions = useMemo(
    () =>
      (rolesQuery.data?.roles ?? []).map((role) => ({
        value: role.id,
        label: storeRoleLabel(role),
      })),
    [rolesQuery.data?.roles],
  );

  const defaultRoleId =
    rolesQuery.data?.roles.find((role) => role.systemCode === "CASHIER")?.id ??
    roleOptions[0]?.value ??
    "";

  const form = useForm({
    initialValues: {
      name: "",
      phone: "",
      pin: "",
      storeRoleId: defaultRoleId,
      isActive: true,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form.values) => {
      if (editing) {
        return updateStaff(editing.id, {
          name: values.name,
          phone: values.phone,
          ...(values.pin ? { pin: values.pin } : {}),
          storeRoleId: values.storeRoleId,
          isActive: values.isActive,
        });
      }
      return createStaff({
        name: values.name,
        phone: values.phone,
        pin: values.pin,
        storeRoleId: values.storeRoleId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      notifications.show({ color: "green", message: "Staff saved" });
      close();
      setEditing(null);
      form.reset();
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  if (!canManageStaff) return <Navigate to="/" replace />;
  if (isLoading || rolesQuery.isLoading) return <Loader color="green" />;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Staff</Title>
          <Text c="dimmed">Manage store users and roles</Text>
        </div>
        <Button
          color="green"
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditing(null);
            form.setValues({
              name: "",
              phone: "",
              pin: "",
              storeRoleId: defaultRoleId,
              isActive: true,
            });
            open();
          }}
        >
          Add staff
        </Button>
      </Group>

      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Phone</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.users ?? []).map((user) => (
            <Table.Tr key={user.id}>
              <Table.Td>{user.name}</Table.Td>
              <Table.Td>{user.phone}</Table.Td>
              <Table.Td>{user.storeRoleName ?? storeRoleLabel({ name: user.role })}</Table.Td>
              <Table.Td>
                <Badge color={user.isActive ? "green" : "red"} variant="light">
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
              </Table.Td>
              <Table.Td ta="right">
                <ActionIcon
                  variant="light"
                  onClick={() => {
                    setEditing(user);
                    form.setValues({
                      name: user.name,
                      phone: user.phone,
                      pin: "",
                      storeRoleId:
                        user.storeRoleId ??
                        rolesQuery.data?.roles.find((role) => role.systemCode === user.role)
                          ?.id ??
                        defaultRoleId,
                      isActive: user.isActive,
                    });
                    open();
                  }}
                >
                  <IconEdit size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={close} title={editing ? "Edit staff" : "New staff"}>
        <form onSubmit={form.onSubmit((v) => saveMutation.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Name" required {...form.getInputProps("name")} />
            <TextInput label="Phone" required {...form.getInputProps("phone")} />
            <TextInput
              label={editing ? "New PIN (leave blank to keep)" : "PIN"}
              required={!editing}
              {...form.getInputProps("pin")}
            />
            <Select
              label="Role"
              allowDeselect={false}
              comboboxProps={{ withinPortal: true, zIndex: 1000 }}
              data={roleOptions}
              {...form.getInputProps("storeRoleId")}
            />
            {editing ? (
              <Switch label="Active" {...form.getInputProps("isActive", { type: "checkbox" })} />
            ) : null}
            <Button type="submit" color="green" loading={saveMutation.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
