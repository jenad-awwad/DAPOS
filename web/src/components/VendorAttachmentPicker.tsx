import { Anchor, Button, Group, Image, Modal, Stack, Text } from "@mantine/core";
import { IconCamera, IconPhoto } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { uploadAttachment } from "../lib/api";
import { optimizeImageFile, type OptimizedImage } from "../lib/optimizeImage";
import { ImageReviewModal } from "./ImageReviewModal";

type VendorAttachmentPickerProps = {
  previewUrl: string | null;
  onUploaded: (key: string, previewUrl: string) => void;
  onClear: () => void;
  readOnly?: boolean;
};

export function VendorAttachmentPicker({
  previewUrl,
  onUploaded,
  onClear,
  readOnly = false,
}: VendorAttachmentPickerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [opened, setOpened] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [prepareError, setPrepareError] = useState("");
  const [review, setReview] = useState<OptimizedImage | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const closeReview = () => {
    requestId.current += 1;
    setReviewOpen(false);
    setPreparing(false);
    setUploading(false);
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
    setUploading(false);
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

  const confirmUpload = async () => {
    if (!review) return;
    setUploading(true);
    setPrepareError("");
    setProgress(0);
    setStatus("Uploading photo…");
    try {
      const { key } = await uploadAttachment(review.dataUrl, (percent) => {
        setProgress(percent);
        setStatus("Uploading photo…");
      });
      onUploaded(key, review.dataUrl);
      closeReview();
    } catch (err) {
      setUploading(false);
      setPrepareError(
        err instanceof Error ? err.message : "The photo could not be uploaded. Try again.",
      );
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Attachment{" "}
        <Text span c="dimmed" fw={400}>
          (optional)
        </Text>
      </Text>
      {previewUrl ? (
        <Image
          src={previewUrl}
          alt="Attachment preview"
          h={160}
          w="100%"
          fit="contain"
          radius="md"
          style={{ cursor: "pointer" }}
          onClick={() => setOpened(true)}
        />
      ) : (
        <Text size="sm" c="dimmed">
          {readOnly
            ? "No picture attached."
            : "Optional. Upload a photo or take one with the camera."}
        </Text>
      )}
      {previewUrl ? (
        <Button variant="subtle" size="compact-sm" onClick={() => setOpened(true)}>
          Open picture
        </Button>
      ) : null}
      <Modal opened={opened} onClose={() => setOpened(false)} title="Attachment" size="lg">
        {previewUrl ? (
          <Stack gap="sm">
            <Image src={previewUrl} alt="Attachment" fit="contain" mah={560} />
            <Anchor href={previewUrl} target="_blank" rel="noreferrer">
              Open picture in a new tab
            </Anchor>
          </Stack>
        ) : null}
      </Modal>
      {readOnly ? null : (
      <>
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
          color="gray"
          leftSection={<IconPhoto size={16} />}
          onClick={() => galleryRef.current?.click()}
        >
          Gallery
        </Button>
        {previewUrl ? (
          <Button variant="subtle" color="red" onClick={onClear}>
            Remove
          </Button>
        ) : null}
      </Group>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
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
        uploading={uploading}
        onConfirm={() => {
          void confirmUpload();
        }}
        onClose={closeReview}
      />
      </>
      )}
    </Stack>
  );
}
