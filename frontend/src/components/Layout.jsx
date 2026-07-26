import { Outlet } from "react-router-dom";

import "../styles/Layout.css";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

function Layout() {
  return (
    <div className="layout">
      <Sidebar />

      <div className="main-content">
        <Topbar />

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;