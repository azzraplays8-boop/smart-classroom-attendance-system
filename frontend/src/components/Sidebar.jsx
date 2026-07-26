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

function Sidebar() {
  const { user } = useAuth();
  const role = user?.role;

  const hasAccess = (route) => {
    if (!role) return false;
    if (role === "super_admin") return true;
    if (role === "administrator") return true;
    if (role === "teacher") {
      return ["dashboard", "attendance", "attendance-history"].includes(route);
    }
    return false;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Smart Classroom</h2>
        <p>Attendance System</p>
      </div>

      <nav>
        <NavLink to="/" end className="nav-item">
          <FaTachometerAlt />
          <span>Dashboard</span>
        </NavLink>

        {hasAccess("students") && (
          <NavLink to="/students" className="nav-item">
            <FaUserGraduate />
            <span>Students</span>
          </NavLink>
        )}

        <NavLink to="/attendance" className="nav-item">
          <FaCamera />
          <span>Attendance</span>
        </NavLink>

        <NavLink to="/attendance-history" className="nav-item">
          <FaHistory />
          <span>Attendance History</span>
        </NavLink>

        {hasAccess("qr-management") && (
          <NavLink to="/qr-management" className="nav-item">
            <FaQrcode />
            <span>QR Management</span>
          </NavLink>
        )}

        <NavLink to="/reports" className="nav-item">
          <FaChartBar />
          <span>Reports</span>
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
