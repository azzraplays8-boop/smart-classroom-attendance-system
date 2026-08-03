import "../../styles/qr/QRManagement.css";

const CARD_ICONS = {
  totalParticipants: "👥",
  qrGenerated: "✅",
  missingQr: "⚠️",
  printedQr: "🖨️",
};

const CARD_COLORS = {
  totalParticipants: { bg: "#eef2ff", border: "#c7d2fe", text: "#4338ca" },
  qrGenerated: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  missingQr: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" },
  printedQr: { bg: "#fefce8", border: "#fef08a", text: "#854d0e" },
};

function QRCard({ label, value, type }) {
  const colors = CARD_COLORS[type] || CARD_COLORS.totalParticipants;
  const icon = CARD_ICONS[type] || CARD_ICONS.totalParticipants || "📊";

  return (
    <div
      className="qr-summary-card"
      style={{
        background: colors.bg,
        borderColor: colors.border,
      }}
    >
      <div className="qr-summary-card-icon">{icon}</div>
      <div className="qr-summary-card-content">
        <div className="qr-summary-card-label" style={{ color: colors.text }}>
          {label}
        </div>
        <div className="qr-summary-card-value" style={{ color: colors.text }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default QRCard;

