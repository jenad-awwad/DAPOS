import { Button, Group, Image, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCamera, IconPhoto } from "@tabler/icons-react";
import { useRef } from "react";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

type ProductImagePickerProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function ProductImagePicker({
  value,
  onChange,
  error,
}: ProductImagePickerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
        message: "Image must be 2 MB or smaller",
      });
      return;
    }

    try {
      onChange(await readFileAsDataUrl(file));
    } catch {
      notifications.show({ color: "red", message: "Could not load image" });
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Product photo *
      </Text>
      {value ? (
        <Image
          src={value}
          alt="Product preview"
          h={180}
          w="100%"
          fit="cover"
          radius="md"
        />
      ) : (
        <Text size="sm" c="dimmed">
          Take a photo or choose one from your gallery.
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
    </Stack>
  );
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 2 MB or smaller");
  }
  return readFileAsDataUrl(file);
}
