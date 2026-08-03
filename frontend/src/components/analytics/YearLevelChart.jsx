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

function YearLevelTooltip({ active, payload, label }) {
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

const ORDER = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

function normalizeYear(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (ORDER.find((o) => o.toLowerCase() === lower)) return raw;
  // "1", "2", etc.
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n === 1) return "1st Year";
    if (n === 2) return "2nd Year";
    if (n === 3) return "3rd Year";
    if (n === 4) return "4th Year";
    if (n === 5) return "5th Year";
  }
  return raw;
}

/**
 * Bar chart of attendance by year level.
 */
function YearLevelChart({ records }) {
  const data = useMemo(() => {
    const map = new Map();
    for (const record of records || []) {
      const year = normalizeYear(record.year);
      if (!map.has(year)) {
        map.set(year, { year, present: 0, late: 0, absent: 0, total: 0 });
      }
      const bucket = map.get(year);
      bucket.total += 1;
      const status = normalizeStatus(record.status);
      if (status === "late") bucket.late += 1;
      else if (status === "absent") bucket.absent += 1;
      else bucket.present += 1;
    }
    return Array.from(map.values()).sort((a, b) => {
      const ai = ORDER.indexOf(a.year);
      const bi = ORDER.indexOf(b.year);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [records]);

  return (
    <div className="an-card">
      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Attendance by Year Level</h3>
          <p className="an-card-subtitle">1st Year — 5th Year breakdown</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="an-chart-empty an-chart-empty--tall">No attendance data available.</div>
      ) : (
        <div className="an-chart an-chart--bar">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 18, left: -14, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "var(--muted-2)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted-2)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<YearLevelTooltip />} />
              <Bar dataKey="present" name="Present" stackId="a" fill={COLORS.present} />
              <Bar dataKey="late" name="Late" stackId="a" fill={COLORS.late} />
              <Bar dataKey="absent" name="Absent" stackId="a" fill={COLORS.absent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default YearLevelChart;

