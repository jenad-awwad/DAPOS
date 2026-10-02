import {
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconFileSpreadsheet, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { VendorAttachmentPicker } from "../components/VendorAttachmentPicker";
import { useAuth } from "../context/AuthContext";
import {
  createVendor,
  createVendorInvoice,
  createVendorPayment,
  fetchVendorBalances,
  fetchVendorInvoices,
  fetchVendorOptions,
  fetchVendorPayments,
} from "../lib/api";
import { formatDateOnly, formatMoney } from "../lib/format";
import {
  exportVendorBalancesToExcel,
  exportVendorInvoicesToExcel,
  exportVendorPaymentsToExcel,
} from "../lib/exportVendors";
import { userCanAccess } from "../lib/permissions";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function VendorsPage() {
  const { user, store } = useAuth();
  const queryClient = useQueryClient();
  const canViewBalances = userCanAccess(user, ["vendors.view", "vendors.manage"]);
  const canRecord = userCanAccess(user, ["vendors.record", "vendors.manage"]);
  const canManage = userCanAccess(user, "vendors.manage");

  const hasAccess = canViewBalances || canRecord;
  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  const vendorOptionsQuery = useQuery({
    queryKey: ["vendors", "options"],
    queryFn: fetchVendorOptions,
  });

  const invoicesQuery = useQuery({
    queryKey: ["vendors", "invoices"],
    queryFn: fetchVendorInvoices,
  });

  const paymentsQuery = useQuery({
    queryKey: ["vendors", "payments"],
    queryFn: fetchVendorPayments,
  });

  const balancesQuery = useQuery({
    queryKey: ["vendors", "balances"],
    queryFn: fetchVendorBalances,
    enabled: canViewBalances,
  });

  const vendorSelectData = useMemo(
    () =>
      (vendorOptionsQuery.data?.vendors ?? []).map((v) => ({
        value: v.id,
        label: v.name,
      })),
    [vendorOptionsQuery.data],
  );

  const [invoiceOpened, invoiceHandlers] = useDisclosure(false);
  const [paymentOpened, paymentHandlers] = useDisclosure(false);
  const [vendorOpened, vendorHandlers] = useDisclosure(false);

  const invoiceForm = useForm({
    initialValues: {
      vendorId: "",
      vendorName: "",
      invoiceDate: todayIsoDate(),
      invoiceNumber: "",
      invoiceNumberAuto: true,
      total: "" as number | "",
      attachmentKey: null as string | null,
    },
  });
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);

  const paymentForm = useForm({
    initialValues: {
      vendorId: "",
      vendorName: "",
      paidAt: todayIsoDate(),
      amount: "" as number | "",
      attachmentKey: null as string | null,
    },
  });
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null);

  const vendorForm = useForm({
    initialValues: {
      name: "",
      startingBalance: 0,
    },
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["vendors"] });
  };

  const invoiceMutation = useMutation({
    mutationFn: createVendorInvoice,
    onSuccess: () => {
      notifications.show({ color: "green", message: "Invoice saved" });
      invoiceHandlers.close();
      invoiceForm.reset();
      setInvoicePreview(null);
      invalidateAll();
    },
    onError: (err: Error) => {
      notifications.show({ color: "red", message: err.message });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: createVendorPayment,
    onSuccess: () => {
      notifications.show({ color: "green", message: "Payment saved" });
      paymentHandlers.close();
      paymentForm.reset();
      setPaymentPreview(null);
      invalidateAll();
    },
    onError: (err: Error) => {
      notifications.show({ color: "red", message: err.message });
    },
  });

  const vendorMutation = useMutation({
    mutationFn: createVendor,
    onSuccess: () => {
      notifications.show({ color: "green", message: "Vendor added" });
      vendorHandlers.close();
      vendorForm.reset();
      invalidateAll();
    },
    onError: (err: Error) => {
      notifications.show({ color: "red", message: err.message });
    },
  });

  const submitInvoice = invoiceForm.onSubmit((values) => {
    const total = typeof values.total === "number" ? values.total : Number(values.total);
    if (!total || total <= 0) {
      notifications.show({ color: "red", message: "Enter invoice total" });
      return;
    }

    invoiceMutation.mutate({
      vendorId: values.vendorId || undefined,
      vendorName: values.vendorId ? undefined : values.vendorName.trim(),
      invoiceDate: values.invoiceDate,
      invoiceNumber: values.invoiceNumberAuto ? undefined : values.invoiceNumber.trim(),
      invoiceNumberAuto: values.invoiceNumberAuto,
      total,
      attachmentKey: values.attachmentKey,
    });
  });

  const submitPayment = paymentForm.onSubmit((values) => {
    const amount =
      typeof values.amount === "number" ? values.amount : Number(values.amount);
    if (!amount || amount <= 0) {
      notifications.show({ color: "red", message: "Enter payment amount" });
      return;
    }

    paymentMutation.mutate({
      vendorId: values.vendorId || undefined,
      vendorName: values.vendorId ? undefined : values.vendorName.trim(),
      paidAt: values.paidAt,
      amount,
      attachmentKey: values.attachmentKey,
    });
  });

  const currency = store?.currency ?? "USD";

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Vendors</Title>
          <Text c="dimmed" size="sm">
            Invoices, payments, and balances linked to project suppliers.
          </Text>
        </div>
      </Group>

      <Tabs defaultValue="invoices">
        <Tabs.List>
          <Tabs.Tab value="invoices">Invoices</Tabs.Tab>
          <Tabs.Tab value="payments">Vendor payments</Tabs.Tab>
          {canViewBalances ? <Tabs.Tab value="balances">Balance</Tabs.Tab> : null}
        </Tabs.List>

        <Tabs.Panel value="invoices" pt="md">
          <Group justify="flex-end" mb="md">
            <Button
              variant="light"
              color="gray"
              leftSection={<IconFileSpreadsheet size={16} />}
              onClick={() => {
                try {
                  exportVendorInvoicesToExcel(
                    invoicesQuery.data?.invoices ?? [],
                    canViewBalances,
                  );
                  notifications.show({
                    color: "green",
                    message: "Excel file downloaded",
                  });
                } catch (err) {
                  notifications.show({
                    color: "red",
                    message:
                      err instanceof Error
                        ? err.message
                        : "Could not export Excel",
                  });
                }
              }}
            >
              Export Excel
            </Button>
            {canRecord ? (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={invoiceHandlers.open}
              >
                Add invoice
              </Button>
            ) : null}
          </Group>
          {invoicesQuery.isLoading ? (
            <Loader />
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Vendor</Table.Th>
                  <Table.Th>Invoice #</Table.Th>
                  {canViewBalances ? <Table.Th>Total</Table.Th> : null}
                  <Table.Th>Attachment</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(invoicesQuery.data?.invoices ?? []).map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>{formatDateOnly(row.invoiceDate)}</Table.Td>
                    <Table.Td>{row.vendor.name}</Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        {row.invoiceNumber}
                        {row.source === "PROJECT" ? (
                          <Badge size="xs" variant="light">
                            Project
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    {canViewBalances ? (
                      <Table.Td>{formatMoney(row.total, currency)}</Table.Td>
                    ) : null}
                    <Table.Td>
                      {row.attachmentUrl ? (
                        <Anchor href={row.attachmentUrl} target="_blank" rel="noreferrer">
                          View
                        </Anchor>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="payments" pt="md">
          <Group justify="flex-end" mb="md">
            <Button
              variant="light"
              color="gray"
              leftSection={<IconFileSpreadsheet size={16} />}
              onClick={() => {
                try {
                  exportVendorPaymentsToExcel(
                    paymentsQuery.data?.payments ?? [],
                    canViewBalances,
                  );
                  notifications.show({
                    color: "green",
                    message: "Excel file downloaded",
                  });
                } catch (err) {
                  notifications.show({
                    color: "red",
                    message:
                      err instanceof Error
                        ? err.message
                        : "Could not export Excel",
                  });
                }
              }}
            >
              Export Excel
            </Button>
            {canRecord ? (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={paymentHandlers.open}
              >
                Add payment
              </Button>
            ) : null}
          </Group>
          {paymentsQuery.isLoading ? (
            <Loader />
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Vendor</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  {canViewBalances ? <Table.Th>Remaining balance</Table.Th> : null}
                  <Table.Th>Attachment</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(paymentsQuery.data?.payments ?? []).map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>{formatDateOnly(row.paidAt)}</Table.Td>
                    <Table.Td>{row.vendor.name}</Table.Td>
                    <Table.Td>{formatMoney(row.amount, currency)}</Table.Td>
                    {canViewBalances ? (
                      <Table.Td>
                        {formatMoney(row.remainingBalance, currency)}
                      </Table.Td>
                    ) : null}
                    <Table.Td>
                      {row.attachmentUrl ? (
                        <Anchor href={row.attachmentUrl} target="_blank" rel="noreferrer">
                          View
                        </Anchor>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        {canViewBalances ? (
          <Tabs.Panel value="balances" pt="md">
            <Group justify="flex-end" mb="md">
              <Button
                variant="light"
                color="gray"
                leftSection={<IconFileSpreadsheet size={16} />}
                onClick={() => {
                  try {
                    exportVendorBalancesToExcel(
                      balancesQuery.data?.balances ?? [],
                    );
                    notifications.show({
                      color: "green",
                      message: "Excel file downloaded",
                    });
                  } catch (err) {
                    notifications.show({
                      color: "red",
                      message:
                        err instanceof Error
                          ? err.message
                          : "Could not export Excel",
                    });
                  }
                }}
              >
                Export Excel
              </Button>
              {canManage ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={vendorHandlers.open}
                >
                  Add vendor
                </Button>
              ) : null}
            </Group>
            {balancesQuery.isLoading ? (
              <Loader />
            ) : (
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Vendor</Table.Th>
                    <Table.Th>Starting balance</Table.Th>
                    <Table.Th>Invoices</Table.Th>
                    <Table.Th>Payments</Table.Th>
                    <Table.Th>Current balance</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(balancesQuery.data?.balances ?? []).map((row) => (
                    <Table.Tr key={row.vendorId}>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>{formatMoney(row.startingBalance, currency)}</Table.Td>
                      <Table.Td>{formatMoney(row.invoiceTotal, currency)}</Table.Td>
                      <Table.Td>{formatMoney(row.paymentTotal, currency)}</Table.Td>
                      <Table.Td fw={600}>
                        {formatMoney(row.currentBalance, currency)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Text size="xs" c="dimmed" mt="sm">
              Starting balance is set when the vendor is created and cannot be changed
              later. Project material costs appear as project invoices automatically.
            </Text>
          </Tabs.Panel>
        ) : null}
      </Tabs>

      <Modal opened={invoiceOpened} onClose={invoiceHandlers.close} title="Add invoice" size="lg">
        <form onSubmit={submitInvoice}>
          <Stack>
            <Select
              label="Vendor"
              placeholder="Choose vendor"
              data={vendorSelectData}
              clearable
              searchable
              value={invoiceForm.values.vendorId || null}
              onChange={(value) => {
                invoiceForm.setFieldValue("vendorId", value ?? "");
                if (value) invoiceForm.setFieldValue("vendorName", "");
              }}
            />
            {!invoiceForm.values.vendorId ? (
              <TextInput
                label="Or new vendor name"
                {...invoiceForm.getInputProps("vendorName")}
              />
            ) : null}
            <TextInput
              type="date"
              label="Date"
              {...invoiceForm.getInputProps("invoiceDate")}
            />
            <Switch
              label="Auto-generate invoice number"
              checked={invoiceForm.values.invoiceNumberAuto}
              onChange={(e) =>
                invoiceForm.setFieldValue("invoiceNumberAuto", e.currentTarget.checked)
              }
            />
            {!invoiceForm.values.invoiceNumberAuto ? (
              <TextInput
                label="Invoice number"
                {...invoiceForm.getInputProps("invoiceNumber")}
              />
            ) : null}
            <NumberInput
              label="Invoice total"
              min={0}
              decimalScale={2}
              {...invoiceForm.getInputProps("total")}
            />
            <VendorAttachmentPicker
              previewUrl={invoicePreview}
              onUploaded={(key, preview) => {
                invoiceForm.setFieldValue("attachmentKey", key);
                setInvoicePreview(preview);
              }}
              onClear={() => {
                invoiceForm.setFieldValue("attachmentKey", null);
                setInvoicePreview(null);
              }}
            />
            <Button type="submit" loading={invoiceMutation.isPending}>
              Save invoice
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={paymentOpened} onClose={paymentHandlers.close} title="Add payment" size="lg">
        <form onSubmit={submitPayment}>
          <Stack>
            <Select
              label="Vendor"
              placeholder="Choose vendor"
              data={vendorSelectData}
              clearable
              searchable
              value={paymentForm.values.vendorId || null}
              onChange={(value) => {
                paymentForm.setFieldValue("vendorId", value ?? "");
                if (value) paymentForm.setFieldValue("vendorName", "");
              }}
            />
            {!paymentForm.values.vendorId ? (
              <TextInput
                label="Or new vendor name"
                {...paymentForm.getInputProps("vendorName")}
              />
            ) : null}
            <TextInput
              type="date"
              label="Date"
              {...paymentForm.getInputProps("paidAt")}
            />
            <NumberInput
              label="Payment amount"
              min={0}
              decimalScale={2}
              {...paymentForm.getInputProps("amount")}
            />
            <VendorAttachmentPicker
              previewUrl={paymentPreview}
              onUploaded={(key, preview) => {
                paymentForm.setFieldValue("attachmentKey", key);
                setPaymentPreview(preview);
              }}
              onClear={() => {
                paymentForm.setFieldValue("attachmentKey", null);
                setPaymentPreview(null);
              }}
            />
            <Button type="submit" loading={paymentMutation.isPending}>
              Save payment
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={vendorOpened} onClose={vendorHandlers.close} title="Add vendor">
        <form
          onSubmit={vendorForm.onSubmit((values) => {
            vendorMutation.mutate(values);
          })}
        >
          <Stack>
            <TextInput label="Vendor name" required {...vendorForm.getInputProps("name")} />
            <NumberInput
              label="Starting balance"
              description="Set once now — it cannot be edited later."
              min={0}
              decimalScale={2}
              {...vendorForm.getInputProps("startingBalance")}
            />
            <Button type="submit" loading={vendorMutation.isPending}>
              Create vendor
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
