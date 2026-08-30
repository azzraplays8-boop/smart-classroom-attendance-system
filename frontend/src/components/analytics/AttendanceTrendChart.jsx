import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays, formatShortDate, getDaysBetween, todayString } from "./analyticsUtils";

const RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "custom", label: "Custom" },
];

const PRESENT_COLOR = "#22c55e";
const LATE_COLOR = "#f59e0b";
const ABSENT_COLOR = "#ef4444";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="an-chart-tooltip">
      <div className="an-chart-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="an-chart-tooltip-row">
          <span
            className="an-chart-tooltip-dot"
            style={{ background: entry.color || entry.payload?.fill }}
          />
          <span className="an-chart-tooltip-name">{entry.name}:</span>
          <span className="an-chart-tooltip-value">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Line/area chart of attendance trend over time.
 * Supports Today, Last 7 Days, Last 30 Days, and Custom Date Range.
 */
function AttendanceTrendChart({ records }) {
  const [range, setRange] = useState("7d");
  const [startDate, setStartDate] = useState(addDays(todayString(), -6));
  const [endDate, setEndDate] = useState(todayString());

  const { data } = useMemo(() => {
    let days = [];
    if (range === "today") {
      days = [todayString()];
    } else if (range === "7d") {
      days = getDaysBetween(addDays(todayString(), -6), todayString());
    } else if (range === "30d") {
      days = getDaysBetween(addDays(todayString(), -29), todayString());
    } else {
      const start = startDate || addDays(todayString(), -6);
      const end = endDate || todayString();
      days = getDaysBetween(start > end ? end : start, end);
    }

    const byDate = new Map();
    for (const day of days) {
      byDate.set(day, { present: 0, late: 0, absent: 0 });
    }

    for (const record of records || []) {
      const dateStr = String(record.attendanceDate || "").slice(0, 10);
      const bucket = byDate.get(dateStr);
      if (!bucket) continue;
      const status = String(record.status || "").toLowerCase();
      if (status === "present") bucket.present += 1;
      else if (status === "late") bucket.late += 1;
      else if (status === "absent") bucket.absent += 1;
      else bucket.present += 1;
    }

    const data = days.map((day) => {
      const bucket = byDate.get(day);
      return {
        label: formatShortDate(day),
        fullDate: day,
        present: bucket?.present || 0,
        late: bucket?.late || 0,
        absent: bucket?.absent || 0,
        total: (bucket?.present || 0) + (bucket?.late || 0) + (bucket?.absent || 0),
      };
    });

    return { days, data };
  }, [records, range, startDate, endDate]);

  const handleRangeChange = (id) => {
    setRange(id);
    if (id === "today") {
      setStartDate(todayString());
      setEndDate(todayString());
    } else if (id === "7d") {
      setStartDate(addDays(todayString(), -6));
      setEndDate(todayString());
    } else if (id === "30d") {
      setStartDate(addDays(todayString(), -29));
      setEndDate(todayString());
    }
  };

  return (
    <div className="an-card">
      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Attendance Trend</h3>
          <p className="an-card-subtitle">Attendance growth / trend over time</p>
        </div>
        <div className="an-trend-controls">
          <div className="an-segmented">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`an-segmented-btn ${range === r.id ? "an-segmented-btn--active" : ""}`}
                onClick={() => handleRangeChange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {range === "custom" ? (
        <div className="an-trend-dates">
          <div className="an-field">
            <label className="an-field-label">From</label>
            <input
              type="date"
              className="an-field-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="an-field">
            <label className="an-field-label">To</label>
            <input
              type="date"
              className="an-field-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="an-chart-legend">
        <span className="an-legend-item an-legend-item--present">Present</span>
        <span className="an-legend-item an-legend-item--late">Late</span>
        <span className="an-legend-item an-legend-item--absent">Absent</span>
      </div>

      <div className="an-chart an-chart--md">
        {data.length === 0 ? (
          <div className="an-chart-empty">No attendance data for the selected range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PRESENT_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PRESENT_COLOR} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradLate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LATE_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LATE_COLOR} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ABSENT_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ABSENT_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-2)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--muted-2)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="present"
                name="Present"
                stroke={PRESENT_COLOR}
                strokeWidth={2.5}
                fill="url(#gradPresent)"
              />
              <Area
                type="monotone"
                dataKey="late"
                name="Late"
                stroke={LATE_COLOR}
                strokeWidth={2.5}
                fill="url(#gradLate)"
              />
              <Area
                type="monotone"
                dataKey="absent"
                name="Absent"
                stroke={ABSENT_COLOR}
                strokeWidth={2.5}
                fill="url(#gradAbsent)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default AttendanceTrendChart;

