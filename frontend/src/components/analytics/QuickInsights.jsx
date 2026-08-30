import { useMemo } from "react";
import {
  FiTrendingUp,
  FiTrendingDown,
  FiAward,
  FiAlertTriangle,
  FiPercent,
  FiClock,
} from "react-icons/fi";
import { formatFullDate, formatHourLabel, getHour, normalizeStatus } from "./analyticsUtils";

function InsightCard({ icon, label, value, tone }) {
  return (
    <div className={`an-insight an-insight--${tone}`}>
      <div className={`an-insight-icon an-insight-icon--${tone}`}>{icon}</div>
      <div className="an-insight-meta">
        <span className="an-insight-label">{label}</span>
        <span className="an-insight-value">{value}</span>
      </div>
    </div>
  );
}

/**
 * Automatically computed quick insights.
 */
function QuickInsights({ records }) {
  const insights = useMemo(() => {
    if (!records || records.length === 0) {
      return {
        highestDay: { label: "-", value: 0 },
        lowestDay: { label: "-", value: 0 },
        mostActiveCourse: "-",
        mostAbsentCourse: "-",
        avgRate: 0,
        commonTime: "-",
      };
    }

    // Group by date
    const byDate = new Map();
    for (const record of records) {
      const dateStr = String(record.attendanceDate || "").slice(0, 10) || "Unknown";
      if (!byDate.has(dateStr)) byDate.set(dateStr, { present: 0, late: 0, absent: 0, total: 0 });
      const bucket = byDate.get(dateStr);
      bucket.total += 1;
      const status = normalizeStatus(record.status);
      if (status === "late") bucket.late += 1;
      else if (status === "absent") bucket.absent += 1;
      else bucket.present += 1;
    }

    let highestDay = null;
    let lowestDay = null;
    for (const [dateStr, bucket] of byDate.entries()) {
      if (!highestDay || bucket.total > highestDay.value) highestDay = { label: dateStr, value: bucket.total };
      if (!lowestDay || bucket.total < lowestDay.value) lowestDay = { label: dateStr, value: bucket.total };
    }

    // By course
    const courseMap = new Map();
    for (const record of records) {
      const course = String(record.department || record.course || "Unknown").trim() || "Unknown";
      if (!courseMap.has(course)) courseMap.set(course, { present: 0, late: 0, absent: 0, total: 0 });
      const bucket = courseMap.get(course);
      bucket.total += 1;
      const status = normalizeStatus(record.status);
      if (status === "late") bucket.late += 1;
      else if (status === "absent") bucket.absent += 1;
      else bucket.present += 1;
    }

    let mostActiveCourse = null;
    let mostAbsentCourse = null;
    for (const [course, bucket] of courseMap.entries()) {
      if (!mostActiveCourse || bucket.present > mostActiveCourse.value) {
        mostActiveCourse = { label: course, value: bucket.present };
      }
      if (!mostAbsentCourse || bucket.absent > mostAbsentCourse.value) {
        mostAbsentCourse = { label: course, value: bucket.absent };
      }
    }

    // Average attendance rate
    const totalRecords = records.length;
    const presentRecords = records.filter((r) => normalizeStatus(r.status) === "present").length;
    const avgRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    // Most common check-in hour
    const hourCount = new Map();
    for (const record of records) {
      const hour = getHour(record.timeIn);
      if (hour === null) continue;
      hourCount.set(hour, (hourCount.get(hour) || 0) + 1);
    }
    let commonHour = null;
    for (const [hour, count] of hourCount.entries()) {
      if (!commonHour || count > commonHour.value) commonHour = { hour, value: count };
    }

    return {
      highestDay: highestDay ? { label: formatFullDate(highestDay.label), value: highestDay.value } : { label: "-", value: 0 },
      lowestDay: lowestDay ? { label: formatFullDate(lowestDay.label), value: lowestDay.value } : { label: "-", value: 0 },
      mostActiveCourse: mostActiveCourse ? `${mostActiveCourse.label} (${mostActiveCourse.value})` : "-",
      mostAbsentCourse: mostAbsentCourse ? `${mostAbsentCourse.label} (${mostAbsentCourse.value})` : "-",
      avgRate,
      commonTime: commonHour ? formatHourLabel(commonHour.hour) : "-",
    };
  }, [records]);

  return (
    <div className="an-card">
      <div className="an-card-header">
        <div>
          <h3 className="an-card-title">Quick Insights</h3>
          <p className="an-card-subtitle">Automatically computed from attendance data</p>
        </div>
      </div>

      <div className="an-insight-grid">
        <InsightCard icon={<FiTrendingUp />} label="Highest Attendance Day" value={`${insights.highestDay.label} · ${insights.highestDay.value}`} tone="green" />
        <InsightCard icon={<FiTrendingDown />} label="Lowest Attendance Day" value={`${insights.lowestDay.label} · ${insights.lowestDay.value}`} tone="red" />
        <InsightCard icon={<FiAward />} label="Most Active Course" value={insights.mostActiveCourse} tone="indigo" />
        <InsightCard icon={<FiAlertTriangle />} label="Most Absent Course" value={insights.mostAbsentCourse} tone="amber" />
        <InsightCard icon={<FiPercent />} label="Average Attendance Rate" value={`${insights.avgRate}%`} tone="violet" />
        <InsightCard icon={<FiClock />} label="Most Common Check-in Time" value={insights.commonTime} tone="blue" />
      </div>
    </div>
  );
}

export default QuickInsights;

