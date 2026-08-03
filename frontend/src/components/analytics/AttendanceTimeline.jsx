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
import { formatHourLabel, getHour } from "./analyticsUtils";

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="an-chart-tooltip">
      <div className="an-chart-tooltip-row">
        <span className="an-chart-tooltip-dot" style={{ background: item.fill }} />
        <span className="an-chart-tooltip-name">{label}:</span>
        <span className="an-chart-tooltip-value">{item.value} check-in{item.value === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

/**
 * Peak check-in hours timeline.
 */
function AttendanceTimeline({ records }) {
  const data = useMemo(() => {
    const buckets = HOURS.map((hour) => ({
      hour,
      label: formatHourLabel(hour),
      count: 0,
    }));
    for (const record of records || []) {
      const hour = getHour(record.timeIn);
      if (hour === null) continue;
      const bucket = buckets.find((b) => b.hour === hour);
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [records]);

  const max = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);

  return (
    <div className="an-card">
      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Attendance Timeline</h3>
          <p className="an-card-subtitle">Peak check-in hours</p>
        </div>
      </div>

      <div className="an-chart an-chart--timeline">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-2)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, max]}
              tick={{ fill: "var(--muted-2)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TimelineTooltip />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
            <Bar dataKey="count" name="Check-ins" fill="#818cf8" radius={[5, 5, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default AttendanceTimeline;

