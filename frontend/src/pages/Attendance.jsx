import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import ParticipantAvatar from "../components/participants/ParticipantAvatar";
import { useOrgLabels } from "../config/labels";
import { API_BASE_URL } from "../config/api";

function formatTime(value) {
  if (!value) return "-";

  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!raw) return "-";

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  }

  const m = raw.match(/^\s*(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?\s*Z?\s*$/i);
  if (!m) return raw;

  const hours24 = Number(m[1]);
  const minutes = m[2];
  if (!Number.isFinite(hours24)) return raw;

  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${suffix}`;
}

function Attendance() {
  const labels = useOrgLabels();

  const [statusMessage, setStatusMessage] = useState("Opening camera for QR scanning...");
  const [attendanceList, setAttendanceList] = useState([]);
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [cameras, setCameras] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const cameraActiveRef = useRef(false);
  const processedCodeRef = useRef("");
  const pauseScanRef = useRef(false);

  const showToast = (kind, message) => {
    setToast({ kind, message });
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2600);
  };

  const fetchToday = async () => {
    try {
      const today = new Date().toLocaleDateString("en-CA");
      const res = await fetch(`${API_BASE_URL}/attendance?date=${today}`);
      const data = await res.json();
      if (res.ok) {
        setAttendanceList(data.attendance || []);
      } else {
        throw new Error(data.message || "Unable to load today's attendance.");
      }
    } catch (err) {
      showToast("error", err?.message || "Unable to load today's attendance.");
    }
  };

  const stopCamera = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    pauseScanRef.current = false;
    if (detectorRef.current) {
      detectorRef.current.reset?.();
      detectorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    cameraActiveRef.current = false;
    setCameraActive(false);
  };

  const scanFrame = async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;

    if (!video || !detector || !cameraActiveRef.current || video.readyState < 2 || pauseScanRef.current) {
      return;
    }

    try {
      const result = await detector.decodeOnceFromVideoDevice(undefined, video);
      const rawValue = result?.getText?.()?.trim?.() || result?.text?.trim?.();

      if (!rawValue) {
        return;
      }

      if (rawValue === processedCodeRef.current) {
        return;
      }

      processedCodeRef.current = rawValue;
      await handleAttendanceScan(rawValue);
    } catch {
      // Ignore transient scan errors and keep scanning.
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const message = "Camera access is not available in this browser.";
      setScanError(message);
      showToast("error", message);
      return;
    }

    if (cameraActiveRef.current) return;

    try {
      // Enumerate devices and pick the first video input (camera)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      if (!videoInputs || videoInputs.length === 0) {
        const message = "No camera detected.";
        setScanError(message);
        showToast("error", message);
        return;
      }

      const chosenDeviceId = videoInputs[0].deviceId;

      const constraints = {
        video: chosenDeviceId
          ? { deviceId: { exact: chosenDeviceId } }
          : { facingMode: "environment" },
      };

      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: chosenDeviceId ? { exact: chosenDeviceId } : undefined } });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      detectorRef.current = new BrowserMultiFormatReader();
      cameraActiveRef.current = true;
      setCameraActive(true);
      setScanError("");
      setStatusMessage("Point the camera at a QR code to record attendance.");

      detectorRef.current.decodeFromVideoDevice(chosenDeviceId, videoRef.current, async (result, err) => {
        if (!cameraActiveRef.current || pauseScanRef.current) {
          return;
        }

        if (err) {
          return;
        }

        const rawValue = result?.getText?.()?.trim?.() || result?.text?.trim?.();
        if (!rawValue || rawValue === processedCodeRef.current) {
          return;
        }

        processedCodeRef.current = rawValue;
        await handleAttendanceScan(rawValue);
      });
    } catch (err) {
      // Handle permission denied vs other errors
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        const message = "Camera permission denied. Please allow camera access and try again.";
        setScanError(message);
        showToast("error", message);
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        const message = "No camera detected.";
        setScanError(message);
        showToast("error", message);
      } else {
        const message = "Unable to access the camera. Please allow camera permissions and try again.";
        setScanError(message);
        showToast("error", message);
      }
    }
  };

  const handleAttendanceScan = async (qrValue) => {
    const rawValue = String(qrValue || "").trim();
    if (!rawValue) {
      const message = "Invalid QR code.";
      setStatusMessage(message);
      setScanError(message);
      showToast("error", message);
      pauseAndResume();
      return;
    }

    // Try to parse the QR payload as JSON (for JSON-encoded QRs)
    let qrPayload;
    try {
      qrPayload = JSON.parse(rawValue);
    } catch {
      // Not JSON — treat the raw value as a plain participantIdentifier (legacy fallback)
      qrPayload = null;
    }

    // Build request body:
    // If QR contains JSON with a uuid field, use the indexed qrUuid lookup path
    // Otherwise fall back to participantIdentifier lookup (legacy/direct scan)
    const requestBody = {};
    if (qrPayload && qrPayload.uuid) {
      requestBody.qrUuid = String(qrPayload.uuid).trim();
    } else {
      // Legacy QR (plain identifier) — send as participantIdentifier
      requestBody.participantIdentifier = rawValue;
    }

    setStatusMessage("Checking attendance...");
    setScanError("");

    try {
      const res = await fetch(`${API_BASE_URL}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      if (!res.ok) {
        const message = data.message || "Failed to record attendance.";
        setStatusMessage(message);
        setScanError(message);
        showToast("error", message);
        pauseAndResume();
        return;
      }

      const successMessage = "✓ Attendance recorded successfully";
      const timeIn = data.attendance?.timeIn ? formatTime(data.attendance.timeIn) : formatTime(new Date().toISOString());

      const matchedParticipant = data.participant || null;
      const displayIdentifier = matchedParticipant?.participantIdentifier || rawValue;

      setAttendanceResult({
        participantName: matchedParticipant
          ? `${matchedParticipant.firstName || ""} ${matchedParticipant.lastName || ""}`.trim()
          : displayIdentifier,
        fullName: matchedParticipant
          ? `${matchedParticipant.firstName || ""} ${matchedParticipant.middleName ? matchedParticipant.middleName + " " : ""}${matchedParticipant.lastName || ""}`.trim()
          : displayIdentifier,
        participantIdentifier: matchedParticipant?.participantIdentifier || displayIdentifier,
        department: matchedParticipant?.department || "-",
        year: matchedParticipant?.year || "-",
        section: matchedParticipant?.section || "-",
        timeIn,
        status: data.attendance?.status || "Present",
        photo: matchedParticipant?.photo || null,
      });
      setStatusMessage(successMessage);
      showToast("success", successMessage);
      await fetchToday();
      pauseAndResume();
    } catch (err) {
      const message = err?.message || "Network error. Please try again.";
      setStatusMessage(message);
      setScanError(message);
      showToast("error", message);
      pauseAndResume();
    }
  };

  const restartDecoder = () => {
    if (!detectorRef.current || !videoRef.current || !cameraActiveRef.current) return;
    try {
      detectorRef.current.reset();
      const trackSettings = videoRef.current.srcObject?.getVideoTracks?.()?.[0]?.getSettings?.();
      const deviceId = trackSettings?.deviceId || undefined;
      detectorRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        async (result, err) => {
          if (!cameraActiveRef.current || pauseScanRef.current) return;
          if (err) return;
          const rawValue = result?.getText?.()?.trim?.() || result?.text?.trim?.();
          if (!rawValue || rawValue === processedCodeRef.current) return;
          processedCodeRef.current = rawValue;
          await handleAttendanceScan(rawValue);
        }
      );
    } catch {
      // ignore restart errors
    }
  };

  const pauseAndResume = () => {
    pauseScanRef.current = true;
    // Stop the decoder loop to eliminate unnecessary frame processing during pause
    if (detectorRef.current) {
      try { detectorRef.current.reset(); } catch {}
    }
    window.setTimeout(() => {
      pauseScanRef.current = false;
      processedCodeRef.current = "";
      setStatusMessage("Point the camera at a QR code to record attendance.");
      restartDecoder();
    }, 2000);
  };

  useEffect(() => {
    fetchToday();
    startCamera();
    // Enumerate available cameras for display
    (async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          setCameras(
            videoInputs.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
          );
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="page attendance-page">
      <div
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 1200,
          pointerEvents: "none",
        }}
        aria-live="polite"
      >
        {toastVisible ? (
          <div
            style={{
              background: toast.kind === "success" ? "#dcfce7" : "#fee2e2",
              color: toast.kind === "success" ? "#166534" : "#991b1b",
              border: toast.kind === "success" ? "1px solid #86efac" : "1px solid #fca5a5",
              padding: "12px 14px",
              borderRadius: 12,
              fontWeight: 800,
              boxShadow: "0 12px 40px rgba(2,6,23,0.25)",
              maxWidth: 420,
            }}
          >
            {toast.message}
          </div>
        ) : null}
      </div>

      <h2>Attendance</h2>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" onClick={() => (cameraActive ? stopCamera() : startCamera())}>
            {cameraActive ? "Stop Camera" : "Start Camera"}
          </button>
          {cameras && cameras.length > 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              📷 Available Camera{cameras.length > 1 ? "s" : ""}: {cameras
                .map((c) => {
                  const cleaned = c.label.replace(/\s*\([^)]*\)/g, "").trim();
                  return cleaned || "Camera";
                })
                .join(", ")}
            </div>
          ) : null}
        </div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{statusMessage}</div>
        {scanError ? <div style={{ color: "#b91c1c" }}>{scanError}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", minHeight: 320, background: "#111827", display: cameraActive ? "block" : "none" }}
          />
          {!cameraActive ? (
            <div style={{ padding: 24, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
              Camera is off. Start the camera to scan a QR code.
            </div>
          ) : null}
        </div>

        {attendanceResult ? (
          <div style={{
            background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
            border: "2px solid #86efac",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 4px 12px rgba(34,197,94,0.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: "#22c55e",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 14
              }}>✓</div>
              <h3 style={{ margin: 0, color: "#166534", fontSize: 15 }}>Attendance Recorded Successfully</h3>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
<ParticipantAvatar
                photoPath={attendanceResult.photo}
                participantName={attendanceResult.fullName}
                size={64}
                alt="Participant photo"
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>{attendanceResult.fullName}</div>
                <div style={{ color: "#475569", fontSize: 13 }}>{attendanceResult.participantIdentifier}</div>
              </div>
            </div>

<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
<div><span style={{ color: "#64748b" }}>{labels.departmentLabel || "Department"}:</span></div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{attendanceResult.department}</div>
<div><span style={{ color: "#64748b" }}>{labels.roleLabel || "Level"}:</span></div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{attendanceResult.year}</div>
<div><span style={{ color: "#64748b" }}>{labels.groupLabel || "Group"}:</span></div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{attendanceResult.section}</div>
              <div><span style={{ color: "#64748b" }}>Attendance Status:</span></div>
              <div style={{
                fontWeight: 700,
                color: attendanceResult.status === "Present" ? "#16a34a" : "#ca8a04",
              }}>
                {attendanceResult.status}
              </div>
              <div><span style={{ color: "#64748b" }}>Time Recorded:</span></div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{attendanceResult.timeIn}</div>
            </div>
          </div>
        ) : (
          <div style={{
            border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, background: "#fff",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 200, color: "#94a3b8"
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 14 }}>Scan a QR code to see attendance details.</div>
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 16 }}>Today's Attendance</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
<tr>
            <th>#</th>
<th>{labels.primaryIdLabel || "Participant Number"}</th>
            <th>{labels.entityName || "Participant"} Name</th>
            <th>Time In</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {attendanceList.length === 0 ? (
            <tr>
              <td colSpan={5}>No records for today.</td>
            </tr>
          ) : (
            attendanceList.map((r, idx) => (
              <tr key={r.id}>
                <td>{idx + 1}</td>
<td>{r.participantIdentifier || r.studentNumber || "-"}</td>
                <td>{`${r.firstName || ""} ${r.lastName || ""}`.trim()}</td>
                <td>{r.timeIn ? formatTime(r.timeIn) : "-"}</td>

                <td>{r.status}</td>

              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Attendance;


