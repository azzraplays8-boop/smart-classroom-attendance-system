import { useEffect, useMemo, useRef, useState } from "react";

import ImportDropzone from "./ImportDropzone";
import ColumnMappingTable from "./ColumnMappingTable";
import ImportPreviewTable from "./ImportPreviewTable";
import ImportProgress from "./ImportProgress";
import ImportSummary from "./ImportSummary";

import {
  parseSpreadsheet,
  submitImport,
  fetchImportHistory,
} from "../../../services/importService";
import {
  buildInitialMapping,
  getMissingRequiredFields,
  IMPORT_FIELDS,
} from "../../../utils/importColumnMapping";

import "../../../styles/participants/ImportParticipants.css";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Compute validation stats for the preview step.
 * Returns { total, valid, duplicates, invalidEmails, missingRequired, emptyCells }.
 */
function computeStats(rows, mapping) {
  const seenIds = new Set();
  let duplicates = 0;
  let invalidEmails = 0;
  let missingRequired = 0;
  let emptyCells = 0;

  for (const row of rows) {
    for (const field of Object.keys(mapping || {})) {
      const header = mapping[field];
      const val = normalize(row?.[header]);
      if (val === "") {
        emptyCells++;
        if (IMPORT_FIELDS[field]?.required) missingRequired++;
      }
      if (field === "email" && val && !emailRe.test(val)) invalidEmails++;
      if (field === "participantIdentifier" && val) {
        const key = val.toLowerCase();
        if (seenIds.has(key)) duplicates++;
        else seenIds.add(key);
      }
    }
  }

  const valid = Math.max(0, rows.length - duplicates - invalidEmails - missingRequired);

  return {
    total: rows.length,
    valid,
    duplicates,
    invalidEmails,
    missingRequired,
    emptyCells,
  };
}

