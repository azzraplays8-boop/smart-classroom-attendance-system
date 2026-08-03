import "../../styles/participants/ParticipantsToolbar.css";

function ParticipantsToolbar({ value, onChange, onAddClick, onDeleteAllClick, isDeleteAllDisabled, isDeletingAll = false }) {
  return (
    <div className="participants-toolbar">

      <div className="participants-search">
        <svg className="participants-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={value || ""}
          placeholder="Search participants..."
          onChange={(e) => onChange?.(e.target.value)}
          aria-label="Search participants"
        />
      </div>

      <div className="participants-toolbar-actions">
        <button
          className="participants-add-btn"
          type="button"
          onClick={onAddClick}
        >
          + Add Participant
        </button>

        <button
          className="participants-deleteall-btn"
          type="button"
          onClick={onDeleteAllClick}
          disabled={Boolean(isDeleteAllDisabled)}
          aria-disabled={Boolean(isDeleteAllDisabled)}
        >
          {isDeletingAll ? "Deleting All..." : "Delete All Participants"}
        </button>
      </div>

    </div>
  );
}

export default ParticipantsToolbar;

