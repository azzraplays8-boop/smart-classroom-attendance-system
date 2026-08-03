import { useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function getDisplayUrl(photoPath) {
  if (!photoPath) return null;
  const trimmed = String(photoPath).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Prepend /uploads/ since static files are served at that path
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_BASE_URL}/uploads${normalized}`;
}

function getInitials(name) {
  const trimmed = String(name || "Participant").trim();
  if (!trimmed) return "PA";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export default function ParticipantAvatar({ photoPath, participantName, size = 48, className = "", alt = "Participant photo" }) {
  const [hasError, setHasError] = useState(false);

  const imageUrl = useMemo(() => (hasError ? null : getDisplayUrl(photoPath)), [hasError, photoPath]);
  const initials = useMemo(() => getInitials(participantName), [participantName]);

  if (!imageUrl) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4338ca, #7c3aed)",
          color: "#fff",
          fontWeight: 700,
          fontSize: Math.max(12, Math.round(size * 0.33)),
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.85)",
          flexShrink: 0,
        }}
        aria-label={alt}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt={alt}
      onError={() => setHasError(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid rgba(255,255,255,0.85)",
        flexShrink: 0,
        backgroundColor: "#f3f4f6",
      }}
    />
  );
}

