import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  FiChevronDown,
  FiLogOut,
  FiArrowRight,
} from "react-icons/fi";
import "./UserMenu.css";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  administrator: "Administrator",
  teacher: "Teacher",
};

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  if (!user) return null;

  const initials = (user.full_name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const email = user.email || "";

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  const handleManageAccount = () => {
    setIsOpen(false);
    navigate("/account");
  };

  return (
    <div className="user-menu" ref={dropdownRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <div className="user-menu-avatar">{initials}</div>
        <div className="user-menu-info">
          <span className="user-menu-name">{user.full_name || "User"}</span>
          <span className="user-menu-role">{roleLabel}</span>
        </div>
        <FiChevronDown
          className={`user-menu-chevron ${isOpen ? "user-menu-chevron-open" : ""}`}
          size={18}
        />
      </button>

      {isOpen && (
        <div className="user-menu-dropdown" role="menu">
          {/* Header */}
          <div className="user-menu-dropdown-header">
            <div className="user-menu-dropdown-avatar">{initials}</div>
            <div className="user-menu-dropdown-header-right">
              <div className="user-menu-dropdown-name">
                {user.full_name || "User"}
              </div>
              <div
                className={`user-menu-role-badge user-menu-role-badge--${user.role}`}
              >
                <span className="role-badge-dot" />
                {roleLabel}
              </div>
              {email && (
                <div className="user-menu-dropdown-email">{email}</div>
              )}
            </div>
          </div>

          <div className="user-menu-dropdown-divider" />

          {/* Launcher — Manage Account */}
          <button
            className="user-menu-dropdown-item user-menu-dropdown-item-launcher"
            onClick={handleManageAccount}
            role="menuitem"
          >
            <span className="user-menu-launcher-text">
              <span className="user-menu-launcher-label">Manage Account</span>
              <span className="user-menu-launcher-hint">
                Profile, security &amp; preferences
              </span>
            </span>
            <FiArrowRight className="user-menu-launcher-arrow" size={17} />
          </button>

          <div className="user-menu-dropdown-divider" />

          {/* Logout */}
          <button
            className="user-menu-dropdown-item user-menu-dropdown-item-danger"
            onClick={handleLogout}
            role="menuitem"
          >
            <FiLogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

