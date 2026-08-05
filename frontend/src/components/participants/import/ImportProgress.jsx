/**
 * ImportProgress
 * Staged progress indicator during import:
 * Reading → Validating → Checking Duplicates → Importing → Completed
 */
const STAGES = [
  { key: "reading", label: "Reading" },
  { key: "validating", label: "Validating" },
  { key: "duplicates", label: "Checking Duplicates" },
  { key: "importing", label: "Importing" },
  { key: "completed", label: "Completed" },
];

export default function ImportProgress({ stage, percent, current, total }) {
  const stageIndex = STAGES.findIndex((s) => s.key === stage);
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));

  return (
    <div className="import-progress">
      <div className="import-progress-stages">
        {STAGES.map((s, i) => {
          const state =
            i < stageIndex
              ? "done"
              : i === stageIndex
                ? "active"
                : "pending";
          return (
            <div className={`import-stage ${state}`} key={s.key}>
              <div className="import-stage-dot">
                {state === "done" ? "✓" : i + 1}
              </div>
              <div className="import-stage-label">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="import-progress-bar-track">
        <div className="import-progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="import-progress-meta">
        <span className="import-progress-title">
          {stage === "completed" ? "Import Completed" : "Importing Participants..."}
        </span>
        <span className="import-progress-count">
          {current != null && total != null ? `${current} / ${total}` : `${pct}%`}
        </span>
      </div>
    </div>
  );
}
