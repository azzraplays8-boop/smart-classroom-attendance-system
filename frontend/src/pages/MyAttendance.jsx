import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../services/apiClient";

function formatDate(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "present") return "status-pill status-pill--present";
  if (normalized === "late") return "status-pill status-pill--late";
  if (normalized === "absent") return "status-pill status-pill--absent";
  return "status-pill";
}

export default function MyAttendance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ totalRecords: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch("/attendance/me");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Failed to load your attendance");
        if (ignore) return;
        setMember(data?.member || null);
        setRecords(Array.isArray(data?.records) ? data.records : []);
        setSummary(data?.summary || { totalRecords: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 });
      } catch (err) {
        if (!ignore) setError(err?.message || "Unable to load your attendance.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const memberName = useMemo(() => {
    if (!member) return user?.full_name || "Viewer";
    return [member.firstName, member.lastName].filter(Boolean).join(" ") || user?.full_name || "Viewer";
  }, [member, user]);

  return (
    <div className="page-shell" style={{ padding: 24 }}>
      <div className="card" style={{ padding: 24, borderRadius: 18, marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 28 }}>My Attendance</h2>
      </div>

      {error ? <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div> : null}

      {loading ? (
        <div className="card" style={{ padding: 24, borderRadius: 18 }}>Loading your attendance...</div>
      ) : !member ? (
        <div className="card" style={{ padding: 24, borderRadius: 18 }}>
          Your account is not yet linked to a participant record. Please contact an administrator.
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 24, borderRadius: 18, marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>{memberName}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <div><strong>Participant Number</strong><div>{member.participantIdentifier || "—"}</div></div>
              <div><strong>Course / Strand</strong><div>{member.department || "—"}</div></div>
              <div><strong>Year Level</strong><div>{member.year || "—"}</div></div>
              <div><strong>Section</strong><div>{member.section || "—"}</div></div>
            </div>
          </div>

          <div className="card" style={{ padding: 24, borderRadius: 18, marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              <div className="metric-box"><strong>Total Attendance</strong><div>{summary.totalRecords}</div></div>
              <div className="metric-box"><strong>Present</strong><div>{summary.present}</div></div>
              <div className="metric-box"><strong>Late</strong><div>{summary.late}</div></div>
              <div className="metric-box"><strong>Absent</strong><div>{summary.absent}</div></div>
              <div className="metric-box"><strong>Attendance Rate</strong><div>{summary.attendanceRate}%</div></div>
            </div>
          </div>

          <div className="card" style={{ padding: 24, borderRadius: 18 }}>
            <h3 style={{ marginTop: 0 }}>My Attendance History</h3>
            {records.length === 0 ? (
              <div>No attendance records yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 8px" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "10px 8px" }}>Activity/Event</th>
                      <th style={{ textAlign: "left", padding: "10px 8px" }}>Time In</th>
                      <th style={{ textAlign: "left", padding: "10px 8px" }}>Time Out</th>
                      <th style={{ textAlign: "left", padding: "10px 8px" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "10px 8px" }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td style={{ padding: "10px 8px" }}>{formatDate(record.attendanceDate)}</td>
                        <td style={{ padding: "10px 8px" }}>{record.activity || "Attendance"}</td>
                        <td style={{ padding: "10px 8px" }}>{formatTime(record.timeIn)}</td>
                        <td style={{ padding: "10px 8px" }}>{formatTime(record.timeOut)}</td>
                        <td style={{ padding: "10px 8px" }}><span className={statusClass(record.status)}>{record.status || "—"}</span></td>
                        <td style={{ padding: "10px 8px" }}>{record.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
