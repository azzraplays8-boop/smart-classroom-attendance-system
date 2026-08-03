import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { normalizeStatus } from "./analyticsUtils";

const COLORS = {
  present: "#22c55e",
  late: "#f59e0b",
  absent: "#ef4444",
};

function StatusTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="an-chart-tooltip">
      <div className="an-chart-tooltip-row">
        <span className="an-chart-tooltip-dot" style={{ background: item.payload.fill }} />
        <span className="an-chart-tooltip-name">{item.name}:</span>
        <span className="an-chart-tooltip-value">{item.value}</span>
      </div>
    </div>
  );
}

/**
 * Doughnut chart of attendance status distribution (Present / Late / Absent)
 * with percentages.
 */
function AttendanceStatusChart({ records }) {
  const data = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0 };
    for (const record of records || []) {
      const status = normalizeStatus(record.status);
      if (counts[status] !== undefined) counts[status] += 1;
    }
    const total = counts.present + counts.late + counts.absent;
    return Object.entries(counts).map(([key, value]) => ({
      key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value,
      fill: COLORS[key],
      percent: total > 0 ? Math.round((value / total) * 100) : 0,
    }));
  }, [records]);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="an-card">
      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Attendance Status Distribution</h3>
          <p className="an-card-subtitle">Present · Late · Absent breakdown</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="an-chart-empty an-chart-empty--tall">No attendance data available.</div>
      ) : (
        <div className="an-status-layout">
          <div className="an-chart an-chart--status">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="86%"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<StatusTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="an-status-center">
              <div className="an-status-center-value">{total}</div>
              <div className="an-status-center-label">Total</div>
            </div>
          </div>

          <div className="an-status-legend">
            {data.map((entry) => (
              <div key={entry.key} className="an-status-legend-row">
                <span
                  className="an-status-legend-dot"
                  style={{ background: entry.fill }}
                />
                <span className="an-status-legend-name">{entry.name}</span>
                <span className="an-status-legend-count">{entry.value}</span>
                <span className="an-status-legend-percent">{entry.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AttendanceStatusChart;

