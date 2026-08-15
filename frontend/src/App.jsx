import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import Login from "./pages/Login/Login";
import Register from "./pages/Register/Register";
import ProtectedRoute from "./components/ProtectedRoute";

import Dashboard from "./pages/Dashboard";
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - no auth required */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes - require authentication */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/participants" element={<Participants />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/attendance-history" element={<AttendanceHistory />} />
          <Route path="/qr-management" element={<QRManagement />} />
<Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/account" element={<AccountWorkspace />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/organizations" element={<Organizations />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
