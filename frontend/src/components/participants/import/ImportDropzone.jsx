import { useRef, useState } from "react";
import { isAcceptedSpreadsheet } from "../../../services/importService";

/**
 * ImportDropzone
 * Drag & drop + browse upload area with file validation for .xlsx/.xls/.csv.
 */
export default function ImportDropzone({ file, onFileChange, onError }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    if (!isAcceptedSpreadsheet(f.name)) {
      onError?.("Unsupported file type. Please upload a .xlsx, .xls, or .csv file.");
      return;
    }
    onError?.("");
    onFileChange?.(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    handleFile(f);
  };

  return (
    <div
      className={`import-dropzone${dragOver ? " is-dragging" : ""}${file ? " has-file" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label="Drop a spreadsheet file here or browse to upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {file ? (
        <div className="import-dropzone-file">
          <div className="import-dropzone-file-icon">📄</div>
          <div className="import-dropzone-file-name">{file.name}</div>
          <div className="import-dropzone-file-meta">
            {(file.size / 1024).toFixed(1)} KB • Click to replace
          </div>
        </div>
      ) : (
        <>
          <div className="import-dropzone-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="import-dropzone-title">
            Drag &amp; drop your spreadsheet here
          </div>
          <div className="import-dropzone-sub">
            or <span className="import-dropzone-browse">browse files</span>
          </div>
          <div className="import-dropzone-hint">
            Accepted formats: .xlsx, .xls, .csv
          </div>
        </>
      )}
    </div>
  );
}
