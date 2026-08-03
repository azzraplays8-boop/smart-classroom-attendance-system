import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { normalizeStatus } from "./analyticsUtils";

const COLORS = {
  present: "#22c55e",
  late: "#f59e0b",
  absent: "#ef4444",
};

function CourseTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="an-chart-tooltip">
      <div className="an-chart-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="an-chart-tooltip-row">
          <span className="an-chart-tooltip-dot" style={{ background: entry.fill }} />
          <span className="an-chart-tooltip-name">{entry.name}:</span>
          <span className="an-chart-tooltip-value">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Horizontal bar chart of attendance grouped by course/department.
 */
function CourseChart({ records }) {
  const data = useMemo(() => {
    const map = new Map();
    for (const record of records || []) {
      const course = String(record.department || record.course || "Unknown").trim() || "Unknown";
      if (!map.has(course)) {
        map.set(course, { course, present: 0, late: 0, absent: 0, total: 0 });
      }
      const bucket = map.get(course);
      bucket.total += 1;
      const status = normalizeStatus(record.status);
      if (status === "late") bucket.late += 1;
      else if (status === "absent") bucket.absent += 1;
      else bucket.present += 1;
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [records]);

  return (
    <div className="an-card">
      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Attendance by Course</h3>
          <p className="an-card-subtitle">Course / Strand / Department breakdown</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="an-chart-empty an-chart-empty--tall">No attendance data available.</div>
      ) : (
        <div className="an-chart an-chart--bar">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-2)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="course"
                width={84}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CourseTooltip />} />
              <Bar dataKey="present" name="Present" stackId="a" fill={COLORS.present} radius={[0, 0, 0, 0]} />
              <Bar dataKey="late" name="Late" stackId="a" fill={COLORS.late} radius={[0, 0, 0, 0]} />
              <Bar dataKey="absent" name="Absent" stackId="a" fill={COLORS.absent} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default CourseChart;

