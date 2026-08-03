/**
 * TEMP: Validate decode pipeline with a known QR, then decode the real one.
 */
import QRCodeLib from "qrcode";
import { PNG } from "pngjs";
import {
  QRCodeReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";

async function decodeString(text) {
  const dataUrl = await QRCodeLib.toDataURL(String(text), {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 512,
  });
  const base64 = dataUrl.split(",")[1];
  const pngBuf = Buffer.from(base64, "base64");
  const png = PNG.sync.read(pngBuf);
  const { width, height, data } = png;

  // RGBLuminanceSource expects RGB (3 bytes/pixel). Convert RGBA -> RGB.
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }

  const source = new RGBLuminanceSource(rgb, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new QRCodeReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  const result = reader.decode(bitmap, hints);
  return result?.getText?.() ?? "";
}

// 1. Validate pipeline
console.log("=== Pipeline validation (simple text) ===");
const simple = await decodeString("hello world");
console.log(`Encoded 'hello world' -> decoded: ${JSON.stringify(simple)}`);
if (simple !== "hello world") {
  console.log("⚠️ Pipeline validation FAILED - decode pipeline is broken, results unreliable.");
}

// 2. Decode the actual JSON payload
console.log("\n=== Decode actual QR payload ===");
const qrCode = process.argv[2];
if (qrCode) {
  const decoded = await decodeString(qrCode);
  console.log(`Input qr_code : ${JSON.stringify(qrCode)}`);
  console.log(`Decoded text  : ${JSON.stringify(decoded)}`);

  let qrPayload = null;
  try { qrPayload = JSON.parse(decoded); } catch { qrPayload = null; }
  console.log(`JSON.parse OK : ${qrPayload ? "YES" : "NO"}`);

  let requestBody = {};
  if (qrPayload && qrPayload.uuid) {
    requestBody = { qrUuid: String(qrPayload.uuid).trim() };
    console.log(`Frontend POST body = ${JSON.stringify(requestBody)}  (QR UUID path)`);
  } else {
    requestBody = { participantIdentifier: decoded };
    console.log(`Frontend POST body = ${JSON.stringify(requestBody)}  (LEGACY path)`);
  }
} else {
  console.log("No qr_code provided as arg");
}

