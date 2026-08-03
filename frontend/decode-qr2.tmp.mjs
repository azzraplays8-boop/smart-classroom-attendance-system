/**
 * TEMP: Render QR to PNG data URL via qrcode, then decode the PNG bytes
 * using @zxing/library's RGBLuminanceSource fed from a PNG parser.
 * Uses the pngjs parser to read actual PNG pixels (no DOM needed).
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

const qrCode = process.argv[2];
if (!qrCode) {
  console.log("Usage: node decode-qr2.tmp.mjs '<qr_code_string>'");
  process.exit(1);
}

console.log(`Input qr_code string = ${JSON.stringify(qrCode)}`);

// Render to PNG buffer using qrcode lib
const dataUrl = await QRCodeLib.toDataURL(String(qrCode), {
  errorCorrectionLevel: "H",
  margin: 2,
  width: 512,
});
const base64 = dataUrl.split(",")[1];
const pngBuf = Buffer.from(base64, "base64");

// Parse PNG
const png = PNG.sync.read(pngBuf);
const { width, height, data } = png;

// Convert RGBA to luminance-compatible RGB buffer
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
const decoded = result?.getText?.() ?? "";
console.log(`Decoded QR text     = ${JSON.stringify(decoded)}`);

let qrPayload = null;
try { qrPayload = JSON.parse(decoded); } catch { qrPayload = null; }
console.log(`JSON.parse success  = ${qrPayload ? "YES" : "NO"}`);

let requestBody = {};
if (qrPayload && qrPayload.uuid) {
  requestBody = { qrUuid: String(qrPayload.uuid).trim() };
  console.log(`Frontend POST body  = ${JSON.stringify(requestBody)}`);
} else {
  requestBody = { participantIdentifier: decoded };
  console.log(`Frontend POST body  = ${JSON.stringify(requestBody)}  (LEGACY PATH)`);
}

