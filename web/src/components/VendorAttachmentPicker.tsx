import { Anchor, Button, Group, Image, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCamera, IconPhoto } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { uploadAttachment } from "../lib/api";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

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
  const [uploading, setUploading] = useState(false);
  const [opened, setOpened] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notifications.show({ color: "red", message: "Please choose an image file" });
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      notifications.show({
        color: "red",
        message: "Image must be 5 MB or smaller",
      });
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { key } = await uploadAttachment(dataUrl);
      onUploaded(key, dataUrl);
    } catch (err) {
      notifications.show({
        color: "red",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
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
          loading={uploading}
          onClick={() => cameraRef.current?.click()}
        >
          Camera
        </Button>
        <Button
          variant="light"
          color="gray"
          leftSection={<IconPhoto size={16} />}
          loading={uploading}
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
      </>
      )}
    </Stack>
  );
}
