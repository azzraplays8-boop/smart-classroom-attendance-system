/**
 * importService.js
 * ------------------------------------------------------------------
 * UI-side helpers for the Bulk Import Participants wizard.
 *  - parseSpreadsheet(file): read .xlsx/.xls/.csv in the browser for
 *    preview + column mapping (uses the frontend `xlsx` dependency).
 *  - submitImport(formData): POST the file + mapping + duplicateMode to
 *    the backend for the authoritative import.
 *  - exportErrorReport(errors, filename): generate an .xlsx error report.
 */

import * as XLSX from "xlsx";
import { API_BASE_URL, buildApiUrl } from "../config/api";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function isAcceptedSpreadsheet(filename) {
  const lower = String(filename || "").toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Parse a spreadsheet file in the browser. Returns:
 *   {
 *     headers: [colName, ...],
 *     rows: [ {colName: value, ...}, ... ],
 *   }
 * Uses raw values where possible and normalizes header names.
 */
export async function parseSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The spreadsheet contains no sheets.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  if (!aoa || aoa.length === 0) {
    throw new Error("The spreadsheet is empty.");
  }

  // First non-empty row = headers
  let headerRowIndex = -1;
  let headers = [];
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    const cleaned = (row || []).map((c) => String(c ?? "").trim()).filter(Boolean);
    if (cleaned.length > 0) {
      headerRowIndex = i;
      headers = (row || []).map((c, idx) => String(c ?? "").trim() || `Column ${idx + 1}`);
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect a header row.");
  }

  const rows = [];
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const rawRow = aoa[i] || [];
    // Skip fully-empty rows
    if (rawRow.every((c) => String(c ?? "").trim() === "")) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = rawRow[c] ?? "";
    }
    rows.push(obj);
  }

  return { headers, rows };
}

/**
 * Submit the import to the backend. `mapping` is { fieldKey: header }.
 * Returns the parsed JSON response (summary + errors).
 */
export async function submitImport({ file, mapping, duplicateMode, createdBy }) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mapping", JSON.stringify(mapping));
  fd.append("duplicateMode", duplicateMode || "skip");
  if (createdBy) fd.append("createdBy", String(createdBy));

  const url = buildApiUrl("/participants/bulk-import");
  if (import.meta.env.DEV) {
    console.debug("submitImport: POST", url);
  }

  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: fd,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `Bulk import service is unavailable. Please check the API configuration. POST ${url}`
      );
    }
    throw new Error(
      data?.message || `Import failed (HTTP ${res.status}). Please try again.`
    );
  }

  return data;
}

/**
 * Fetch recent import history (audit log).
 */
export async function fetchImportHistory() {
  const url = buildApiUrl("/participants/imports");
  if (import.meta.env.DEV) {
    console.debug("fetchImportHistory: GET", url);
  }

  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.message || "Failed to load import history.");
  }
  return data?.imports || [];
}

/**
 * Generate and download an Excel/CSV error report.
 * errors: [{ rowNumber, participantIdentifier, reason }]
 */
export function exportErrorReport(errors, filename = "import-error-report.xlsx") {
  const rows = (errors || []).map((e) => ({
    "Row Number": e.rowNumber,
    "Participant ID": e.participantIdentifier || "",
    Reason: e.reason || "",
  }));

  const ws = XLSX.utils.json_to_sheet(
    rows.length ? rows : [{ "Row Number": "", "Participant ID": "", Reason: "No errors" }]
  );
  ws["!cols"] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 40 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Import Errors");
  XLSX.writeFile(wb, filename);
}
