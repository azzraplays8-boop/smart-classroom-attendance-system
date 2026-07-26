import { useEffect, useMemo, useRef } from "react";

import "../../styles/students/ConfirmDialog.css";

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  primaryLabel,
  primaryVariant = "danger",
  primaryDisabled = false,
  onPrimary,
  onCancel,
  secondaryLabel = "Cancel",
  secondaryVariant = "outline",
  requireTypedText = null,
  typedText = "",
  onTypedTextChange = null,
  typedPlaceholder = "",
  children,
}) {
  const firstFocusableRef = useRef(null);

  const canSubmit = useMemo(() => {
    if (!requireTypedText) return true;
    return String(typedText).trim() === String(requireTypedText).trim();
  }, [requireTypedText, typedText]);

  const effectivePrimaryDisabled = Boolean(primaryDisabled) || !canSubmit;

  useEffect(() => {
    if (!isOpen) return;

    const t = window.setTimeout(() => {
      firstFocusableRef.current?.focus?.();
    }, 0);

    return () => window.clearTimeout(t);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="confirmdlg-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel?.();
        }
      }}
    >
      <div className="confirmdlg-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="confirmdlg-header" role="banner">
          <div className="confirmdlg-titlewrap">
            <h2 className="confirmdlg-title">{title}</h2>
          </div>
          <button
            type="button"
            className="confirmdlg-close"
            aria-label="Close"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className="confirmdlg-body">
          <div className="confirmdlg-message">{message}</div>

          {details ? <div className="confirmdlg-details">{details}</div> : null}

          {requireTypedText ? (
            <div className="confirmdlg-typed">
              <div className="confirmdlg-typed-warning">
                This action cannot be undone.
              </div>

              <input
                className="confirmdlg-typed-input"
                type="text"
                value={typedText}
                placeholder={typedPlaceholder || requireTypedText}
                onChange={(e) => onTypedTextChange?.(e.target.value)}
                aria-label={`Type ${requireTypedText} to confirm`}
              />

              <div className="confirmdlg-typed-helper">
                Type <b>{requireTypedText}</b> to enable.
              </div>
            </div>
          ) : null}

          {children}
        </div>

        <div className="confirmdlg-footer">
          <button
            type="button"
            className={`confirmdlg-btn ${secondaryVariant === "danger" ? "confirmdlg-btn-danger" : "confirmdlg-btn-outline"}`}
            onClick={onCancel}
            ref={firstFocusableRef}
          >
            {secondaryLabel}
          </button>

          <button
            type="button"
            className={`confirmdlg-btn ${
              primaryVariant === "danger"
                ? "confirmdlg-btn-danger"
                : primaryVariant === "primary"
                  ? "confirmdlg-btn-primary"
                  : "confirmdlg-btn-outline"
            }`}
            onClick={onPrimary}
            disabled={effectivePrimaryDisabled}
            aria-disabled={effectivePrimaryDisabled}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

