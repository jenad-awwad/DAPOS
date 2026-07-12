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
import { recordCalendarEventPayment } from "../lib/api";
import {
  activityBalanceDue,
  activityIsFullyPaid,
  activityPaidTotal,
  activityPrice,
  activityRequiresPayment,
} from "../lib/calendarPayments";
import { formatMoney, paymentLabel } from "../lib/format";
import type { CalendarEvent, PaymentMethod } from "../lib/types";

const PRIMARY_PAYMENTS: PaymentMethod[] = ["CASH", "CARD", "CHEQUE"];
const OTHER_PAYMENTS: PaymentMethod[] = ["DEBIT", "BREAKAGE", "DELIVERY"];

type CalendarActivityPaymentsProps = {
  event: CalendarEvent;
  currency: string;
  onUpdated?: (event: CalendarEvent) => void;
};

export function CalendarActivityPayments({
  event,
  currency,
  onUpdated,
}: CalendarActivityPaymentsProps) {
  const queryClient = useQueryClient();
  const [partialAmount, setPartialAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [otherPayment, setOtherPayment] = useState<PaymentMethod>("DEBIT");
  const [showOtherPayments, setShowOtherPayments] = useState(false);

  const price = useMemo(() => activityPrice(event), [event]);
  const paidTotal = useMemo(() => activityPaidTotal(event), [event]);
  const balanceDue = useMemo(() => activityBalanceDue(event), [event]);
  const fullyPaid = useMemo(() => activityIsFullyPaid(event), [event]);
  const requiresPayment = useMemo(() => activityRequiresPayment(event), [event]);

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
      return recordCalendarEventPayment(event.id, {
        amount,
        paymentMethod: resolvedPayment,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setPartialAmount("");
      onUpdated?.(data.event);
      notifications.show({ color: "green", message: "Activity payment recorded" });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Could not record payment",
      });
    },
  });

  if (!requiresPayment) {
    return (
      <Text size="sm" c="dimmed">
        No activity price set — you can close this activity without payment.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Activity price
        </Text>
        <Text size="sm" fw={600}>
          {formatMoney(price, currency)}
        </Text>
      </Group>
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

      {(event.payments ?? []).length > 0 ? (
        <Stack gap={4}>
          {(event.payments ?? []).map((payment) => (
            <Group key={payment.id} justify="space-between">
              <Text size="sm">{paymentLabel(payment.method)}</Text>
              <Text size="sm">{formatMoney(payment.amount, currency)}</Text>
            </Group>
          ))}
        </Stack>
      ) : null}

      {event.status === "OPEN" && !fullyPaid ? (
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
            Record payment
          </Button>
        </>
      ) : fullyPaid ? (
        <Text size="sm" c="teal">
          Fully paid — you can close this activity.
        </Text>
      ) : null}
    </Stack>
  );
}
