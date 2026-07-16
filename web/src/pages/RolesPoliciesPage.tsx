import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceFloppy, IconRefresh, IconShieldLock } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useHasPermission } from "../hooks/useRoles";
import {
  fetchAccessCatalog,
  fetchRolePolicies,
  fetchStaff,
  updateRolePolicies,
  updateStaff,
} from "../lib/api";
import { roleLabel } from "../lib/format";
import {
  DEFAULT_ROLE_POLICIES,
  PERMISSION_CATALOG,
  ROLE_SELECT_DATA,
  type PermissionKey,
  type RolePoliciesMap,
} from "../lib/permissions";
import type { StaffUser, UserRole } from "../lib/types";

const ROLES: UserRole[] = ["ADMIN", "MANAGER", "CASHIER"];

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
  const [policies, setPolicies] = useState<RolePoliciesMap | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("CASHIER");
  const [useCustomPolicies, setUseCustomPolicies] = useState(false);
  const [userPolicies, setUserPolicies] = useState<PermissionKey[]>([]);

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

  const activePolicies =
    policies ?? policiesQuery.data?.policies ?? DEFAULT_ROLE_POLICIES;

  const savePoliciesMutation = useMutation({
    mutationFn: updateRolePolicies,
    onSuccess: (data) => {
      setPolicies(data.policies);
      queryClient.invalidateQueries({ queryKey: ["role-policies"] });
      refreshSession();
      notifications.show({ color: "green", message: "Role policies saved" });
    },
    onError: (err: Error) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      updateStaff(id, { role }),
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
      if (!editingUser) return;
      return updateStaff(editingUser.id, {
        role: userRole,
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

  function toggleRolePermission(role: UserRole, key: PermissionKey, checked: boolean) {
    const current = new Set(activePolicies[role]);
    if (checked) current.add(key);
    else current.delete(key);
    setPolicies({
      ...activePolicies,
      [role]: [...current],
    });
  }

  function openUserModal(user: StaffUser) {
    setEditingUser(user);
    setUserRole(user.role);
    const hasCustom = Boolean(user.customPolicies?.length);
    setUseCustomPolicies(hasCustom);
    setUserPolicies(
      hasCustom
        ? user.customPolicies!
        : activePolicies[user.role],
    );
    setUserModalOpen(true);
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
            Control what each role and user can access in the system
          </Text>
        </div>
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
                Permissions apply to all users with that role unless they have custom
                policies.
              </Text>
              <Group>
                <Button
                  variant="light"
                  color="gray"
                  leftSection={<IconRefresh size={16} />}
                  onClick={() => {
                    if (policiesQuery.data?.defaults) {
                      setPolicies(policiesQuery.data.defaults);
                    }
                  }}
                >
                  Reset to defaults
                </Button>
                <Button
                  color="green"
                  leftSection={<IconDeviceFloppy size={16} />}
                  loading={savePoliciesMutation.isPending}
                  onClick={() => savePoliciesMutation.mutate(activePolicies)}
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
                    {ROLES.map((role) => (
                      <Table.Th key={role} ta="center">
                        {roleLabel(role)}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {grouped.map(([group, items]) => (
                    <Fragment key={group}>
                      <Table.Tr>
                        <Table.Td colSpan={4}>
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
                          {ROLES.map((role) => (
                            <Table.Td key={`${item.key}-${role}`} ta="center">
                              <Checkbox
                                color="green"
                                checked={
                                  activePolicies?.[role]?.includes(item.key) ?? false
                                }
                                onChange={(e) =>
                                  toggleRolePermission(
                                    role,
                                    item.key,
                                    e.currentTarget.checked,
                                  )
                                }
                                aria-label={`${item.label} for ${roleLabel(role)}`}
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
                      w={170}
                      size="xs"
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: true, zIndex: 1000 }}
                      data={ROLE_SELECT_DATA}
                      value={user.role}
                      disabled={
                        roleMutation.isPending && roleMutation.variables?.id === user.id
                      }
                      onChange={(value) => {
                        if (!value || value === user.role) return;
                        roleMutation.mutate({
                          id: user.id,
                          role: value as UserRole,
                        });
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
            <SegmentedControl
              fullWidth
              color="green"
              value={userRole}
              data={ROLE_SELECT_DATA}
              onChange={(value) => {
                const role = value as UserRole;
                setUserRole(role);
                if (!useCustomPolicies) {
                  setUserPolicies(activePolicies[role]);
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
              if (!enabled) {
                setUserPolicies(activePolicies[userRole]);
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
              This user will use the {roleLabel(userRole)} role policies (
              {activePolicies[userRole]?.length ?? 0} permissions).
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
