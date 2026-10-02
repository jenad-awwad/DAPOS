import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconDeviceFloppy,
  IconPlus,
  IconRefresh,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useHasPermission } from "../hooks/useRoles";
import {
  createStoreRole,
  deleteStoreRole,
  fetchAccessCatalog,
  fetchRolePolicies,
  fetchStaff,
  updateStaff,
  updateStoreRole,
} from "../lib/api";
import { storeRoleLabel } from "../lib/format";
import {
  DEFAULT_ROLE_POLICIES,
  PERMISSION_CATALOG,
  type PermissionKey,
} from "../lib/permissions";
import type { StaffUser, StoreRole } from "../lib/types";

function groupPermissions(catalog = PERMISSION_CATALOG) {
  const groups = new Map<string, typeof PERMISSION_CATALOG>();
  for (const item of catalog) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return [...groups.entries()];
}

export function RolesPoliciesPage() {
  const canManage = useHasPermission("roles.manage");
  const { refreshSession } = useAuth();
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState<StoreRole[] | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [userStoreRoleId, setUserStoreRoleId] = useState<string | null>(null);
  const [useCustomPolicies, setUseCustomPolicies] = useState(false);
  const [userPolicies, setUserPolicies] = useState<PermissionKey[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<PermissionKey[]>([]);

  const catalogQuery = useQuery({
    queryKey: ["access-catalog"],
    queryFn: fetchAccessCatalog,
    enabled: canManage,
  });

  const policiesQuery = useQuery({
    queryKey: ["role-policies"],
    queryFn: fetchRolePolicies,
    enabled: canManage,
  });

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: fetchStaff,
    enabled: canManage,
  });

  const catalog = catalogQuery.data?.permissions ?? PERMISSION_CATALOG;
  const grouped = useMemo(() => groupPermissions(catalog), [catalog]);

  const activeRoles = roles ?? policiesQuery.data?.roles ?? [];

  const roleSelectData = useMemo(
    () =>
      activeRoles.map((role) => ({
        value: role.id,
        label: storeRoleLabel(role),
      })),
    [activeRoles],
  );

  const saveRolesMutation = useMutation({
    mutationFn: async (nextRoles: StoreRole[]) => {
      const serverRoles = policiesQuery.data?.roles ?? [];
      const updates = nextRoles.filter((role) => {
        const original = serverRoles.find((item) => item.id === role.id);
        if (!original) return false;
        return (
          JSON.stringify(original.permissions) !== JSON.stringify(role.permissions)
        );
      });

      for (const role of updates) {
        await updateStoreRole(role.id, { permissions: role.permissions });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-policies"] });
      refreshSession();
      notifications.show({ color: "green", message: "Role policies saved" });
    },
    onError: (err: Error) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const createRoleMutation = useMutation({
    mutationFn: createStoreRole,
    onSuccess: (data) => {
      setRoles((current) => [...(current ?? activeRoles), data.role]);
      queryClient.invalidateQueries({ queryKey: ["role-policies"] });
      refreshSession();
      notifications.show({ color: "green", message: "Role created" });
      setCreateRoleOpen(false);
      setNewRoleName("");
      setNewRolePermissions([]);
    },
    onError: (err: Error) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: deleteStoreRole,
    onSuccess: (_data, roleId) => {
      setRoles((current) => (current ?? activeRoles).filter((role) => role.id !== roleId));
      queryClient.invalidateQueries({ queryKey: ["role-policies"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      refreshSession();
      notifications.show({ color: "green", message: "Role deleted" });
    },
    onError: (err: Error) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, storeRoleId }: { id: string; storeRoleId: string }) =>
      updateStaff(id, { storeRoleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      refreshSession();
      notifications.show({ color: "green", message: "Role updated" });
    },
    onError: (err: Error) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const saveUserMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser || !userStoreRoleId) return;
      return updateStaff(editingUser.id, {
        storeRoleId: userStoreRoleId,
        customPolicies: useCustomPolicies ? userPolicies : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      refreshSession();
      notifications.show({ color: "green", message: "User access updated" });
      setUserModalOpen(false);
      setEditingUser(null);
    },
    onError: (err: Error) =>
      notifications.show({ color: "red", message: err.message }),
  });

  function toggleRolePermission(roleId: string, key: PermissionKey, checked: boolean) {
    setRoles(
      (current ?? activeRoles).map((role) => {
        if (role.id !== roleId) return role;
        const permissions = new Set(role.permissions);
        if (checked) permissions.add(key);
        else permissions.delete(key);
        return { ...role, permissions: [...permissions] };
      }),
    );
  }

  function openUserModal(user: StaffUser) {
    setEditingUser(user);
    const roleId = user.storeRoleId ?? activeRoles.find((r) => r.systemCode === user.role)?.id ?? null;
    setUserStoreRoleId(roleId);
    const hasCustom = Boolean(user.customPolicies?.length);
    setUseCustomPolicies(hasCustom);
    const rolePermissions =
      activeRoles.find((role) => role.id === roleId)?.permissions ?? [];
    setUserPolicies(hasCustom ? user.customPolicies! : rolePermissions);
    setUserModalOpen(true);
  }

  function resetSystemRolesToDefaults() {
    const defaults = policiesQuery.data?.defaults ?? DEFAULT_ROLE_POLICIES;
    setRoles(
      activeRoles.map((role) =>
        role.systemCode
          ? { ...role, permissions: defaults[role.systemCode] ?? role.permissions }
          : role,
      ),
    );
  }

  if (!canManage) return <Navigate to="/" replace />;
  if (policiesQuery.isLoading || staffQuery.isLoading) {
    return <Loader color="green" />;
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <IconShieldLock size={28} stroke={1.5} />
            <Title order={2}>Roles & policies</Title>
          </Group>
          <Text c="dimmed">
            Manage built-in and custom roles, then assign them to users
          </Text>
        </div>
        <Button
          color="green"
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateRoleOpen(true)}
        >
          Add role
        </Button>
      </Group>

      <Tabs defaultValue="roles" color="green">
        <Tabs.List>
          <Tabs.Tab value="roles">Role policies</Tabs.Tab>
          <Tabs.Tab value="users">User access</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="roles" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Built-in roles cannot be deleted. Custom roles can be removed when
                no users are assigned.
              </Text>
              <Group>
                <Button
                  variant="light"
                  color="gray"
                  leftSection={<IconRefresh size={16} />}
                  onClick={resetSystemRolesToDefaults}
                >
                  Reset system roles
                </Button>
                <Button
                  color="green"
                  leftSection={<IconDeviceFloppy size={16} />}
                  loading={saveRolesMutation.isPending}
                  onClick={() => saveRolesMutation.mutate(activeRoles)}
                >
                  Save role policies
                </Button>
              </Group>
            </Group>

            <ScrollArea>
              <Table striped withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={280}>Permission</Table.Th>
                    {activeRoles.map((role) => (
                      <Table.Th key={role.id} ta="center">
                        <Stack gap={4} align="center">
                          <Text size="sm" fw={600}>
                            {storeRoleLabel(role)}
                          </Text>
                          {role.isSystem ? (
                            <Badge size="xs" variant="light" color="gray">
                              System
                            </Badge>
                          ) : (
                            <Tooltip label="Delete role">
                              <ActionIcon
                                size="sm"
                                color="red"
                                variant="subtle"
                                loading={
                                  deleteRoleMutation.isPending &&
                                  deleteRoleMutation.variables === role.id
                                }
                                onClick={() => deleteRoleMutation.mutate(role.id)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Stack>
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {grouped.map(([group, items]) => (
                    <Fragment key={group}>
                      <Table.Tr>
                        <Table.Td colSpan={activeRoles.length + 1}>
                          <Text fw={600} size="sm">
                            {group}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                      {items.map((item) => (
                        <Table.Tr key={item.key}>
                          <Table.Td>
                            <Text size="sm">{item.label}</Text>
                            <Text size="xs" c="dimmed">
                              {item.key}
                            </Text>
                          </Table.Td>
                          {activeRoles.map((role) => (
                            <Table.Td key={`${item.key}-${role.id}`} ta="center">
                              <Checkbox
                                color="green"
                                checked={role.permissions.includes(item.key)}
                                onChange={(e) =>
                                  toggleRolePermission(
                                    role.id,
                                    item.key,
                                    e.currentTarget.checked,
                                  )
                                }
                                aria-label={`${item.label} for ${storeRoleLabel(role)}`}
                              />
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Fragment>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="users" pt="md">
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Access</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(staffQuery.data?.users ?? []).map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>{user.name}</Table.Td>
                  <Table.Td>
                    <Select
                      w={190}
                      size="xs"
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 1000 }}
                      data={roleSelectData}
                      value={user.storeRoleId ?? roleSelectData.find((r) => r.label.includes(user.role))?.value ?? null}
                      disabled={
                        roleMutation.isPending && roleMutation.variables?.id === user.id
                      }
                      onChange={(value) => {
                        if (!value || value === user.storeRoleId) return;
                        roleMutation.mutate({ id: user.id, storeRoleId: value });
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    {user.customPolicies?.length ? (
                      <Badge color="blue" variant="light">
                        Custom ({user.customPolicies.length})
                      </Badge>
                    ) : (
                      <Badge color="gray" variant="light">
                        Role default
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={user.isActive ? "green" : "gray"} variant="light">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="xs"
                      variant="light"
                      color="green"
                      onClick={() => openUserModal(user)}
                    >
                      Edit access
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={createRoleOpen}
        onClose={() => setCreateRoleOpen(false)}
        title="Create role"
        size="lg"
        zIndex={300}
      >
        <Stack gap="md">
          <TextInput
            label="Role name"
            placeholder="e.g. Supervisor, Warehouse lead"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.currentTarget.value)}
          />
          <Text size="sm" fw={500}>
            Permissions
          </Text>
          <ScrollArea h={280}>
            <Stack gap="sm">
              {grouped.map(([group, items]) => (
                <div key={group}>
                  <Text fw={600} size="sm" mb={4}>
                    {group}
                  </Text>
                  <Stack gap={6}>
                    {items.map((item) => (
                      <Checkbox
                        key={item.key}
                        label={item.label}
                        color="green"
                        checked={newRolePermissions.includes(item.key)}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          setNewRolePermissions((prev) =>
                            checked
                              ? [...prev, item.key]
                              : prev.filter((key) => key !== item.key),
                          );
                        }}
                      />
                    ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          </ScrollArea>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateRoleOpen(false)}>
              Cancel
            </Button>
            <Button
              color="green"
              loading={createRoleMutation.isPending}
              disabled={!newRoleName.trim()}
              onClick={() =>
                createRoleMutation.mutate({
                  name: newRoleName.trim(),
                  permissions: newRolePermissions,
                })
              }
            >
              Create role
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `Access for ${editingUser.name}` : "User access"}
        size="lg"
        zIndex={300}
      >
        <Stack gap="md">
          <div>
            <Text size="sm" fw={500} mb={6}>
              Role
            </Text>
            <Select
              allowDeselect={false}
              comboboxProps={{ withinPortal: true, zIndex: 310 }}
              data={roleSelectData}
              value={userStoreRoleId}
              onChange={(value) => {
                if (!value) return;
                setUserStoreRoleId(value);
                if (!useCustomPolicies) {
                  const role = activeRoles.find((item) => item.id === value);
                  setUserPolicies(role?.permissions ?? []);
                }
              }}
            />
          </div>

          <Switch
            label="Use custom policies for this user"
            description="When off, the user inherits permissions from their role"
            checked={useCustomPolicies}
            onChange={(e) => {
              const enabled = e.currentTarget.checked;
              setUseCustomPolicies(enabled);
              if (!enabled && userStoreRoleId) {
                const role = activeRoles.find((item) => item.id === userStoreRoleId);
                setUserPolicies(role?.permissions ?? []);
              }
            }}
          />

          {useCustomPolicies ? (
            <ScrollArea h={320}>
              <Stack gap="sm">
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <Text fw={600} size="sm" mb={4}>
                      {group}
                    </Text>
                    <Stack gap={6}>
                      {items.map((item) => (
                        <Checkbox
                          key={item.key}
                          label={item.label}
                          color="green"
                          checked={userPolicies.includes(item.key)}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            setUserPolicies((prev) =>
                              checked
                                ? [...prev, item.key]
                                : prev.filter((key) => key !== item.key),
                            );
                          }}
                        />
                      ))}
                    </Stack>
                  </div>
                ))}
              </Stack>
            </ScrollArea>
          ) : (
            <Text size="sm" c="dimmed">
              This user will use the{" "}
              {storeRoleLabel(
                activeRoles.find((role) => role.id === userStoreRoleId) ?? {
                  name: "selected role",
                },
              )}{" "}
              permissions (
              {activeRoles.find((role) => role.id === userStoreRoleId)?.permissions.length ??
                0}{" "}
              permissions).
            </Text>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setUserModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="green"
              loading={saveUserMutation.isPending}
              onClick={() => saveUserMutation.mutate()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
