import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandWhatsapp, IconCalendar, IconCash, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useHasPermission } from "../hooks/usePermissions";
import {
  createProjectOrder,
  fetchCustomers,
  fetchOrder,
  recordProjectPayment,
  submitProjectOrder,
  updateProjectOrder,
} from "../lib/api";
import { customerInvoiceText, whatsAppShareUrl } from "../lib/customerInvoice";
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
  const canReviewIntake = useHasPermission("pos.projects.intake.view");
  const canEditIntake = useHasPermission("pos.projects.intake.edit");
  const canReviewMaterials = useHasPermission("pos.projects.materials.view");
  const canEditMaterials = useHasPermission("pos.projects.materials.edit");
  const canSetMaterialPrice = useHasPermission("pos.projects.materials.price");
  const canReviewPricing = useHasPermission("pos.projects.pricing.view");
  const canEditPricing = useHasPermission("pos.projects.pricing.edit");
  const phaseAllowed = [canReviewIntake, canReviewMaterials, canReviewPricing];
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
  const [phase, setPhase] = useState(0);
  const loadedMaterialIds = useRef(new Set<string>());

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
    const lines = order.projectMaterials ?? [];
    loadedMaterialIds.current = new Set(lines.map((line) => line.id));
    setMaterials(
      lines.length > 0
        ? lines.map((line) => ({
            key: line.id,
            description: line.description,
            vendor: line.vendor,
            quantity: line.quantity,
            unitCost: line.unitCost,
          }))
        : [newMaterial()],
    );
    const gross = (order.projectSellQuantity ?? 1) * (order.projectSellUnitPrice ?? 0);
    const discount = order.discountTotal ?? 0;
    setInvoiceDiscountPercent(
      gross > 0 ? Math.round((discount / gross) * 1000) / 10 : 0,
    );
  }, [editOrderQuery.data?.order]);

  useEffect(() => {
    const allowed = [canReviewIntake, canReviewMaterials, canReviewPricing];
    if (!allowed[phase]) {
      const next = allowed.findIndex(Boolean);
      if (next >= 0) setPhase(next);
    }
  }, [phase, canReviewIntake, canReviewMaterials, canReviewPricing]);

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
    loadedMaterialIds.current = new Set();
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

  const buildPayload = (scheduleAt?: string) => {
    const validMaterials = materials.filter(
      (line) => line.description.trim() && line.vendor.trim() && line.quantity > 0,
    );

    return {
      ...(canEditIntake
        ? {
            projectTitle: projectTitle.trim(),
            customerId: customerId ?? undefined,
            customerName: customerName.trim() || undefined,
            customerPhone: customerPhone.trim() || undefined,
            notes: notes.trim() || undefined,
            attachmentKey,
          }
        : {}),
      ...(canEditMaterials || canSetMaterialPrice
        ? {
            materials: validMaterials.map((line) => ({
              ...(loadedMaterialIds.current.has(line.key) ? { id: line.key } : {}),
              description: line.description.trim(),
              vendor: line.vendor.trim(),
              quantity: line.quantity,
              unitCost: canSetMaterialPrice ? line.unitCost : 0,
            })),
          }
        : {}),
      ...(canEditPricing
        ? {
            sellQuantity: qty,
            sellUnitPrice: unitPrice,
            discountTotal: invoiceDiscountAmount,
            ...(scheduleAt ? { scheduleAt, scheduleType } : {}),
          }
        : {}),
    };
  };

  const validateBase = (options?: { schedule?: boolean }) => {
    if (!editingOrderId && !canEditIntake) {
      notifications.show({
        color: "red",
        message: "You do not have permission to create a project",
      });
      return false;
    }
    if (canEditIntake && !projectTitle.trim()) {
      notifications.show({ color: "red", message: "Project title is required" });
      return false;
    }
    if (canEditPricing && qty <= 0) {
      notifications.show({ color: "red", message: "Sell quantity must be greater than zero" });
      return false;
    }
    if (canEditPricing && unitPrice < 0) {
      notifications.show({ color: "red", message: "Sell unit price cannot be negative" });
      return false;
    }
    if (options?.schedule) {
      if (!canEditPricing) {
        notifications.show({
          color: "red",
          message: "You do not have permission to schedule this project",
        });
        return false;
      }
      if (!scheduleDate) {
        notifications.show({ color: "red", message: "Pick a schedule date for the calendar" });
        return false;
      }
      if (!customerPhone.trim()) {
        notifications.show({
          color: "red",
          message: "Customer phone is required for scheduled activities",
        });
        return false;
      }
      if (!customerName.trim()) {
        notifications.show({
          color: "red",
          message: "Customer name is required for scheduled activities",
        });
        return false;
      }
    }
    return true;
  };

  const persistProject = async (scheduleAt?: string) => {
    const payload = buildPayload(scheduleAt);

    if (editingOrderId) {
      return updateProjectOrder(editingOrderId, payload);
    }
    return createProjectOrder({
      projectTitle: projectTitle.trim(),
      sellQuantity: 1,
      sellUnitPrice: 0,
      ...payload,
    });
  };

  const saveOpenProject = async () => {
    if (!validateBase()) return;

    setLoadingAction("save");
    try {
      const { order } = await persistProject();
      if (canEditPricing) await recordPendingPartial(order.id);
      if (!editingOrderId) {
        setSearchParams({ edit: order.id });
      } else {
        await editOrderQuery.refetch();
      }
      const movedOn = phase < 2 && phaseAllowed.slice(phase + 1).some(Boolean);
      if (movedOn) goToPhase(1);
      notifications.show({
        color: "green",
        title: "Project saved",
        message: movedOn
          ? `${order.orderNumber} saved. Continue with the next phase.`
          : `${order.orderNumber} saved.`,
      });
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
    if (!validateBase({ schedule: true })) return;

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
    if (!canEditPricing) return;
    if (!validateBase()) return;

    setLoadingAction("submit");
    try {
      const { order: saved } = await persistProject();
      const orderId = saved.id;

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
  const canSave = editingOrderId
    ? canEditIntake || canEditMaterials || canSetMaterialPrice || canEditPricing
    : canEditIntake;

  const goToPhase = (dir: -1 | 1) => {
    for (let index = phase + dir; index >= 0 && index < phaseAllowed.length; index += dir) {
      if (phaseAllowed[index]) {
        setPhase(index);
        return;
      }
    }
  };

  if (!phaseAllowed.some(Boolean)) {
    return (
      <Text c="dimmed">
        You can open Projects, but you do not have permission to review any phase.
      </Text>
    );
  }

  const saveButton = canSave ? (
    <Button
      variant="default"
      loading={loadingAction === "save"}
      onClick={saveOpenProject}
    >
      {editingOrderId ? "Save changes" : "Save open project"}
    </Button>
  ) : null;

  return (
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

      <Stepper
        active={phase}
        onStepClick={(step) => {
          if (phaseAllowed[step]) setPhase(step);
        }}
      >
        <Stepper.Step label="1. Project details" description="Title, customer, phone, picture" />
        <Stepper.Step label="2. Materials" description="Lines and material prices" />
        <Stepper.Step label="3. Price and schedule" description="Customer price" />
      </Stepper>

      {phase === 0 ? (
        <Stack gap="md">
          {canReviewIntake ? (
            <>
              {!canEditIntake ? (
                <Badge variant="light" color="gray">
                  Review only
                </Badge>
              ) : null}
              <TextInput
                label="Project title"
                placeholder="e.g. Custom curtain 3m × 2m"
                required
                disabled={!canEditIntake}
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.currentTarget.value)}
              />
              <Select
                label="Customer"
                placeholder="Select existing customer"
                clearable
                searchable
                disabled={!canEditIntake}
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
                  disabled={!canEditIntake}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.currentTarget.value)}
                />
                <TextInput
                  label="Phone"
                  disabled={!canEditIntake}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.currentTarget.value)}
                />
              </Group>
              <Textarea
                label="Notes"
                disabled={!canEditIntake}
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                minRows={2}
              />
              <VendorAttachmentPicker
                readOnly={!canEditIntake}
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
              <Group justify="space-between">
                {saveButton}
                <Button variant="light" onClick={() => goToPhase(1)} disabled={!phaseAllowed[1] && !phaseAllowed[2]}>
                  Next
                </Button>
              </Group>
            </>
          ) : (
            <Text c="dimmed">You do not have permission to review project details.</Text>
          )}
        </Stack>
      ) : null}

      {phase === 1 ? (
        <Stack gap="md">
          {canReviewMaterials ? (
            <>
              {!canEditMaterials && !canSetMaterialPrice ? (
                <Badge variant="light" color="gray">
                  Review only
                </Badge>
              ) : null}
              <Text size="sm" c="dimmed">
                {canSetMaterialPrice
                  ? "Material prices are internal. They do not set the customer price."
                  : canEditMaterials
                    ? "You can add materials. Unit prices stay unchanged."
                    : "Material lines are shown for review."}
              </Text>
              {materials.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No materials yet.
                </Text>
              ) : null}
              <Stack gap="sm">
                {materials.map((line, index) => (
                  <Card key={line.key} withBorder padding="sm" radius="md">
                    <Group justify="space-between" mb="xs">
                      <Text size="sm" fw={600}>
                        Material {index + 1}
                      </Text>
                      {canEditMaterials ? (
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => removeMaterial(line.key)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      ) : null}
                    </Group>
                    <Stack gap="xs">
                      <TextInput
                        label="Material / description"
                        disabled={!canEditMaterials}
                        value={line.description}
                        onChange={(e) =>
                          updateMaterial(line.key, { description: e.currentTarget.value })
                        }
                      />
                      <TextInput
                        label="Vendor / supplier"
                        disabled={!canEditMaterials}
                        value={line.vendor}
                        onChange={(e) => updateMaterial(line.key, { vendor: e.currentTarget.value })}
                      />
                      <Group grow align="flex-end">
                        <NumberInput
                          label="Quantity"
                          min={0.001}
                          decimalScale={3}
                          disabled={!canEditMaterials}
                          value={line.quantity}
                          onChange={(v) => updateMaterial(line.key, { quantity: Number(v) || 0 })}
                        />
                        <NumberInput
                          label="Unit price"
                          min={0}
                          decimalScale={2}
                          disabled={!canSetMaterialPrice}
                          value={line.unitCost}
                          onChange={(v) =>
                            updateMaterial(line.key, { unitCost: Number(v) || 0 })
                          }
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
              {canEditMaterials ? (
                <Button
                  variant="light"
                  color="green"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setMaterials((rows) => [...rows, newMaterial()])}
                >
                  Add material
                </Button>
              ) : null}
              <Group justify="space-between">
                <Button variant="default" onClick={() => goToPhase(-1)}>
                  Back
                </Button>
                <Group>
                  {saveButton}
                  <Button variant="light" onClick={() => goToPhase(1)} disabled={!phaseAllowed[2]}>
                    Next
                  </Button>
                </Group>
              </Group>
            </>
          ) : (
            <Text c="dimmed">You do not have permission to review materials.</Text>
          )}
        </Stack>
      ) : null}

      {phase === 2 ? (
        <Card withBorder padding="md" radius="md">
          {canReviewPricing ? (
            <Stack gap="sm">
              {!canEditPricing ? (
                <Badge variant="light" color="gray">
                  Review only
                </Badge>
              ) : null}
              <Title order={4}>Customer price</Title>
              <Group grow>
                <NumberInput
                  label="Quantity"
                  min={0.001}
                  decimalScale={3}
                  disabled={!canEditPricing}
                  value={sellQuantity}
                  onChange={(v) => setSellQuantity(v === "" ? "" : Number(v) || 1)}
                />
                <NumberInput
                  label="Unit price"
                  min={0}
                  decimalScale={2}
                  disabled={!canEditPricing}
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
                disabled={!canEditPricing}
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
                  readOnly={!canEditPricing}
                  onUpdated={() => editOrderQuery.refetch()}
                />
              ) : canEditPricing ? (
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
              ) : (
                <Text size="sm" c="dimmed">
                  Payments can be added by someone who can edit this phase.
                </Text>
              )}

              {editingOrder ? (
                <Button
                  variant="light"
                  color="green"
                  leftSection={<IconBrandWhatsapp size={16} />}
                  onClick={() => {
                    const phone = customerPhone || editingOrder.customer?.phone;
                    const text = customerInvoiceText(store!.name, store!.currency, {
                      orderNumber: editingOrder.orderNumber,
                      projectTitle,
                      projectSellQuantity: qty,
                      projectSellUnitPrice: unitPrice,
                      discountTotal: invoiceDiscountAmount,
                      total: customerTotal,
                      customer: {
                        name: customerName || editingOrder.customer?.name || "",
                        phone,
                      },
                      payments: editingOrder.payments,
                    });
                    window.open(whatsAppShareUrl(phone, text), "_blank", "noopener,noreferrer");
                    if (!phone) {
                      notifications.show({
                        color: "yellow",
                        message: "No customer phone on this project. Choose the chat in WhatsApp.",
                      });
                    }
                  }}
                >
                  WhatsApp invoice
                </Button>
              ) : null}

              <Divider my="md" label="Schedule" labelPosition="center" />
              <Group grow>
                <TextInput
                  label="Date"
                  type="date"
                  disabled={!canEditPricing}
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.currentTarget.value)}
                />
                <TextInput
                  label="Time"
                  type="time"
                  disabled={!canEditPricing}
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.currentTarget.value)}
                />
              </Group>
              <Select
                label="Activity type"
                data={SCHEDULE_TYPES}
                disabled={!canEditPricing}
                value={scheduleType}
                onChange={(v) => setScheduleType((v as CalendarEventType) ?? "SCHEDULED_ORDER")}
              />
              {canEditPricing ? (
                <>
                  <Text size="xs" c="dimmed">
                    The project stays on the calendar, including after it is closed.
                  </Text>
                  <Group>
                    {saveButton}
                    <Button
                      variant="light"
                      color="blue"
                      leftSection={<IconCalendar size={16} />}
                      loading={loadingAction === "schedule"}
                      onClick={scheduleProject}
                    >
                      {editingOrderId ? "Update & schedule" : "Schedule project"}
                    </Button>
                  </Group>
                  <Divider my="md" label="Close project" labelPosition="center" />
                  <Text size="sm" c="dimmed">
                    {canCloseProject
                      ? "Payments equal the customer price. Submit to close this project."
                      : `Payments must equal the customer price before closing. Recorded ${formatMoney(projectedPaid, store!.currency)} of ${formatMoney(customerTotal, store!.currency)}.`}
                  </Text>
                  <Button
                    color="green"
                    leftSection={<IconCash size={16} />}
                    loading={loadingAction === "submit"}
                    disabled={!canCloseProject}
                    onClick={submitProject}
                  >
                    Submit project
                  </Button>
                </>
              ) : null}
              <Button variant="default" onClick={() => goToPhase(-1)}>
                Back
              </Button>
            </Stack>
          ) : (
            <Text c="dimmed">You do not have permission to review the customer price.</Text>
          )}
        </Card>
      ) : null}
    </Stack>
  );
}
