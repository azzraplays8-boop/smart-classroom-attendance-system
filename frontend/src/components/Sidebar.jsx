import { NavLink } from "react-router-dom";
import {
  FaTachometerAlt,
  FaUserGraduate,
  FaCamera,
  FaHistory,
  FaChartBar,
  FaCog,
  FaQrcode,
} from "react-icons/fa";

import "../styles/Sidebar.css";
import { useAuth } from "../hooks/useAuth";
import { useOrgLabels } from "../config/labels";
import { APP_SHORT_NAME, APP_TAGLINE } from "../constants";

function Sidebar() {
  const { user } = useAuth();
  const labels = useOrgLabels();
  const role = user?.role;

  const hasAccess = (route) => {
    if (!role) return false;
    if (role === "super_admin") return true;
    if (role === "administrator") return true;
    if (role === "teacher") {
      return ["dashboard", "attendance", "attendance-history"].includes(route);
    }
    // Future roles
    if (role === "manager" || role === "officer") {
      return ["dashboard", "attendance", "attendance-history", "reports"].includes(route);
    }
    if (role === "staff" || role === "viewer") {
      return ["dashboard"].includes(route);
    }
    return false;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>{APP_SHORT_NAME}</h2>
        <p>{APP_TAGLINE}</p>
      </div>

      <nav>
        <NavLink to="/" end className="nav-item">
          <FaTachometerAlt />
          <span>Dashboard</span>
        </NavLink>

        {hasAccess("students") && (
          <NavLink to="/students" className="nav-item">
            <FaUserGraduate />
            <span>{labels.entityLabel}</span>
          </NavLink>
        )}

        <NavLink to="/attendance" className="nav-item">
          <FaCamera />
          <span>Attendance</span>
        </NavLink>

        <NavLink to="/attendance-history" className="nav-item">
          <FaHistory />
          <span>Attendance Records</span>
        </NavLink>

        {hasAccess("qr-management") && (
        <NavLink to="/qr-management" className="nav-item">
            <FaQrcode />
            <span>QR Check-in</span>
          </NavLink>
        )}

        <NavLink to="/reports" className="nav-item">
          <FaChartBar />
          <span>Analytics & Reports</span>
        </NavLink>

        {hasAccess("settings") && (
          <NavLink to="/settings" className="nav-item">
            <FaCog />
            <span>Settings</span>
          </NavLink>
        )}
      </nav>
    </aside>
  );
}

export default Sidebar;
