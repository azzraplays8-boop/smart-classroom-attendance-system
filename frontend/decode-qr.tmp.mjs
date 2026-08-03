/**
 * TEMP: Render QR from the exact qr_code string stored in DB and decode it
 * using @zxing/library (pure JS, no DOM). Confirms EXACTLY what the scanner
 * decodes. Read-only.
 */
import QRCodeLib from "qrcode";
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
  console.log("Usage: node decode-qr.tmp.mjs '<qr_code_string>'");
  process.exit(1);
}

console.log(`Input qr_code string = ${JSON.stringify(qrCode)}`);

// Build the QR module matrix exactly like the qrcode library renders it
const qr = QRCodeLib.create(String(qrCode), { errorCorrectionLevel: "H", margin: 2 });
const size = qr.modules.size;
const scale = 8;
const quietZone = 2;
const dim = (size + quietZone * 2) * scale;

const pixels = new Uint8ClampedArray(dim * dim * 4);
for (let i = 0; i < dim * dim * 4; i += 4) {
  pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255;
}
for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    if (qr.modules.get(r, c)) {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = (c + quietZone) * scale + dx;
          const y = (r + quietZone) * scale + dy;
          const idx = (y * dim + x) * 4;
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 255;
        }
      }
    }
  }
}

const source = new RGBLuminanceSource(pixels, dim, dim);
const bitmap = new BinaryBitmap(new HybridBinarizer(source));
const reader = new QRCodeReader();
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

const result = reader.decode(bitmap, hints);
const decoded = result?.getText?.() ?? "";
console.log(`Decoded QR text     = ${JSON.stringify(decoded)}`);

// Now simulate Attendance.jsx handleAttendanceScan:
let qrPayload = null;
try { qrPayload = JSON.parse(decoded); } catch { qrPayload = null; }
console.log(`JSON.parse success  = ${qrPayload ? "YES" : "NO"}`);

let requestBody = {};
if (qrPayload && qrPayload.uuid) {
  requestBody = { qrUuid: String(qrPayload.uuid).trim() };
  console.log(`Frontend POST body  = ${JSON.stringify(requestBody)}`);
} else {
  requestBody = { participantIdentifier: decoded };
  console.log(`Frontend POST body  = ${JSON.stringify(requestBody)}  (LEGACY PATH - causes 'Participant identifier was not found' if not a valid identifier)`);
}

