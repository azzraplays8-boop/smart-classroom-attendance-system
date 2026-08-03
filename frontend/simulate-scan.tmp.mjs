/**
 * TEMP SIMULATION - render + decode QR using the exact same libraries as the frontend.
 * Polyfills minimal DOM globals so @zxing/browser works in Node.
 * Read-only: does NOT modify DB.
 */

// --- Minimal DOM polyfills for @zxing/browser in Node ---
import { createRequire } from "module";
const require = createRequire(import.meta.url);

class PolyfillImage {
  constructor() {
    this._src = "";
    this.style = {};
    this.attributes = {};
    this._listeners = {};
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(type, fn) { this._listeners[type] = fn; }
  removeEventListener() {}
  set src(v) {
    this._src = v;
    // data URLs or normal URLs - load via fetch
    this.decodeAsync();
  }
  get src() { return this._src; }
  async decodeAsync() {
    try {
      const data = await loadDataUrl(this._src);
      this.naturalWidth = data.width;
      this.naturalHeight = data.height;
      this.width = data.width;
      this.height = data.height;
      this._dataUrl = data.dataUrl;
      if (typeof this.onload === "function") this.onload();
    } catch (e) {
      if (typeof this.onerror === "function") this.onerror(e);
    }
  }
}
PolyfillImage.prototype.src = "";

// Provide the loader function
globalThis.__loadDataUrl = null;

async function loadDataUrl(url) {
  const fetch = globalThis.fetch;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const base64 = buf.toString("base64");
  const mime = res.headers.get("content-type") || "image/png";
  return {
    dataUrl: `data:${mime};base64,${base64}`,
    width: 0,
    height: 0,
  };
}

globalThis.HTMLImageElement = PolyfillImage;
globalThis.HTMLVideoElement = class {};
globalThis.HTMLCanvasElement = class {
  constructor() { this.width = 0; this.height = 0; }
  getContext() {
    return {
      drawImage() {},
      getImageData() { return { data: [] }; },
      putImageData() {},
    };
  }
  toDataURL() { return ""; }
};
globalThis.Image = PolyfillImage;
globalThis.window = globalThis;
globalThis.document = {
  createElement(tag) {
    if (tag === "img" || tag === "canvas") return new globalThis[tag === "img" ? "HTMLImageElement" : "HTMLCanvasElement"]();
    return {};
  },
  getElementById() { return null; },
  querySelector() { return null; },
};
try {
  Object.defineProperty(globalThis, "navigator", {
    value: globalThis.navigator || {},
    writable: true,
    configurable: true,
  });
} catch {}
if (!globalThis.navigator.mediaDevices) {
  try {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {},
      writable: true,
      configurable: true,
    });
  } catch {}
}

// Now import the libs
import QRCodeLib from "qrcode";
import { BrowserQRCodeReader } from "@zxing/browser";

const qrCode = process.argv[2];
if (!qrCode) {
  console.log("Usage: node simulate-scan.tmp.mjs '<qr_code_string>'");
  process.exit(1);
}

console.log(`Input qr_code = ${JSON.stringify(qrCode)}`);

// 1. Render QR exactly like QRManagement.jsx does
const dataUrl = await QRCodeLib.toDataURL(String(qrCode), {
  errorCorrectionLevel: "H",
  margin: 2,
  width: 512,
});

// 2. Decode using @zxing/browser exactly like Attendance.jsx
const reader = new BrowserQRCodeReader();
const result = await reader.decodeFromImageUrl(dataUrl);
const decoded = result?.getText?.() ?? result?.text ?? "";
console.log(`Scanner decoded text = ${JSON.stringify(decoded)}`);

// 3. Replicate Attendance.jsx handleAttendanceScan logic
let qrPayload = null;
try {
  qrPayload = JSON.parse(decoded);
} catch {
  qrPayload = null;
}

console.log(`Parsed as JSON? ${qrPayload ? "YES" : "NO"}`);
if (qrPayload) {
  console.log(`JSON payload   = ${JSON.stringify(qrPayload)}`);
  console.log(`payload.uuid   = ${JSON.stringify(qrPayload.uuid)}`);
  console.log(`payload.id     = ${JSON.stringify(qrPayload.id)} (type: ${typeof qrPayload.id})`);
  console.log(`payload.ident  = ${JSON.stringify(qrPayload.participantIdentifier)}`);
}

// 4. Build request body like frontend
let requestBody = {};
if (qrPayload && qrPayload.uuid) {
  requestBody = { qrUuid: String(qrPayload.uuid).trim() };
  console.log(`Frontend POST body = ${JSON.stringify(requestBody)}`);
} else {
  requestBody = { participantIdentifier: decoded };
  console.log(`Frontend POST body = ${JSON.stringify(requestBody)}  (LEGACY PATH)`);
}

console.log("\nSIMULATION COMPLETE");

