import { useLocation } from "react-router-dom";

function PageHeader() {
  const location = useLocation();

  const titleByPath = {
    "/": "Dashboard",
    "/students": "Students",
    "/attendance": "Attendance",
    "/attendance-history": "Attendance History",
    "/qr-management": "QR Management",
    "/reports": "Reports",
    "/settings": "Settings",
  };

  const title = titleByPath[location.pathname] || "";

  return (
    <>
      {title ? <h2>{title}</h2> : null}
    </>
  );
}

export default PageHeader;

