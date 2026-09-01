import { FiTool } from "react-icons/fi";

export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "#eef2ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden
      >
        <FiTool size={40} color="#4f46e5" />
      </div>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>KATAGA</h1>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b", letterSpacing: 1 }}>
        Kapatiran ng Talino at Galing
      </p>
      <h2 style={{ margin: "10px 0 0", fontSize: 22 }}>SYSTEM UNDER MAINTENANCE</h2>
      <p style={{ margin: 0, color: "#475569", fontSize: 15, maxWidth: 420 }}>
        We&apos;re currently performing maintenance to improve the system.
        Please check back again later.
      </p>
      <p style={{ margin: "6px 0 0", fontWeight: 700, color: "#312e81" }}>
        Thank you for your patience.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: 10,
          padding: "10px 22px",
          borderRadius: 8,
          border: "none",
          background: "#4f46e5",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try Again
      </button>
    </div>
  );
}
