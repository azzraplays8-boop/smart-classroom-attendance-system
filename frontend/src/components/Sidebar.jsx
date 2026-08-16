import { NavLink } from "react-router-dom";
import {
  FaTachometerAlt,
  FaUserGraduate,
  FaCamera,
  FaHistory,
  FaChartBar,
  FaCog,
  FaQrcode,
  FaUsersCog,
  FaBuilding,
  FaClipboardList,
  FaUser,
  FaEye,
} from "react-icons/fa";

import "../styles/Sidebar.css";
import { useAuth } from "../hooks/useAuth";
import { useOrgLabels } from "../config/labels";
import { APP_SHORT_NAME, APP_TAGLINE } from "../constants";

function Sidebar() {
  const { user } = useAuth();
  const labels = useOrgLabels();
  const role = user?.role;

  const hasRoute = (route) => {
    if (!role) return false;
    if (role === "super_admin") return true;
    if (role === "administrator") return !["organizations"].includes(route);
        if (role === "teacher") {
      return ["dashboard", "attendance", "attendance-history", "account"].includes(route);
    }
    if (role === "moderator") {
      return ["dashboard", "participants", "attendance", "attendance-history", "reports", "account"].includes(route);
    }
    if (role === "encoder") {
      return ["dashboard", "participants", "attendance", "attendance-history", "account"].includes(route);
    }
    if (role === "viewer") {
      return ["dashboard", "my-attendance", "account"].includes(route);
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

        {hasRoute("participants") && (
          <NavLink to="/participants" className="nav-item">
            <FaUserGraduate />
            <span>{labels.entityLabel}</span>
          </NavLink>
        )}

                {hasRoute("attendance") && (
          <NavLink to="/attendance" className="nav-item">
            <FaCamera />
            <span>Attendance</span>
          </NavLink>
        )}

        {hasRoute("my-attendance") && (
          <NavLink to="/my-attendance" className="nav-item">
            <FaEye />
            <span>My Attendance</span>
          </NavLink>
        )}

        {hasRoute("attendance-history") && (
          <NavLink to="/attendance-history" className="nav-item">
            <FaHistory />
            <span>Attendance Records</span>
          </NavLink>
        )}

        {hasRoute("qr-management") && (
          <NavLink to="/qr-management" className="nav-item">
            <FaQrcode />
            <span>QR Check-in</span>
          </NavLink>
        )}

        {hasRoute("reports") && (
          <NavLink to="/reports" className="nav-item">
            <FaChartBar />
            <span>Analytics & Reports</span>
          </NavLink>
        )}

        {hasRoute("user-management") && (
          <NavLink to="/user-management" className="nav-item">
            <FaUsersCog />
            <span>User Management</span>
          </NavLink>
        )}

        {hasRoute("organizations") && (
          <NavLink to="/organizations" className="nav-item">
            <FaBuilding />
            <span>Organizations</span>
          </NavLink>
        )}

        {hasRoute("settings") && (
          <NavLink to="/settings" className="nav-item">
            <FaCog />
            <span>Settings</span>
          </NavLink>
        )}

        {hasRoute("account") && (
          <NavLink to="/account" className="nav-item">
            <FaUser />
            <span>My Account</span>
          </NavLink>
        )}
      </nav>
    </aside>
  );
}

export default Sidebar;
