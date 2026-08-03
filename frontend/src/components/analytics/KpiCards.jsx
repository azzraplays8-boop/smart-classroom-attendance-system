import {
  FiDatabase,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiPercent,
  FiSunrise,
  FiUsers,
  FiUserCheck,
} from "react-icons/fi";

const CARD_DEFS = [
  { key: "totalRecords", label: "Total Attendance Records", icon: <FiDatabase />, tone: "indigo" },
  { key: "presentToday", label: "Present Today", icon: <FiCheckCircle />, tone: "green" },
  { key: "lateToday", label: "Late Today", icon: <FiClock />, tone: "amber" },
  { key: "absentToday", label: "Absent Today", icon: <FiXCircle />, tone: "red" },
  { key: "attendanceRate", label: "Attendance Rate", icon: <FiPercent />, tone: "violet", suffix: "%" },
  { key: "averageCheckIn", label: "Average Check-in Time", icon: <FiSunrise />, tone: "blue" },
  { key: "totalParticipants", label: "Total Participants", icon: <FiUsers />, tone: "slate" },
  { key: "activeToday", label: "Active Participants Today", icon: <FiUserCheck />, tone: "teal" },
];

/**
 * KPI statistic cards.
 */
function KpiCards({ kpis }) {
  return (
    <div className="an-kpi-grid">
      {CARD_DEFS.map((card) => (
        <div key={card.key} className={`an-kpi-card an-kpi-card--${card.tone}`}>
          <div className={`an-kpi-icon an-kpi-icon--${card.tone}`}>{card.icon}</div>
          <div className="an-kpi-meta">
            <span className="an-kpi-label">{card.label}</span>
            <span className="an-kpi-value">
              {kpis[card.key]}
              {card.suffix ? <span className="an-kpi-suffix">{card.suffix}</span> : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default KpiCards;

