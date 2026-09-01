import { Component } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import Login from "./pages/Login/Login";
import Register from "./pages/Register/Register";
import ProtectedRoute from "./components/ProtectedRoute";

import Dashboard from "./pages/Dashboard";
import MyAttendance from "./pages/MyAttendance";
import Participants from "./pages/Participants";
import Attendance from "./pages/Attendance";
import AttendanceOverview from "./pages/AttendanceOverview";
import AttendanceHistory from "./pages/AttendanceHistory";
import QRManagement from "./pages/QRManagement";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import AccountWorkspace from "./pages/AccountWorkspace";
import UserManagement from "./pages/UserManagement";
import Organizations from "./pages/Organizations";
import LeaveManagement from "./pages/LeaveManagement";
import MyLeave from "./pages/MyLeave";
import MaintenancePage from "./pages/MaintenancePage";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App runtime error:", {
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
      error,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontFamily: "system-ui, sans-serif",
            color: "#0f172a",
            background: "#f8fafc",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 28 }}>Something went wrong while loading the application.</h2>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public routes - no auth required */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/maintenance" element={<MaintenancePage />} />

          {/* Protected routes - require authentication */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/participants" element={<Participants />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/my-attendance" element={<MyAttendance />} />
            <Route path="/attendance-overview" element={<AttendanceOverview />} />
            <Route path="/attendance-history" element={<AttendanceHistory />} />
            <Route path="/qr-management" element={<QRManagement />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/account" element={<AccountWorkspace />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/leave-management" element={<LeaveManagement />} />
            <Route path="/my-leave" element={<MyLeave />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;
