import {
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBarcode } from "@tabler/icons-react";
import { useRef } from "react";

type BarcodeMode = "auto" | "scan";

type ProductBarcodeFieldProps = {
  mode: BarcodeMode;
  onModeChange: (mode: BarcodeMode) => void;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function ProductBarcodeField({
  mode,
  onModeChange,
  value,
  onChange,
  error,
}: ProductBarcodeFieldProps) {
  const scanInputRef = useRef<HTMLInputElement>(null);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Barcode
      </Text>
      <SegmentedControl
        value={mode}
        onChange={(v) => onModeChange(v as BarcodeMode)}
        data={[
          { label: "Auto-generate", value: "auto" },
          { label: "Scan existing", value: "scan" },
        ]}
      />
      {mode === "auto" ? (
        <Text size="sm" c="dimmed">
          A unique barcode is generated automatically when you save.
        </Text>
      ) : (
        <>
          <TextInput
            ref={scanInputRef}
            placeholder="Scan or type barcode from product"
            leftSection={<IconBarcode size={16} />}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            error={error}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <Text size="xs" c="dimmed">
            Use a barcode scanner or type the code printed on the package.
          </Text>
        </>
      )}
    </Stack>
  );
}

export type { BarcodeMode };
