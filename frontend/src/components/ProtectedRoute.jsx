/**
 * ProtectedRoute - Guards routes behind authentication + role-based access.
 *
 * If the user is not authenticated, they are redirected to /login.
 * If the user lacks the required role(s), they see a 403 "Access Denied" page.
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { canAccessRoute } from "../context/AuthContext";
import MaintenanceGate from "./MaintenanceGate";

/**
 * Map of route paths to permission keys.
 */
const ROUTE_PERMISSION_MAP = {
  "/": "dashboard",
  "/participants": "participants",
  "/attendance": "attendance",
  "/attendance-overview": "attendance-overview",
  "/my-attendance": "my-attendance",
  "/attendance-history": "attendance-history",
  "/qr-management": "qr-management",
  "/reports": "reports",
  "/settings": "settings",
  "/user-management": "user-management",
  "/organizations": "organizations",
  "/leave-management": "leave-management",
  "/my-leave": "my-leave",
  "/account": "account",
};

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  // Still restoring auth state
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#64748b",
          fontFamily: "system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Loading...
      </div>
    );
  }

  // Not authenticated — redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  const permissionKey = ROUTE_PERMISSION_MAP[location.pathname];
  if (permissionKey) {
    const hasAccess = canAccessRoute(user, permissionKey);

    if (!hasAccess) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "80vh",
            gap: 16,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 900, color: "#e2e8f0" }}>403</div>
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: 22 }}>Access Denied</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            You do not have permission to view this page.
          </p>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
            Contact your administrator if you need access.
          </p>
        </div>
      );
    }
  }

  // Maintenance mode: non-admin roles are blocked from ALL protected pages
  // (works on refresh and manual URL entry — see MaintenanceGate).
  return <MaintenanceGate>{children}</MaintenanceGate>;
}

export default ProtectedRoute;
