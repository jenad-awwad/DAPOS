import {
  Button,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { recordProjectPayment } from "../lib/api";
import { invalidateDashboardQueries } from "../lib/dashboardQueries";
import { formatMoney, paymentLabel } from "../lib/format";
import { projectBalanceDue, projectPaidTotal } from "../lib/projectPayments";
import type { Order, PaymentMethod } from "../lib/types";

const PRIMARY_PAYMENTS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];
const OTHER_PAYMENTS: PaymentMethod[] = ["DEBIT", "BREAKAGE", "DELIVERY"];

type ProjectPartialPaymentsProps = {
  order: Order;
  currency: string;
  onUpdated?: (order: Order) => void;
  readOnly?: boolean;
};

export function ProjectPartialPayments({
  order,
  currency,
  onUpdated,
  readOnly = false,
}: ProjectPartialPaymentsProps) {
  const queryClient = useQueryClient();
  const [partialAmount, setPartialAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [otherPayment, setOtherPayment] = useState<PaymentMethod>("DEBIT");
  const [showOtherPayments, setShowOtherPayments] = useState(false);

  const paidTotal = useMemo(() => projectPaidTotal(order), [order]);
  const balanceDue = useMemo(() => projectBalanceDue(order), [order]);

  const recordMutation = useMutation({
    mutationFn: async () => {
      const amount = partialAmount === "" ? 0 : Number(partialAmount) || 0;
      if (amount <= 0) {
        throw new Error("Enter a payment amount greater than zero");
      }
      if (amount > balanceDue) {
        throw new Error(`Amount cannot exceed balance due (${formatMoney(balanceDue, currency)})`);
      }

      const resolvedPayment = showOtherPayments ? otherPayment : paymentMethod;
      return recordProjectPayment(order.id, {
        amount,
        paymentMethod: resolvedPayment,
      });
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      await invalidateDashboardQueries(queryClient);
      setPartialAmount("");
      onUpdated?.(data.order);
      notifications.show({ color: "green", message: "Partial payment recorded" });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Could not record payment",
      });
    },
  });

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Paid so far
        </Text>
        <Text size="sm" fw={600}>
          {formatMoney(paidTotal, currency)}
        </Text>
      </Group>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Balance due
        </Text>
        <Text size="sm" fw={600} c={balanceDue > 0 ? "orange" : "teal"}>
          {formatMoney(balanceDue, currency)}
        </Text>
      </Group>

      {(order.payments ?? []).length > 0 ? (
        <Stack gap={4}>
          {(order.payments ?? []).map((payment) => (
            <Group key={payment.id} justify="space-between">
              <Text size="sm">{paymentLabel(payment.method)}</Text>
              <Text size="sm">{formatMoney(payment.amount, currency)}</Text>
            </Group>
          ))}
        </Stack>
      ) : null}

      {balanceDue > 0 && !readOnly ? (
        <>
          <Divider />
          <NumberInput
            label="Partial payment amount"
            min={0.01}
            max={balanceDue}
            decimalScale={2}
            value={partialAmount}
            onChange={(v) => setPartialAmount(v === "" ? "" : Number(v) || 0)}
          />
          <SegmentedControl
            fullWidth
            value={showOtherPayments ? "OTHER" : paymentMethod}
            onChange={(value) => {
              if (value === "OTHER") {
                setShowOtherPayments(true);
                return;
              }
              setShowOtherPayments(false);
              setPaymentMethod(value as PaymentMethod);
            }}
            data={[
              ...PRIMARY_PAYMENTS.map((m) => ({ label: paymentLabel(m), value: m })),
              { label: "Other", value: "OTHER" },
            ]}
          />
          {showOtherPayments ? (
            <Select
              data={OTHER_PAYMENTS.map((m) => ({ value: m, label: paymentLabel(m) }))}
              value={otherPayment}
              onChange={(v) => setOtherPayment((v as PaymentMethod) ?? "DEBIT")}
            />
          ) : null}
          <Button
            variant="light"
            color="green"
            loading={recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            Record partial payment
          </Button>
        </>
      ) : (
        <Text size="sm" c="teal">
          Fully paid — you can submit the project to close it.
        </Text>
      )}
    </Stack>
  );
}

export function PendingPartialPaymentFields({
  currency,
  customerTotal,
  partialAmount,
  onPartialAmountChange,
  paymentMethod,
  onPaymentMethodChange,
  otherPayment,
  onOtherPaymentChange,
  showOtherPayments,
  onShowOtherPaymentsChange,
}: {
  currency: string;
  customerTotal: number;
  partialAmount: number | "";
  onPartialAmountChange: (value: number | "") => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  otherPayment: PaymentMethod;
  onOtherPaymentChange: (value: PaymentMethod) => void;
  showOtherPayments: boolean;
  onShowOtherPaymentsChange: (value: boolean) => void;
}) {
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Optional partial payment — recorded right after you save or schedule the project.
      </Text>
      <NumberInput
        label="Partial payment amount"
        min={0}
        max={customerTotal}
        decimalScale={2}
        value={partialAmount}
        onChange={(v) => onPartialAmountChange(v === "" ? "" : Number(v) || 0)}
      />
      {partialAmount !== "" && Number(partialAmount) > 0 ? (
        <>
          <SegmentedControl
            fullWidth
            value={showOtherPayments ? "OTHER" : paymentMethod}
            onChange={(value) => {
              if (value === "OTHER") {
                onShowOtherPaymentsChange(true);
                return;
              }
              onShowOtherPaymentsChange(false);
              onPaymentMethodChange(value as PaymentMethod);
            }}
            data={[
              ...PRIMARY_PAYMENTS.map((m) => ({ label: paymentLabel(m), value: m })),
              { label: "Other", value: "OTHER" },
            ]}
          />
          {showOtherPayments ? (
            <Select
              data={OTHER_PAYMENTS.map((m) => ({ value: m, label: paymentLabel(m) }))}
              value={otherPayment}
              onChange={(v) => onOtherPaymentChange((v as PaymentMethod) ?? "DEBIT")}
            />
          ) : null}
          <Text size="xs" c="dimmed">
            Will record {formatMoney(Number(partialAmount) || 0, currency)} of{" "}
            {formatMoney(customerTotal, currency)}
          </Text>
        </>
      ) : null}
    </Stack>
  );
}
