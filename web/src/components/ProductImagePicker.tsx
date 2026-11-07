import { Button, Group, Stack, Text } from "@mantine/core";
import { IconCamera, IconPhoto } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { optimizeImageFile, type OptimizedImage } from "../lib/optimizeImage";
import { ImageReviewModal } from "./ImageReviewModal";

type ProductImagePickerProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  uploadPercent?: number | null;
};

export function ProductImagePicker({
  value,
  onChange,
  error,
  uploadPercent = null,
}: ProductImagePickerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [prepareError, setPrepareError] = useState("");
  const [review, setReview] = useState<OptimizedImage | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const closeReview = () => {
    requestId.current += 1;
    setReviewOpen(false);
    setPreparing(false);
    setReview(null);
    setPrepareError("");
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const id = requestId.current + 1;
    requestId.current = id;
    setReviewOpen(true);
    setPreparing(true);
    setReview(null);
    setPrepareError("");
    setProgress(0);
    setStatus("Reading photo…");
    try {
      const optimized = await optimizeImageFile(file, (percent, label) => {
        if (requestId.current !== id) return;
        setProgress(percent);
        setStatus(label);
      });
      if (requestId.current !== id) return;
      setReview(optimized);
      setPreparing(false);
      setStatus("Ready to review");
    } catch (err) {
      if (requestId.current !== id) return;
      setPreparing(false);
      setPrepareError(err instanceof Error ? err.message : "Could not prepare this photo.");
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Product photo *
      </Text>
      {value ? (
        <div
          style={{
            background: "#f1f3f5",
            borderRadius: 8,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <img
            src={value}
            alt="Product preview"
            style={{ display: "block", maxWidth: "100%", maxHeight: 180, objectFit: "contain" }}
          />
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          Take a photo or choose one from your gallery. You can review it before it is saved.
        </Text>
      )}
      <Group>
        <Button
          variant="light"
          color="green"
          leftSection={<IconCamera size={16} />}
          onClick={() => cameraRef.current?.click()}
        >
          Camera
        </Button>
        <Button
          variant="light"
          leftSection={<IconPhoto size={16} />}
          onClick={() => galleryRef.current?.click()}
        >
          Gallery
        </Button>
      </Group>
      {uploadPercent !== null ? (
        <Text size="xs" c="dimmed">
          Uploading photo… {uploadPercent}%
        </Text>
      ) : null}
      {error ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : null}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <ImageReviewModal
        opened={reviewOpen}
        previewUrl={review?.dataUrl ?? null}
        width={review?.width}
        height={review?.height}
        bytes={review?.bytes}
        progress={progress}
        status={status}
        error={prepareError}
        preparing={preparing}
        uploading={false}
        onConfirm={() => {
          if (!review) return;
          onChange(review.dataUrl);
          closeReview();
        }}
        onClose={closeReview}
      />
    </Stack>
  );
}

export async function fileToDataUrl(file: File): Promise<string> {
  const optimized = await optimizeImageFile(file);
  return optimized.dataUrl;
}