export default function ImportParticipantsModal({ isOpen, onClose, onImported }) {
  const overlayRef = useRef(null);
  const [step, setStep] = useState("upload"); // upload | mapping | preview | importing | done
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [stats, setStats] = useState(null);
  const [stage, setStage] = useState("reading");
  const [progress, setProgress] = useState({ percent: 0, current: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [errors, setErrors] = useState([]);
  const [importError, setImportError] = useState("");
  const [recentImports, setRecentImports] = useState([]);

  const missingRequired = useMemo(
    () => getMissingRequiredFields(mapping),
    [mapping]
  );

  const reset = () => {
    setStep("upload");
    setFile(null);
    setFileError("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setStats(null);
    setStage("reading");
    setProgress({ percent: 0, current: 0, total: 0 });
    setSummary(null);
    setErrors([]);
    setImportError("");
  };

  useEffect(() => {
    if (!isOpen) return;
    reset();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape" && step !== "importing") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, step]);

  if (!isOpen) return null;

  const handleFileChange = async (f) => {
    setFile(f);
    setFileError("");
    setStep("mapping");
    try {
      const parsed = await parseSpreadsheet(f);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(buildInitialMapping(parsed.headers));
    } catch (e) {
      setFileError(e?.message || "Failed to read the spreadsheet.");
      setFile(null);
      setStep("upload");
    }
  };

  const handleMappingNext = () => {
    if (missingRequired.length > 0) {
      setFileError(
        `Please map the required fields: ${missingRequired
          .map((k) => IMPORT_FIELDS[k].label)
          .join(", ")}`
      );
      return;
    }
    setFileError("");
    setStats(computeStats(rows, mapping));
    setStep("preview");
  };

  const doImport = async () => {
    setStep("importing");
    setStage("reading");
    setProgress({ percent: 5, current: 0, total: rows.length });
    setImportError("");

    try {
      // Simulate staged progress for UX (actual work happens server-side).
      // We update progress asynchronously while awaiting the request.
      const stages = [
        { stage: "reading", percent: 20 },
        { stage: "validating", percent: 45 },
        { stage: "duplicates", percent: 65 },
        { stage: "importing", percent: 85 },
      ];

      const res = fetchImportRequest();
      for (const s of stages) {
        setStage(s.stage);
        setProgress((prev) => ({
          ...prev,
          percent: s.percent,
          current: Math.round((s.percent / 100) * rows.length),
        }));
        await new Promise((r) => setTimeout(r, 350));
      }

      const data = await res;
      setStage("importing");
      setProgress({ percent: 100, current: data.summary?.imported ?? 0, total: rows.length });

      setSummary(data.summary);
      setErrors(data.errors || []);
      setStage("completed");

      // Refresh history
      try {
        setRecentImports(await fetchImportHistory());
      } catch {
        /* ignore */
      }

      setStep("done");
      onImported?.();
    } catch (e) {
      setImportError(e?.message || "Import failed. Please try again.");
      setStep("mapping");
      setStage("reading");
    }
  };

  const fetchImportRequest = () => {
    return submitImport({
      file,
      mapping,
      duplicateMode: "skip",
    });
  };

  return (
    <div
      ref={overlayRef}
      className="import-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Import Participants"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && step !== "importing") onClose?.();
      }}
    >
      <div className="import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="import-modal-header">
          <div className="import-header-left">
            <h2 className="import-title">📤 Import Participants</h2>
            <p className="import-subtitle">
              Bulk upload participants from a spreadsheet. Map columns, preview, then import.
            </p>
          </div>
          <button
            className="import-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={step === "importing"}
          >
            ✕
          </button>
        </div>

        <div className="import-modal-body">
          {/* Stepper */}
          <div className="import-steps">
            {["Upload", "Map Columns", "Preview", "Done"].map((label, i) => {
              const stepOrder = ["upload", "mapping", "preview", "done"];
              const currentIdx = stepOrder.indexOf(step);
              const cls =
                i < currentIdx ? "done" : i === currentIdx ? "active" : "";
              return (
                <div className={`import-step ${cls}`} key={label}>
                  <div className="import-step-num">{i < currentIdx ? "✓" : i + 1}</div>
                  <div className="import-step-label">{label}</div>
                </div>
              );
            })}
          </div>

          {importError ? (
            <div className="import-error-banner" role="alert">
              {importError}
            </div>
          ) : null}

          {step === "upload" && (
            <div className="import-step-content">
              <ImportDropzone
                file={file}
                onFileChange={handleFileChange}
                onError={setFileError}
              />
              {fileError ? <div className="import-error-text">{fileError}</div> : null}
              <div className="import-tips">
                <b>Tips:</b> Use a template from the Registrar, Google Sheets, Excel, or
                LibreOffice. Common column names are auto-detected.
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="import-step-content">
              <div className="import-section-title">Map Spreadsheet Columns</div>
              <p className="import-section-sub">
                Columns were auto-detected. Review and adjust the mapping if needed.
              </p>
              <ColumnMappingTable
                headers={headers}
                mapping={mapping}
                onChange={setMapping}
              />
              {fileError ? <div className="import-error-text">{fileError}</div> : null}
            </div>
          )}

          {step === "preview" && (
            <div className="import-step-content">
              <div className="import-section-title">Preview &amp; Validation</div>
              <ImportPreviewTable rows={rows} stats={stats} mapping={mapping} />
            </div>
          )}

          {step === "importing" && (
            <div className="import-step-content import-centered">
              <ImportProgress
                stage={stage}
                percent={progress.percent}
                current={progress.current}
                total={progress.total}
              />
            </div>
          )}

          {step === "done" && (
            <div className="import-step-content">
              <ImportSummary
                summary={summary}
                errors={errors}
                onClose={onClose}
                fileName={file?.name}
                recentImports={recentImports}
              />
            </div>
          )}
        </div>

        <div className="import-modal-footer">
          {step === "upload" && (
            <button
              type="button"
              className="import-btn import-btn-outline"
              onClick={onClose}
            >
              Cancel
            </button>
          )}

          {step === "mapping" && (
            <>
              <button
                type="button"
                className="import-btn import-btn-outline"
                onClick={() => setStep("upload")}
              >
                Back
              </button>
              <button
                type="button"
                className="import-btn import-btn-primary"
                onClick={handleMappingNext}
                disabled={missingRequired.length > 0}
              >
                Continue
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                type="button"
                className="import-btn import-btn-outline"
                onClick={() => setStep("mapping")}
              >
                Back
              </button>
              <button
                type="button"
                className="import-btn import-btn-danger"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-btn import-btn-primary"
                onClick={doImport}
              >
                ✓ Import Valid Rows Only ({rows.length})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
