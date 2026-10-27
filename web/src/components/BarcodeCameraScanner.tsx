import { Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core";
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

export type ScannedLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  maxQuantity: number;
  priceLabel: string;
  totalLabel: string;
  canChangePrice: boolean;
};

type BarcodeCameraScannerProps = {
  opened: boolean;
  streamRequestRef: { current: Promise<MediaStream> | null };
  onClose: () => void;
  onDetected: (code: string) => Promise<BarcodeScanResult>;
  line: ScannedLine | null;
  onQuantityChange: (quantity: number) => void;
  onPriceChange: (unitPrice: number) => void;
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

let scanAudio: AudioContext | null = null;

function scanAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  scanAudio ??= new Ctx();
  if (scanAudio.state === "suspended") void scanAudio.resume();
  return scanAudio;
}

function playTone(
  frequency: number,
  durationMs: number,
  delaySec = 0,
  type: OscillatorType = "sine",
) {
  const ctx = scanAudioContext();
  if (!ctx) return;
  const start = ctx.currentTime + delaySec;
  const end = start + durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  const peak = type === "square" ? 0.12 : 0.22;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function feedbackScan(ok: boolean) {
  if (ok) {
    navigator.vibrate?.(90);
    playTone(2637, 90, 0, "square");
    playTone(3520, 130, 0.1, "square");
    return;
  }
  navigator.vibrate?.([50, 70, 50]);
  playTone(220, 140);
  playTone(165, 160, 0.18);
}

export function primeScanFeedback() {
  const ctx = scanAudioContext();
  void ctx?.resume();
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
  line,
  onQuantityChange,
  onPriceChange,
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
  const [scanMode, setScanMode] = useState<"continuous" | "tap">("continuous");
  const modeRef = useRef(scanMode);
  const armedRef = useRef(true);
  const holdingRef = useRef(false);
  const suppressValueRef = useRef<string | null>(null);
  const manualTimerRef = useRef(0);
  const [holding, setHolding] = useState(false);

  onDetectedRef.current = onDetected;
  modeRef.current = scanMode;

  useEffect(() => {
    if (!opened) return;
    const request = streamRequestRef.current;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let lastValue = "";
    let lastAt = 0;
    let missedSince = 0;

    setError("");
    setTone("idle");
    setStatus("Starting camera…");
    setTorchAvailable(false);
    setTorchOn(false);
    holdingRef.current = false;
    suppressValueRef.current = null;
    setHolding(false);
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
      setStatus(
        modeRef.current === "tap"
          ? "Aim at the barcode, then tap Scan"
          : "Point the camera at a barcode",
      );

      const tick = async () => {
        if (stopped) return;
        const listening =
          !holdingRef.current && (modeRef.current === "continuous" || armedRef.current);
        if (listening && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const codes = await detector.detect(video);
            const value = codes.map((code) => code.rawValue?.trim() ?? "").find(Boolean);
            const now = Date.now();
            if (!value) {
              if (!missedSince) missedSince = now;
              if (!holdingRef.current && now - missedSince >= 800) {
                suppressValueRef.current = null;
              }
            } else {
              missedSince = 0;
            }
            if (
              value &&
              value !== suppressValueRef.current &&
              !(value === lastValue && now - lastAt < 1400)
            ) {
              if (modeRef.current === "tap") {
                armedRef.current = false;
                window.clearTimeout(manualTimerRef.current);
              }
              lastValue = value;
              lastAt = now;
              setTone("idle");
              setStatus("Looking up…");
              try {
                const result = await onDetectedRef.current(value);
                if (!stopped) {
                  setTone(result.ok ? "ok" : "bad");
                  setStatus(result.message);
                  feedbackScan(result.ok);
                  if (result.ok) {
                    suppressValueRef.current = value;
                    holdingRef.current = true;
                    setHolding(true);
                  }
                }
              } catch (err) {
                if (!stopped) {
                  setTone("bad");
                  setStatus(err instanceof Error ? err.message : "Product not found");
                  feedbackScan(false);
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
      window.clearTimeout(manualTimerRef.current);
      stopStream();
      torchTrackRef.current = null;
    };
  }, [opened, streamRequestRef]);

  const chooseScanMode = (mode: "continuous" | "tap") => {
    setScanMode(mode);
    modeRef.current = mode;
    window.clearTimeout(manualTimerRef.current);
    if (holdingRef.current) {
      armedRef.current = false;
      return;
    }
    if (mode === "continuous") {
      armedRef.current = true;
      setTone("idle");
      setStatus("Point the camera at a barcode");
      return;
    }
    armedRef.current = false;
    setTone("idle");
    setStatus("Aim at the barcode, then tap Scan");
  };

  const resumeScan = () => {
    holdingRef.current = false;
    setHolding(false);
    setTone("idle");
    if (modeRef.current === "tap") {
      startManualScan();
      return;
    }
    armedRef.current = true;
    setStatus("Point the camera at a barcode");
  };

  const startManualScan = () => {
    primeScanFeedback();
    armedRef.current = true;
    setTone("idle");
    setStatus("Scanning…");
    window.clearTimeout(manualTimerRef.current);
    manualTimerRef.current = window.setTimeout(() => {
      if (modeRef.current !== "tap" || !armedRef.current) return;
      armedRef.current = false;
      setTone("bad");
      setStatus("No barcode in view. Tap Scan again.");
    }, 2500);
  };

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
        <div className={holding ? "barcode-camera is-reviewing" : "barcode-camera"}>
          <video ref={videoRef} muted playsInline autoPlay />
          <div className="barcode-camera-frame" />
        </div>
        <SegmentedControl
          fullWidth
          size="xs"
          value={scanMode}
          onChange={(value) => chooseScanMode(value as "continuous" | "tap")}
          data={[
            { label: "Continuous", value: "continuous" },
            { label: "Tap to scan", value: "tap" },
          ]}
        />
        <Text
          size={tone === "idle" ? "sm" : "md"}
          fw={tone === "idle" ? 400 : 700}
          c={error || tone === "bad" ? "red" : tone === "ok" ? "green" : "dimmed"}
        >
          {error || status}
        </Text>
        {holding && line ? (
          <div className="barcode-scan-line">
            <Text fw={700}>{line.name}</Text>
            <Text size="xs" c="dimmed">
              In stock: {line.maxQuantity}
            </Text>
            <Group grow align="flex-end">
              <NumberInput
                label="Qty"
                size="sm"
                min={1}
                max={line.maxQuantity}
                value={line.quantity}
                onChange={(value) => onQuantityChange(Number(value) || 1)}
              />
              {line.canChangePrice ? (
                <NumberInput
                  label="Price"
                  size="sm"
                  min={0}
                  decimalScale={2}
                  value={line.unitPrice}
                  onChange={(value) => onPriceChange(Number(value) || 0)}
                />
              ) : (
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    Price
                  </Text>
                  <Text fw={600}>{line.priceLabel}</Text>
                </Stack>
              )}
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Line total
              </Text>
              <Text fw={700}>{line.totalLabel}</Text>
            </Group>
          </div>
        ) : null}
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
          <Group gap="xs">
            {holding ? (
              <Button color="green" onClick={resumeScan}>
                Next scan
              </Button>
            ) : scanMode === "tap" ? (
              <Button color="green" onClick={startManualScan}>
                Scan
              </Button>
            ) : null}
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
          </Group>
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

  const rearCamera = {
    audio: false,
    video: {
      facingMode: { exact: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };
  const anyCamera = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };
  const request = navigator.mediaDevices.getUserMedia(rearCamera).catch((err: unknown) => {
    const noRearCamera =
      err instanceof DOMException &&
      (err.name === "OverconstrainedError" || err.name === "NotFoundError");
    if (!noRearCamera) throw err;
    return navigator.mediaDevices.getUserMedia(anyCamera);
  });
  request.catch(() => {});
  return request;
}
