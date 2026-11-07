import { Button, Group, Modal, Progress, Stack, Text } from "@mantine/core";
import { formatPhotoSize } from "../lib/optimizeImage";

type ImageReviewModalProps = {
  opened: boolean;
  previewUrl: string | null;
  width?: number;
  height?: number;
  bytes?: number;
  progress: number;
  status: string;
  error: string;
  preparing: boolean;
  uploading: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ImageReviewModal({
  opened,
  previewUrl,
  width,
  height,
  bytes,
  progress,
  status,
  error,
  preparing,
  uploading,
  onConfirm,
  onClose,
}: ImageReviewModalProps) {
  const busy = preparing || uploading;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Review photo"
      centered
      closeOnClickOutside={!uploading}
      closeOnEscape={!uploading}
      withCloseButton={!uploading}
    >
      <Stack gap="sm">
        {previewUrl ? (
          <div
            style={{
              background: "#e9ecef",
              borderRadius: 8,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 180,
            }}
          >
            <img
              src={previewUrl}
              alt="Photo preview"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: 360,
                objectFit: "contain",
              }}
            />
          </div>
        ) : null}
        {width && height && bytes ? (
          <Text size="sm" c="dimmed">
            {width} × {height} · {formatPhotoSize(bytes)} · WebP
          </Text>
        ) : null}
        {busy ? (
          <Stack gap={4}>
            <Progress value={progress} color="green" size="sm" animated={preparing} />
            <Text size="xs" c="dimmed">
              {status}
              {uploading ? ` ${progress}%` : ""}
            </Text>
          </Stack>
        ) : null}
        {error ? (
          <Text size="sm" c="red">
            {error}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={uploading}>
            {previewUrl ? "Choose another" : "Close"}
          </Button>
          {previewUrl ? (
            <Button color="green" onClick={onConfirm} loading={uploading} disabled={preparing}>
              Use this photo
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Modal>
  );
}
