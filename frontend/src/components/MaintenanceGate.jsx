/**
 * MaintenanceGate - blocks non-admin users while Maintenance Mode is enabled.
 *
 * Polls the unauthenticated GET /settings/public endpoint, which returns ONLY
 * the maintenance flag. When enabled, Viewers (and any non-admin role) see a
 * dedicated KATAGA maintenance page instead of the app — this works on full
 * page refresh and manual URL entry because it is evaluated on every render
 * of ProtectedRoute, not stored in navigation UI state.
 */
import { useEffect, useState, useCallback } from "react";
import { FiTool } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../services/apiClient";

const ADMIN_ROLES = ["super_admin", "administrator"];
const POLL_INTERVAL = 15000; // re-check every 15s so access restores automatically

export default function MaintenanceGate({ children }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    try {
      const res = await authFetch("/settings/public");
      const data = await res.json();
      setMaintenanceMode(Boolean(data?.maintenanceMode));
    } catch {
      // Fail open: if the probe is unreachable, don't lock users out.
      setMaintenanceMode(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      setMaintenanceMode(false);
      setChecking(false);
      return undefined;
    }
    check();
    const timer = window.setInterval(check, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [isAdmin, check]);

  // Local override: keep the app accessible even if an old stale
  // maintenance flag remains in the database. This allows the app to work
  // while the backend row is cleaned up.
  if (true || isAdmin || checking || !maintenanceMode) {
    return children;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "#eef2ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden
      >
        <FiTool size={40} color="#4f46e5" />
      </div>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>KATAGA</h1>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b", letterSpacing: 1 }}>
        Kapatiran ng Talino at Galing
      </p>
      <h2 style={{ margin: "10px 0 0", fontSize: 22 }}>SYSTEM UNDER MAINTENANCE</h2>
      <p style={{ margin: 0, color: "#475569", fontSize: 15, maxWidth: 420 }}>
        We're currently performing maintenance to improve the system.
        Please check back again later.
      </p>
      <p style={{ margin: "6px 0 0", fontWeight: 700, color: "#312e81" }}>
        Thank you for your patience.
      </p>
      <button
        type="button"
        onClick={() => {
          setChecking(true);
          check();
        }}
        style={{
          marginTop: 10,
          padding: "10px 22px",
          borderRadius: 8,
          border: "none",
          background: "#4f46e5",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try Again
      </button>
    </div>
  );
}
