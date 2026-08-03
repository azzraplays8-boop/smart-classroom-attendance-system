import { useLocation } from "react-router-dom";
import { useOrgLabels } from "../config/labels";

function PageHeader() {
  const location = useLocation();
  const labels = useOrgLabels();

const titleByPath = {
    "/": "Dashboard",
    "/participants": labels.entityLabel || "Entities",
    "/attendance": "Attendance",
    "/attendance-history": "Attendance History",
    "/qr-management": "QR Management",
    "/reports": "Reports",
    "/settings": "Settings",
    "/account": "Account",
  };

  const title = titleByPath[location.pathname] || "";

  return (
    <>
      {title ? <h2>{title}</h2> : null}
    </>
  );
}

export default PageHeader;

