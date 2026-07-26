import { useEffect, useState } from "react";

import "../styles/Dashboard.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

function Dashboard() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    lateToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/attendance/dashboard`, {
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch dashboard stats");
      }

      setStats({
        totalStudents: Number(data?.totalStudents ?? data?.total ?? 0) || 0,
        presentToday: Number(data?.presentToday ?? data?.present ?? 0) || 0,
        lateToday: Number(data?.lateToday ?? data?.late ?? 0) || 0,
        absentToday: Number(data?.absentToday ?? data?.absent ?? 0) || 0,
      });
    } catch (err) {
      setError(err?.message || "Unable to load dashboard stats.");
      setStats({
        totalStudents: 0,
        presentToday: 0,
        lateToday: 0,
        absentToday: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();

    const handleAttendanceChange = () => fetchDashboardStats();
    window.addEventListener("attendance-records-changed", handleAttendanceChange);

    return () => {
      window.removeEventListener("attendance-records-changed", handleAttendanceChange);
    };
  }, []);

  return (
    <div className="dashboard">
      <h1>🎓 Smart Classroom Attendance System</h1>
      <p>Welcome, Administrator</p>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div> : null}

      <div className="cards">
        <div className="card">
          <h2>👥 Students</h2>
          <h3>{loading ? "…" : stats.totalStudents}</h3>
        </div>

        <div className="card">
          <h2>✅ Present</h2>
          <h3>{loading ? "…" : stats.presentToday}</h3>
        </div>

        <div className="card">
          <h2>⏰ Late</h2>
          <h3>{loading ? "…" : stats.lateToday}</h3>
        </div>

        <div className="card">
          <h2>❌ Absent</h2>
          <h3>{loading ? "…" : stats.absentToday}</h3>
        </div>
      </div>

      <button className="attendance-btn" type="button" onClick={() => (window.location.href = "/attendance")}>
        📷 Start Attendance
      </button>
    </div>
  );
}

export default Dashboard;

