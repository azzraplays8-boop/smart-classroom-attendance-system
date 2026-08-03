import { FaChartLine } from "react-icons/fa";

/**
 * Hero header for the Analytics & Reports dashboard.
 */
function AnalyticsHeader({ title = "Analytics & Reports", subtitle, icon }) {
  return (
    <div className="an-header">
      <div className="an-header-icon" aria-hidden="true">
        {icon || <FaChartLine />}
      </div>
      <div className="an-header-text">
        <h2 className="an-header-title">{title}</h2>
        <p className="an-header-subtitle">
          {subtitle ||
            "Monitor attendance trends, generate reports, and gain meaningful insights from attendance records."}
        </p>
      </div>
    </div>
  );
}

export default AnalyticsHeader;

