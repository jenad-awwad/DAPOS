import { ActionIcon, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { IconBarcode } from "@tabler/icons-react";
import { useRef, useState } from "react";
import {
  BarcodeCameraScanner,
  primeScanFeedback,
  requestBarcodeCamera,
} from "./BarcodeCameraScanner";

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
  const cameraRequestRef = useRef<Promise<MediaStream> | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const openCameraScanner = () => {
    primeScanFeedback();
    cameraRequestRef.current = requestBarcodeCamera();
    setScannerOpen(true);
  };

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
            placeholder="Scan or type barcode from product"
            leftSectionPointerEvents="all"
            leftSection={
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Scan barcode with camera"
                onClick={openCameraScanner}
              >
                <IconBarcode size={16} />
              </ActionIcon>
            }
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            error={error}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <Text size="xs" c="dimmed">
            Tap the barcode icon to scan with the camera, or type the code on the package.
          </Text>
          <BarcodeCameraScanner
            opened={scannerOpen}
            streamRequestRef={cameraRequestRef}
            readingLabel="Reading barcode…"
            onClose={() => setScannerOpen(false)}
            onDetected={async (code) => {
              onChange(code);
              setScannerOpen(false);
              return { ok: true, message: `Barcode ${code}` };
            }}
          />
        </>
      )}
    </Stack>
  );
}

export type { BarcodeMode };
