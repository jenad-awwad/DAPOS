import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconBolt } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { BarcodeFormat } from "barcode-detector/ponyfill";

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "qr_code",
] as const satisfies readonly BarcodeFormat[];

type DetectedCode = { rawValue?: string };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedCode[]>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

export type BarcodeScanResult = {
  ok: boolean;
  message: string;
};

type BarcodeCameraScannerProps = {
  opened: boolean;
  streamRequestRef: { current: Promise<MediaStream> | null };
  onClose: () => void;
  onDetected: (code: string) => Promise<BarcodeScanResult>;
};

let detectorPromise: Promise<BarcodeDetectorLike> | null = null;

function nativeDetector(): BarcodeDetectorCtor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof candidate === "function" ? candidate : null;
}

function getDetector(): Promise<BarcodeDetectorLike> {
  detectorPromise ??= createDetector().catch((err: unknown) => {
    detectorPromise = null;
    throw err;
  });
  return detectorPromise;
}

async function createDetector(): Promise<BarcodeDetectorLike> {
  const Native = nativeDetector();
  if (Native?.getSupportedFormats) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = FORMATS.filter((format) => supported.includes(format));
      const hasRetail = formats.some(
        (format) =>
          format === "ean_13" ||
          format === "upc_a" ||
          format === "code_128" ||
          format === "ean_8",
      );
      if (hasRetail) return new Native({ formats: [...formats] });
    } catch {
      // Fall through to the bundled decoder.
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? wasm.default : prefix + path,
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "Camera permission is blocked. Allow camera access in the browser, then try again.";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "No camera was found on this device.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "The camera is already in use by another app.";
    }
    if (err.name === "SecurityError" || err.name === "NotSupportedError") {
      return "Camera scanning needs a secure (HTTPS) connection. Type the barcode, or open this page over HTTPS.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not open the camera.";
}

function torchTrack(stream: MediaStream): MediaStreamTrack | null {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities) return null;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  return caps.torch ? track : null;
}

export function BarcodeCameraScanner({
  opened,
  streamRequestRef,
  onClose,
  onDetected,
}: BarcodeCameraScannerProps) {
  const isPhone = useMediaQuery("(max-width: 48em)");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Point the camera at a barcode");
  const [tone, setTone] = useState<"idle" | "ok" | "bad">("idle");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!opened) return;
    const request = streamRequestRef.current;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let lastValue = "";
    let lastAt = 0;

    setError("");
    setTone("idle");
    setStatus("Starting camera…");
    setTorchAvailable(false);
    setTorchOn(false);
    torchTrackRef.current = null;

    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    const scan = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (!video) {
        timer = window.setTimeout(scan, 50);
        return;
      }
      if (!stream) return;

      if (video.srcObject !== stream) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          if (!stopped) {
            setError("The camera preview did not start. Close and try again.");
          }
          return;
        }
      }

      let detector: BarcodeDetectorLike;
      try {
        detector = await getDetector();
      } catch {
        if (!stopped) {
          setError("Barcode scanning could not start in this browser. Type the code instead.");
        }
        return;
      }
      if (stopped) return;
      setStatus("Point the camera at a barcode");

      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const codes = await detector.detect(video);
            const value = codes.map((code) => code.rawValue?.trim() ?? "").find(Boolean);
            const now = Date.now();
            if (value && !(value === lastValue && now - lastAt < 1400)) {
              lastValue = value;
              lastAt = now;
              setTone("idle");
              setStatus("Looking up…");
              try {
                const result = await onDetectedRef.current(value);
                if (!stopped) {
                  setTone(result.ok ? "ok" : "bad");
                  setStatus(result.message);
                }
              } catch (err) {
                if (!stopped) {
                  setTone("bad");
                  setStatus(err instanceof Error ? err.message : "Product not found");
                }
              }
            }
          } catch {
            // A single missed frame should not stop the camera.
          }
        }
        if (!stopped) timer = window.setTimeout(tick, 250);
      };

      timer = window.setTimeout(tick, 200);
    };

    const start = async () => {
      if (!request) {
        setError("Camera did not start. Close and try again.");
        return;
      }
      try {
        stream = await request;
      } catch (err) {
        if (!stopped) setError(cameraErrorMessage(err));
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
        return;
      }
      const track = torchTrack(stream);
      torchTrackRef.current = track;
      setTorchAvailable(Boolean(track));
      await scan();
    };

    void start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stopStream();
      torchTrackRef.current = null;
    };
  }, [opened, streamRequestRef]);

  const toggleTorch = async () => {
    const track = torchTrackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTone("bad");
      setStatus("The flash could not be switched on.");
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Scan barcode"
      centered
      size="md"
      fullScreen={Boolean(isPhone)}
    >
      <Stack gap="sm">
        <div className="barcode-camera">
          <video ref={videoRef} muted playsInline autoPlay />
          <div className="barcode-camera-frame" />
        </div>
        <Text size="sm" c={error || tone === "bad" ? "red" : tone === "ok" ? "green" : "dimmed"}>
          {error || status}
        </Text>
        <Group justify="space-between">
          {torchAvailable ? (
            <Button
              variant={torchOn ? "filled" : "light"}
              color="green"
              leftSection={<IconBolt size={16} />}
              onClick={() => void toggleTorch()}
            >
              Flash
            </Button>
          ) : (
            <span />
          )}
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function requestBarcodeCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const request = Promise.reject(
      new Error(
        window.isSecureContext
          ? "This browser cannot use the camera. Type the barcode instead."
          : "Camera scanning needs a secure (HTTPS) connection. Type the barcode, or open this page over HTTPS.",
      ),
    );
    request.catch(() => {});
    return request;
  }

  const request = navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  request.catch(() => {});
  return request;
}
