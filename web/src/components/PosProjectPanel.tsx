import {
  ActionIcon,
  Box,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconCash, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  createProjectOrder,
  fetchCustomers,
  fetchOrder,
  recordProjectPayment,
  submitProjectOrder,
  updateProjectOrder,
} from "../lib/api";
import { localDateTimeToIso } from "../lib/datetime";
import { formatMoney } from "../lib/format";
import { projectBalanceDue, projectIsFullyPaid, projectPaidTotal } from "../lib/projectPayments";
import {
  PendingPartialPaymentFields,
  ProjectPartialPayments,
} from "./ProjectPartialPayments";
import { VendorAttachmentPicker } from "./VendorAttachmentPicker";
import type { CalendarEventType, PaymentMethod } from "../lib/types";

const SCHEDULE_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "SCHEDULED_ORDER", label: "Scheduled order" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "ACTIVITY", label: "Activity" },
  { value: "MEETING", label: "Meeting" },
  { value: "OTHER", label: "Other" },
];

type MaterialDraft = {
  key: string;
  description: string;
  vendor: string;
  quantity: number;
  unitCost: number;
};

function newMaterial(): MaterialDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    vendor: "",
    quantity: 1,
    unitCost: 0,
  };
}

export function PosProjectPanel() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editingOrderId = searchParams.get("edit");

  const [projectTitle, setProjectTitle] = useState("");
  const [materials, setMaterials] = useState<MaterialDraft[]>([newMaterial()]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [sellQuantity, setSellQuantity] = useState<number | "">(1);
  const [sellUnitPrice, setSellUnitPrice] = useState<number | "">(0);
  const [invoiceDiscountPercent, setInvoiceDiscountPercent] = useState<number | "">(0);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("10:00");
  const [scheduleType, setScheduleType] = useState<CalendarEventType>("SCHEDULED_ORDER");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [otherPayment, setOtherPayment] = useState<PaymentMethod>("DEBIT");
  const [showOtherPayments, setShowOtherPayments] = useState(false);
  const [partialAmount, setPartialAmount] = useState<number | "">("");
  const [loadingAction, setLoadingAction] = useState<
    "schedule" | "save" | "submit" | "partial" | null
  >(null);

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchCustomers(),
  });

  const editOrderQuery = useQuery({
    queryKey: ["order", editingOrderId],
    queryFn: () => fetchOrder(editingOrderId!),
    enabled: !!editingOrderId,
  });

  useEffect(() => {
    const order = editOrderQuery.data?.order;
    if (!order || order.status !== "OPEN" || order.orderType !== "PROJECT") return;

    setProjectTitle(order.projectTitle ?? "");
    setSellQuantity(order.projectSellQuantity ?? 1);
    setSellUnitPrice(order.projectSellUnitPrice ?? 0);
    setNotes(order.notes ?? "");
    setAttachmentKey(order.attachmentKey ?? null);
    setAttachmentPreview(order.attachmentUrl ?? null);
    setCustomerId(order.customer?.id ?? null);
    setCustomerName(order.customer?.name ?? "");
    setCustomerPhone(order.customer?.phone ?? "");
    setMaterials(
      (order.projectMaterials ?? []).length > 0
        ? (order.projectMaterials ?? []).map((line) => ({
            key: line.id,
            description: line.description,
            vendor: line.vendor,
            quantity: line.quantity,
            unitCost: line.unitCost,
          }))
        : [newMaterial()],
    );
  }, [editOrderQuery.data?.order]);

  const materialCostTotal = useMemo(
    () =>
      Math.round(
        materials.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) * 100,
      ) / 100,
    [materials],
  );

  const qty = sellQuantity === "" ? 1 : Math.max(Number(sellQuantity) || 1, 0.001);
  const unitPrice = sellUnitPrice === "" ? 0 : Math.max(Number(sellUnitPrice) || 0, 0);
  const sellGross = Math.round(qty * unitPrice * 100) / 100;

  const discountPercent =
    invoiceDiscountPercent === "" ? 0 : Math.min(100, Math.max(0, invoiceDiscountPercent));

  const invoiceDiscountAmount = useMemo(
    () => Math.round(sellGross * (discountPercent / 100) * 100) / 100,
    [sellGross, discountPercent],
  );

  const customerTotal = useMemo(
    () => Math.round(Math.max(sellGross - invoiceDiscountAmount, 0) * 100) / 100,
    [sellGross, invoiceDiscountAmount],
  );

  const margin = customerTotal - materialCostTotal;

  const updateMaterial = (key: string, patch: Partial<MaterialDraft>) => {
    setMaterials((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeMaterial = (key: string) => {
    setMaterials((rows) => rows.filter((row) => row.key !== key));
  };

  const resetForm = () => {
    setProjectTitle("");
    setMaterials([newMaterial()]);
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setAttachmentKey(null);
    setAttachmentPreview(null);
    setSellQuantity(1);
    setSellUnitPrice(0);
    setInvoiceDiscountPercent(0);
    setScheduleDate("");
    setScheduleTime("10:00");
    setScheduleType("SCHEDULED_ORDER");
    setPaymentMethod("CASH");
    setOtherPayment("DEBIT");
    setShowOtherPayments(false);
    setPartialAmount("");
  };

  const resolvedPartialPayment = () =>
    showOtherPayments ? otherPayment : paymentMethod;

  const recordPendingPartial = async (orderId: string) => {
    const amount = partialAmount === "" ? 0 : Number(partialAmount) || 0;
    if (amount <= 0) return null;

    if (amount > customerTotal) {
      throw new Error("Partial payment cannot exceed customer total");
    }

    const { order } = await recordProjectPayment(orderId, {
      amount,
      paymentMethod: resolvedPartialPayment(),
    });
    setPartialAmount("");
    return order;
  };

  const buildPayload = () => {
    const validMaterials = materials.filter(
      (line) => line.description.trim() && line.vendor.trim() && line.quantity > 0,
    );

    return {
      projectTitle: projectTitle.trim(),
      sellQuantity: qty,
      sellUnitPrice: unitPrice,
      materials:
        validMaterials.length > 0
          ? validMaterials.map((line) => ({
              description: line.description.trim(),
              vendor: line.vendor.trim(),
              quantity: line.quantity,
              unitCost: line.unitCost,
            }))
          : undefined,
      customerId: customerId ?? undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      attachmentKey,
      discountTotal: invoiceDiscountAmount > 0 ? invoiceDiscountAmount : undefined,
    };
  };

  const validateBase = () => {
    if (!projectTitle.trim()) {
      notifications.show({ color: "red", message: "Project title is required" });
      return false;
    }
    if (qty <= 0) {
      notifications.show({ color: "red", message: "Sell quantity must be greater than zero" });
      return false;
    }
    if (unitPrice < 0) {
      notifications.show({ color: "red", message: "Sell unit price cannot be negative" });
      return false;
    }
    return true;
  };

  const persistProject = async (scheduleAt?: string) => {
    const payload = {
      ...buildPayload(),
      ...(scheduleAt ? { scheduleAt, scheduleType } : {}),
    };

    if (editingOrderId) {
      return updateProjectOrder(editingOrderId, payload);
    }
    return createProjectOrder(payload);
  };

  const saveOpenProject = async () => {
    if (!validateBase()) return;

    setLoadingAction("save");
    try {
      const { order } = await persistProject();
      await recordPendingPartial(order.id);
      if (!editingOrderId) resetForm();
      notifications.show({
        color: "green",
        title: editingOrderId ? "Project saved" : "Open project created",
        message: `${order.orderNumber} saved — add more partial payments anytime`,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Could not save project",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const scheduleProject = async () => {
    if (!validateBase()) return;

    if (!scheduleDate) {
      notifications.show({ color: "red", message: "Pick a schedule date for the calendar" });
      return;
    }

    if (!customerPhone.trim()) {
      notifications.show({
        color: "red",
        message: "Customer phone is required for scheduled activities",
      });
      return;
    }

    if (!customerName.trim()) {
      notifications.show({
        color: "red",
        message: "Customer name is required for scheduled activities",
      });
      return;
    }

    setLoadingAction("schedule");
    try {
      const scheduleAt = localDateTimeToIso(scheduleDate, scheduleTime);
      const { order } = await persistProject(scheduleAt);
      await recordPendingPartial(order.id);

      if (!editingOrderId) resetForm();
      notifications.show({
        color: "green",
        title: editingOrderId ? "Project updated & scheduled" : "Project scheduled",
        message: `${order.orderNumber} is open on the calendar`,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Could not schedule project",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const submitProject = async () => {
    if (!validateBase()) return;

    setLoadingAction("submit");
    try {
      let orderId = editingOrderId ?? undefined;

      if (editingOrderId) {
        const { order: updated } = await updateProjectOrder(editingOrderId, buildPayload());
        orderId = updated.id;
      } else {
        const { order: created } = await createProjectOrder(buildPayload());
        orderId = created.id;
      }

      await recordPendingPartial(orderId!);

      const refreshed = await fetchOrder(orderId!);
      if (!projectIsFullyPaid(refreshed.order)) {
        notifications.show({
          color: "orange",
          message: `Balance due: ${formatMoney(projectBalanceDue(refreshed.order), store!.currency)}. Record more payments, then submit.`,
        });
        navigate(`/orders/${orderId}`);
        return;
      }

      const { order } = await submitProjectOrder(orderId!);

      resetForm();
      setSearchParams({});
      notifications.show({
        color: "green",
        title: "Project submitted",
        message: `${order.orderNumber} closed — ${formatMoney(projectPaidTotal(order), store!.currency)} collected`,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Could not submit project",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const editingOrder = editOrderQuery.data?.order;
  const pendingPayment = partialAmount === "" ? 0 : Math.max(0, Number(partialAmount) || 0);
  const recordedPayment = editingOrder ? projectPaidTotal(editingOrder) : 0;
  const projectedPaid = Math.round((recordedPayment + pendingPayment) * 100) / 100;
  const canCloseProject = projectedPaid === customerTotal;

  return (
    <GridLike
      left={
        <Stack gap="md">
          {editingOrderId ? (
            <Card withBorder padding="sm" radius="md" bg="blue.0">
              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Editing open project {editOrderQuery.data?.order.orderNumber}
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    resetForm();
                    setSearchParams({});
                  }}
                >
                  Cancel edit
                </Button>
              </Group>
            </Card>
          ) : null}
          <TextInput
            label="Project title"
            placeholder="e.g. Custom curtain 3m × 2m"
            required
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.currentTarget.value)}
          />

          <Select
            label="Customer (optional)"
            placeholder="Select existing customer"
            clearable
            searchable
            data={(customersQuery.data?.customers ?? []).map((c) => ({
              value: c.id,
              label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`,
            }))}
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              const customer = customersQuery.data?.customers.find((c) => c.id === id);
              if (customer) {
                setCustomerName(customer.name);
                setCustomerPhone(customer.phone ?? "");
              } else if (!id) {
                setCustomerName("");
                setCustomerPhone("");
              }
            }}
          />

          <Group grow>
            <TextInput
              label="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
            />
            <TextInput
              label="Phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.currentTarget.value)}
            />
          </Group>

          <Divider
            label="Raw materials (internal cost only)"
            labelPosition="left"
          />

          <Text size="sm" c="dimmed">
            Material costs are tracked for your margin — they do not set the customer price.
          </Text>

          <Stack gap="sm">
            {materials.map((line, index) => (
              <Card key={line.key} withBorder padding="sm" radius="md">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>
                    Material {index + 1}
                  </Text>
                  <ActionIcon color="red" variant="subtle" onClick={() => removeMaterial(line.key)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <Stack gap="xs">
                  <TextInput
                    label="Material / description"
                    value={line.description}
                    onChange={(e) =>
                      updateMaterial(line.key, { description: e.currentTarget.value })
                    }
                  />
                  <TextInput
                    label="Vendor / supplier"
                    value={line.vendor}
                    onChange={(e) => updateMaterial(line.key, { vendor: e.currentTarget.value })}
                  />
                  <Group grow align="flex-end">
                    <NumberInput
                      label="Quantity"
                      min={0.001}
                      decimalScale={3}
                      value={line.quantity}
                      onChange={(v) => updateMaterial(line.key, { quantity: Number(v) || 0 })}
                    />
                    <NumberInput
                      label="Unit cost"
                      min={0}
                      decimalScale={2}
                      value={line.unitCost}
                      onChange={(v) => updateMaterial(line.key, { unitCost: Number(v) || 0 })}
                    />
                    <Box>
                      <Text size="xs" c="dimmed" mb={4}>
                        Cost total
                      </Text>
                      <Text fw={600}>
                        {formatMoney(line.quantity * line.unitCost, store!.currency)}
                      </Text>
                    </Box>
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>

          <Button
            variant="light"
            color="green"
            leftSection={<IconPlus size={16} />}
            onClick={() => setMaterials((rows) => [...rows, newMaterial()])}
          >
            Add material
          </Button>

          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            minRows={2}
          />

          <VendorAttachmentPicker
            previewUrl={attachmentPreview}
            onUploaded={(key, previewUrl) => {
              setAttachmentKey(key);
              setAttachmentPreview(previewUrl);
            }}
            onClear={() => {
              setAttachmentKey(null);
              setAttachmentPreview(null);
            }}
          />
        </Stack>
      }
      right={
        <Card withBorder padding="md" radius="md" style={{ position: "sticky", top: 80 }}>
          <Title order={4} mb="sm">
            Customer price
          </Title>

          <Stack gap="sm" mb="md">
            <Group grow>
              <NumberInput
                label="Quantity"
                min={0.001}
                decimalScale={3}
                value={sellQuantity}
                onChange={(v) => setSellQuantity(v === "" ? "" : Number(v) || 1)}
              />
              <NumberInput
                label="Unit price"
                min={0}
                decimalScale={2}
                value={sellUnitPrice}
                onChange={(v) => setSellUnitPrice(v === "" ? "" : Number(v) || 0)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Price subtotal
              </Text>
              <Text size="sm">{formatMoney(sellGross, store!.currency)}</Text>
            </Group>

            <NumberInput
              label="Discount on customer price (%)"
              min={0}
              max={100}
              decimalScale={1}
              suffix="%"
              value={invoiceDiscountPercent}
              onChange={(v) => setInvoiceDiscountPercent(v === "" ? "" : Number(v) || 0)}
            />

            <Group justify="space-between">
              <Text fw={700}>Customer total</Text>
              <Text fw={700} c="green" size="lg">
                {formatMoney(customerTotal, store!.currency)}
              </Text>
            </Group>

            <Divider label="Partial payments" labelPosition="center" />

            {editingOrderId && editingOrder ? (
              <ProjectPartialPayments
                order={editingOrder}
                currency={store!.currency}
                onUpdated={() => editOrderQuery.refetch()}
              />
            ) : (
              <PendingPartialPaymentFields
                currency={store!.currency}
                customerTotal={customerTotal}
                partialAmount={partialAmount}
                onPartialAmountChange={setPartialAmount}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                otherPayment={otherPayment}
                onOtherPaymentChange={setOtherPayment}
                showOtherPayments={showOtherPayments}
                onShowOtherPaymentsChange={setShowOtherPayments}
              />
            )}

            {editingOrderId && editingOrder ? (
              <Text size="xs" c="dimmed">
                Save changes below after updating project details. Partial payments are recorded
                immediately.
              </Text>
            ) : null}

            <Divider />

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Material cost (internal)
              </Text>
              <Text size="sm">{formatMoney(materialCostTotal, store!.currency)}</Text>
            </Group>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Estimated margin
              </Text>
              <Text size="sm" c={margin >= 0 ? "teal" : "red"}>
                {formatMoney(margin, store!.currency)}
              </Text>
            </Group>
          </Stack>

          <Divider my="md" label="Schedule" labelPosition="center" />

          <Stack gap="sm" mb="md">
            <Group grow>
              <TextInput
                label="Date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.currentTarget.value)}
              />
              <TextInput
                label="Time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.currentTarget.value)}
              />
            </Group>
            <Select
              label="Activity type"
              data={SCHEDULE_TYPES}
              value={scheduleType}
              onChange={(v) => setScheduleType((v as CalendarEventType) ?? "SCHEDULED_ORDER")}
            />
          {editingOrderId ? (
            <Button
              variant="default"
              fullWidth
              loading={loadingAction === "save"}
              onClick={saveOpenProject}
            >
              Save changes
            </Button>
          ) : (
            <Button
              variant="default"
              fullWidth
              loading={loadingAction === "save"}
              onClick={saveOpenProject}
            >
              Save open project
            </Button>
          )}
          <Button
            variant="light"
            color="blue"
            leftSection={<IconCalendar size={16} />}
            loading={loadingAction === "schedule"}
            onClick={scheduleProject}
          >
            {editingOrderId ? "Update & schedule" : "Schedule project"}
          </Button>
            <Text size="xs" c="dimmed">
              The project stays on the calendar, including after it is closed.
            </Text>
          </Stack>

          <Divider my="md" label="Close project" labelPosition="center" />

          <Text size="sm" c="dimmed" mb="md">
            {canCloseProject
              ? "Payments equal the customer price. Submit to close this project."
              : `Payments must equal the customer price before closing. Recorded ${formatMoney(projectedPaid, store!.currency)} of ${formatMoney(customerTotal, store!.currency)}.`}
          </Text>

          <Button
            color="green"
            fullWidth
            leftSection={<IconCash size={16} />}
            loading={loadingAction === "submit"}
            disabled={!canCloseProject}
            onClick={submitProject}
          >
            Submit project
          </Button>
        </Card>
      }
    />
  );
}

function GridLike({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 16,
      }}
      className="pos-project-grid"
    >
      <style>{`
        @media (min-width: 62em) {
          .pos-project-grid {
            grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
          }
        }
      `}</style>
      {left}
      {right}
    </Box>
  );
}
