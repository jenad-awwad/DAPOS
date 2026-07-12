import { useEffect } from "react";
import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useIsAdmin } from "../hooks/useRoles";
import { fetchStore, updateStore } from "../lib/api";
import { formatDate, roleLabel } from "../lib/format";
import type { Currency } from "../lib/types";

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["store"],
    queryFn: fetchStore,
  });

  const form = useForm({
    initialValues: {
      name: "",
      address: "",
      phone: "",
      currency: "ILS" as Currency,
      taxRate: 0,
    },
  });

  useEffect(() => {
    if (data?.store) {
      form.setValues({
        name: data.store.name,
        address: data.store.address ?? "",
        phone: data.store.phone ?? "",
        currency: data.store.currency,
        taxRate: data.store.taxRate,
      });
    }
  }, [data?.store]);

  const saveMutation = useMutation({
    mutationFn: updateStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store"] });
      notifications.show({ color: "green", message: "Store settings saved" });
    },
    onError: (err: Error) => notifications.show({ color: "red", message: err.message }),
  });

  if (isLoading) return <Loader color="green" />;

  const store = data?.store;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Settings</Title>
        <Text c="dimmed">Store profile and account information</Text>
      </div>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Title order={4} mb="md">
              Store
            </Title>
            {isAdmin ? (
              <form onSubmit={form.onSubmit((v) => saveMutation.mutate({
                name: v.name,
                address: v.address || null,
                phone: v.phone || null,
                currency: v.currency,
                taxRate: 0,
              }))}>
                <Stack gap="sm">
                  <TextInput label="Name" required {...form.getInputProps("name")} />
                  <TextInput label="Address" {...form.getInputProps("address")} />
                  <TextInput label="Phone" {...form.getInputProps("phone")} />
                  <Select
                    label="Currency"
                    data={(data?.currencies ?? []).map((c) => ({ value: c, label: c }))}
                    {...form.getInputProps("currency")}
                  />
                  <Button type="submit" color="green" loading={saveMutation.isPending}>
                    Save store settings
                  </Button>
                </Stack>
              </form>
            ) : (
              <Stack gap="sm">
                <SettingRow label="Name" value={store?.name} />
                <SettingRow label="Address" value={store?.address ?? "—"} />
                <SettingRow label="Phone" value={store?.phone ?? "—"} />
                <SettingRow
                  label="Currency"
                  value={store?.currency}
                />
              </Stack>
            )}
            <Text size="xs" c="dimmed" mt="md">
              Created {formatDate(store?.createdAt)}
            </Text>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="lg" radius="md">
            <Title order={4} mb="md">
              Your account
            </Title>
            <Stack gap="sm">
              <SettingRow label="Name" value={user?.name} />
              <SettingRow label="Phone" value={user?.phone} />
              <Group gap="xs">
                <Text size="sm" c="dimmed" w={120}>
                  Role
                </Text>
                <Badge variant="light" color="blue">
                  {user ? roleLabel(user.role) : "—"}
                </Badge>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function SettingRow({ label, value }: { label: string; value?: string }) {
  return (
    <Group align="flex-start" wrap="nowrap">
      <Text size="sm" c="dimmed" w={120}>
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value ?? "—"}
      </Text>
    </Group>
  );
}
