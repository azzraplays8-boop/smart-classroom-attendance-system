import "../styles/Topbar.css";
import PageHeader from "./PageHeader";
import UserMenu from "./UserMenu";

function Topbar() {
  return (
    <header className="topbar">
      <div>
        <PageHeader />
      </div>

      <div className="topbar-right">
        <UserMenu />
      </div>
    </header>
  );
}

export default Topbar;
