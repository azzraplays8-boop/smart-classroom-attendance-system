import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import ParticipantAvatar from "../components/participants/ParticipantAvatar";
import { useOrgLabels } from "../config/labels";
import { API_BASE_URL } from "../config/api";

// Key used to remember the user's chosen camera across visits.
const CAMERA_STORAGE_KEY = "attendance-selected-camera";

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
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const controlsRef = useRef(null);
  const intervalRef = useRef(null);
  const cameraActiveRef = useRef(false);
  const processedCodeRef = useRef("");
  const pauseScanRef = useRef(false);
  const torchOnRef = useRef(false);
  const camerasRef = useRef([]);

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

  // ------------------------------------------------------------------
  // Camera helpers
  // ------------------------------------------------------------------

  // List every available video input device (camera).
  const loadCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const list = videoInputs.map((d, i) => ({
        id: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
      camerasRef.current = list;
      setCameras(list);
      return list;
    } catch {
      setCameras([]);
      return [];
    }
  }, []);

  // Decide which camera to use on startup:
  // 1. A previously saved camera (localStorage) if it still exists.
  // 2. Otherwise, prefer the rear/environment camera on mobile.
  // 3. Fall back to letting the browser pick via facingMode: "environment".
  const selectInitialCamera = useCallback((cameraList = []) => {
    const savedId = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    if (savedId && cameraList.some((c) => c.id === savedId)) {
      return savedId;
    }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    const rear = cameraList.find((c) => /back|rear|environment/i.test(c.label));
    if (rear) return rear.id;
    if (isMobile) return "";
    return cameraList[0]?.id || "";
  }, []);

  // Build constraints for getUserMedia.
  // If a deviceId is give we lock to that exact camera (needed for switching).
  // Otherwise we request the rear/environment camera.
  const buildConstraints = useCallback((deviceId) => {
    if (deviceId) {
      return { audio: false, video: { deviceId: { exact: deviceId } } };
    }
    return { audio: false, video: { facingMode: { ideal: "environment" } } };
  }, []);

  // Release every media stream track and stop the decoder/scan loop.
  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    pauseScanRef.current = false;

    if (controlsRef.current) {
      try { controlsRef.current.stop?.(); } catch {}
      controlsRef.current = null;
    }
    if (detectorRef.current) {
      try { detectorRef.current.reset?.(); } catch {}
      detectorRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    cameraActiveRef.current = false;
    setCameraActive(false);
    torchOnRef.current = false;
    setTorchOn(false);
  }, []);

  // Shared scan callback. Kept in a ref so the decoder always uses the
  // latest closure without re-binding the stream.
  const scanCallbackRef = useRef(null);
  scanCallbackRef.current = (result, err) => {
    if (!cameraActiveRef.current || pauseScanRef.current) return;
    if (err) return;

    const rawValue = result?.getText?.()?.trim?.() || result?.text?.trim?.();
    if (!rawValue || rawValue === processedCodeRef.current) return;

    processedCodeRef.current = rawValue;
    handleAttendanceScan(rawValue);
  };

  // Start the camera & decoder. Passing a deviceId selects a specific camera;
  // passing undefined lets the browser pick a rear/environment camera.
  const startCamera = useCallback(
    async (deviceId) => {
      if (cameraActiveRef.current) return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const message = "Camera access is not available in this browser.";
        setScanError(message);
        showToast("error", message);
        return;
      }

      setStatusMessage("Opening camera...");
      setScanError("");

      try {
        const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(deviceId));
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch {}
        }

        const detector = new BrowserMultiFormatReader();
        detectorRef.current = detector;

        // decodeFromStream lets us own the MediaStream so we can reliably
        // stop every track when cleaning up / switching cameras.
        controlsRef.current = detector.decodeFromStream(
          stream,
          videoRef.current || undefined,
          (result, err) => scanCallbackRef.current?.(result, err)
        );

        cameraActiveRef.current = true;
        setCameraActive(true);

        // Record the actual active device so the selector highlights it.
        const trackSettings = stream.getVideoTracks?.()?.[0]?.getSettings?.();
        const actualDeviceId = trackSettings?.deviceId || deviceId || "";
        setActiveDeviceId(actualDeviceId);

        setStatusMessage("Point the camera at a QR code to record attendance.");
      } catch (err) {
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
          streamRef.current = null;
        }

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
    },
    [buildConstraints]
  );

  // Restart the decode loop on the already-open stream (used after a pause).
  const restartDecoder = useCallback(() => {
    if (!detectorRef.current || !videoRef.current || !cameraActiveRef.current) return;
    if (!streamRef.current) return;
    try {
      detectorRef.current.reset();
      controlsRef.current = detectorRef.current.decodeFromStream(
        streamRef.current,
        videoRef.current,
        (result, err) => scanCallbackRef.current?.(result, err)
      );
    } catch {
      // ignore restart errors
    }
  }, []);

  // Switch to a specific camera from the dropdown.
  const handleCameraChange = useCallback(
    (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      stopCamera();
      window.setTimeout(() => startCamera(deviceId), 150);
    },
    [stopCamera, startCamera]
  );

  // Cycle through available cameras.
  const switchCamera = useCallback(() => {
    const list = camerasRef.current;
    if (!list || list.length < 2) {
      showToast("error", "No other camera available to switch to.");
      return;
    }
    const currentIndex = list.findIndex((c) => c.id === activeDeviceId);
    const nextIndex = (currentIndex + 1 + list.length) % list.length;
    const next = list[nextIndex];
    stopCamera();
    window.setTimeout(() => startCamera(next.id), 150);
  }, [activeDeviceId, stopCamera, startCamera]);

  // Toggle flashlight / torch when supported by the device.
  const toggleTorch = useCallback(async () => {
    const controls = controlsRef.current;
    if (!controls || typeof controls.switchTorch !== "function") {
      showToast("error", "Flashlight is not supported on this device.");
      return;
    }
    try {
      const stream = videoRef.current?.srcObject;
      const track = stream?.getVideoTracks?.()?.[0];
      if (!track) {
        showToast("error", "Camera is not active.");
        return;
      }
      const next = !torchOnRef.current;
      await controls.switchTorch(next);
      torchOnRef.current = next;
      setTorchOn(next);
    } catch {
      showToast("error", "Unable to toggle the flashlight.");
    }
  }, []);

  // ------------------------------------------------------------------
  // Attendance / QR business logic (unchanged)
  // ------------------------------------------------------------------

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

    // Haptic feedback on successful decode (mobile only).
    try { navigator.vibrate?.(100); } catch {}

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

  const pauseAndResume = () => {
    pauseScanRef.current = true;
    // Stop the decoder loop to eliminate unnecessary frame processing during pause
    if (controlsRef.current) {
      try { controlsRef.current.stop?.(); } catch {}
      controlsRef.current = null;
    }
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

  // Remember the selected camera so it's reused next time.
  useEffect(() => {
    if (activeDeviceId) {
      try {
        window.localStorage.setItem(CAMERA_STORAGE_KEY, activeDeviceId);
      } catch {}
    }
  }, [activeDeviceId]);

  // Initialisation + cleanup.
  useEffect(() => {
    let cancelled = false;
    fetchToday();

    const init = async () => {
      const list = await loadCameras();
      if (cancelled) return;
      const deviceId = selectInitialCamera(list);
      await startCamera(deviceId);
      // Refresh the list now that permission is granted so labels populate.
      const refreshed = await loadCameras();
      if (!cancelled) {
        camerasRef.current = refreshed;
        setCameras(refreshed);
      }
    };

    init();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [loadCameras, selectInitialCamera, startCamera, stopCamera]);

  return (
    <div className="page attendance-page">
      <style>{`
        @media (max-width: 768px) {
          .attendance-scan-grid { grid-template-columns: 1fr !important; }
          .attendance-camera-controls { flex-direction: column; align-items: stretch; }
          .attendance-camera-controls select,
          .attendance-camera-controls button { width: 100%; }
        }
      `}</style>

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
        <div className="attendance-camera-controls" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" onClick={() => (cameraActive ? stopCamera() : startCamera(activeDeviceId || undefined))}>
            {cameraActive ? "Stop Camera" : "Start Camera"}
          </button>

          {cameras.length > 1 ? (
            <>
              <select
                value={activeDeviceId || ""}
                onChange={handleCameraChange}
                aria-label="Select camera"
                title="Select camera"
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: 13,
                  maxWidth: 240,
                }}
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <button type="button" onClick={switchCamera} title="Switch camera">
                🔄 Switch Camera
              </button>
            </>
          ) : null}

          <button type="button" onClick={toggleTorch} title="Toggle flashlight">
            {torchOn ? "🔦 Torch: On" : "🔦 Torch: Off"}
          </button>
        </div>

        <div style={{ fontWeight: 700, marginBottom: 4 }}>{statusMessage}</div>
        {scanError ? <div style={{ color: "#b91c1c" }}>{scanError}</div> : null}
      </div>

      <div
        className="attendance-scan-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}
      >
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
              {scanError ? scanError : "Camera is off. Start the camera to scan a QR code."}
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
