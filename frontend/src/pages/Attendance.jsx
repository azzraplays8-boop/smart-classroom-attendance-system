import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  FiCamera,
  FiCameraOff,
  FiVideo,
  FiToggleLeft,
  FiToggleRight,
  FiZap,
  FiRefreshCw,
  FiUsers,
  FiCalendar,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
  FiUserCheck,
  FiSearch,
  FiActivity,
  FiUpload,
  FiHelpCircle,
  FiRotateCw,
} from "react-icons/fi";
import ParticipantAvatar from "../components/participants/ParticipantAvatar";
import { useOrgLabels } from "../config/labels";
import "../styles/attendance/Attendance.css";
import { authFetch } from "../services/apiClient";
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

function getInitials(name) {
  const trimmed = String(name || "Participant").trim();
  if (!trimmed) return "PA";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getStatusClass(status) {
  switch (String(status || "").toLowerCase()) {
    case "present":
      return "att-badge att-badge--present";
    case "late":
      return "att-badge att-badge--late";
    case "absent":
      return "att-badge att-badge--absent";
    default:
      return "att-badge att-badge--duplicate";
  }
}

function statSkeleton(key) {
  return (
    <div className="att-stat-skeleton" key={key}>
      <div className="att-skeleton att-stat-skeleton__icon" />
      <div className="att-stat-skeleton__lines">
        <div className="att-skeleton att-stat-skeleton__line att-stat-skeleton__line--sm" />
        <div className="att-skeleton att-stat-skeleton__line att-stat-skeleton__line--lg" />
      </div>
    </div>
  );
}

function Attendance() {
  const labels = useOrgLabels();

  const [statusMessage, setStatusMessage] = useState("Scanning QR code for member attendance");
  const [attendanceList, setAttendanceList] = useState([]);
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [toastVisible, setToastVisible] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [scanPhase, setScanPhase] = useState("idle"); // idle | loading | active | processing | success | error
  const [highlightedId, setHighlightedId] = useState(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const [fileScanError, setFileScanError] = useState("");

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
  const highlightTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (kind, message) => {
    setToast({ kind, message });
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2600);
  };

  const fetchToday = async () => {
    try {
      const today = new Date().toLocaleDateString("en-CA");
      const res = await authFetch(`/attendance?date=${today}`);
      const data = await res.json();
      if (res.ok) {
        setAttendanceList(data.attendance || []);
      } else {
        throw new Error(data.message || "Unable to load today's attendance.");
      }
    } catch (err) {
      showToast("error", err?.message || "Unable to load today's attendance.");
    } finally {
      setLoadingToday(false);
    }
  };

  // ------------------------------------------------------------------
  // Camera helpers
  // ------------------------------------------------------------------

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

  const selectInitialCamera = useCallback((cameraList = []) => {
    // Check if we are in a secure context (HTTPS) — required for getUserMedia on most mobile browsers
    const secure = window.isSecureContext === true;
    setIsSecureContext(secure);

    const savedId = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    if (savedId && cameraList.some((c) => c.id === savedId)) {
      return savedId;
    }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    // On mobile, prefer rear/environment camera by leaving deviceId empty
    // so buildConstraints uses facingMode: { ideal: "environment" }.
    if (isMobile) return "";
    const rear = cameraList.find((c) => /back|rear|environment/i.test(c.label));
    if (rear) return rear.id;
    return cameraList[0]?.id || "";
  }, []);

  const buildConstraints = useCallback((deviceId) => {
    if (deviceId) {
      // Use `ideal` instead of `exact` so that if the deviceId is stale
      // (common on iOS Safari where device IDs change per session),
      // the browser picks a suitable fallback instead of throwing OverconstrainedError.
      return { audio: false, video: { deviceId: { ideal: deviceId } } };
    }
    // Default to rear/environment camera on mobile; front camera on desktop.
    return { audio: false, video: { facingMode: { ideal: "environment" } } };
  }, []);

  // Detect torch support + current state for the active video track.
  const detectTorch = useCallback((track) => {
    if (!track || typeof track.getCapabilities !== "function") {
      setTorchSupported(false);
      setTorchOn(false);
      torchOnRef.current = false;
      return false;
    }
    try {
      const caps = track.getCapabilities();
      const supported = Boolean(caps && caps.torch);
      setTorchSupported(supported);
      if (!supported) {
        setTorchOn(false);
        torchOnRef.current = false;
      }
      return supported;
    } catch {
      setTorchSupported(false);
      setTorchOn(false);
      torchOnRef.current = false;
      return false;
    }
  }, []);

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
    setTorchSupported(false);
    setScanPhase((prev) => (prev === "error" ? prev : "idle"));
  }, []);

  const scanCallbackRef = useRef(null);
  scanCallbackRef.current = (result, err) => {
    if (!cameraActiveRef.current || pauseScanRef.current) return;
    if (err) return;

    const rawValue = result?.getText?.()?.trim?.() || result?.text?.trim?.();
    if (!rawValue || rawValue === processedCodeRef.current) return;

    processedCodeRef.current = rawValue;
    handleAttendanceScan(rawValue);
  };

  const startCamera = useCallback(
    async (deviceId) => {
      if (cameraActiveRef.current) return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const message = "Camera access is not available in this browser.";
        setScanError(message);
        setScanPhase("error");
        showToast("error", message);
        return;
      }

      setStatusMessage("Opening camera...");
      setScanError("");
      setScanPhase("loading");
      setIsStartingCamera(true);

      try {
        // On iOS Safari, calling getUserMedia requires a user gesture.
        // The camera start button already provides one, but the auto-start
        // on initial load might be blocked. We handle this gracefully below.
        const constraints = buildConstraints(deviceId);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // iOS Safari may block autoplay — retry once with a small delay
            await new Promise((resolve) => window.setTimeout(resolve, 200));
            if (videoRef.current) {
              try { await videoRef.current.play(); } catch (e2) {
                console.warn("Video play retry failed:", e2);
              }
            }
          }
        }

        const detector = new BrowserMultiFormatReader();
        detectorRef.current = detector;

        controlsRef.current = detector.decodeFromStream(
          stream,
          videoRef.current || undefined,
          (result, err) => scanCallbackRef.current?.(result, err)
        );

        cameraActiveRef.current = true;
        setCameraActive(true);
        setScanPhase("active");

        const trackSettings = stream.getVideoTracks?.()?.[0]?.getSettings?.();
        const actualDeviceId = trackSettings?.deviceId || deviceId || "";
        setActiveDeviceId(actualDeviceId);

        // Detect torch support from the active track.
        const track = stream.getVideoTracks?.()?.[0];
        detectTorch(track);

        setStatusMessage("Point the camera at a QR code to record attendance.");
      } catch (err) {
        if (streamRef.current) {
          try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
          streamRef.current = null;
        }

        const name = err?.name || "";
        const message = err?.message || "";
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

        // Build user-friendly guidance for mobile users
        let userMessage = "";

        if (!window.isSecureContext) {
          userMessage = "Camera access requires a secure HTTPS connection. Please access this site via HTTPS and try again.";
          setShowPermissionHelp(true);
        } else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          userMessage = isMobile
            ? "Camera access denied. Please allow camera permissions in your browser settings (tap the lock/info icon in the address bar), then try again."
            : "Camera permission denied. Please allow camera access in your browser settings and try again.";
          setShowPermissionHelp(true);
        } else if (name === "NotFoundError") {
          userMessage = "No camera detected on this device. If you are on a laptop, make sure your webcam is connected and not being used by another app.";
          setShowPermissionHelp(false);
        } else if (name === "OverconstrainedError") {
          userMessage = "The selected camera is no longer available. The browser will try a different camera. Please try again.";
          setShowPermissionHelp(false);
        } else if (name === "NotReadableError" || message.toLowerCase().includes("in use") || message.toLowerCase().includes("busy")) {
          userMessage = "The camera is currently being used by another application. Please close other camera apps and try again.";
          setShowPermissionHelp(false);
        } else if (name === "AbortError") {
          userMessage = "Camera access was aborted. Please try again.";
          setShowPermissionHelp(false);
        } else if (name === "SecurityError") {
          userMessage = "Camera access was blocked for security reasons. Please ensure you are using HTTPS and try again.";
          setShowPermissionHelp(true);
        } else if (message.toLowerCase().includes("requested device not found")) {
          userMessage = "The camera could not be found. Please check your camera connection and try again. You can also upload a QR image as a fallback.";
          setShowPermissionHelp(false);
        } else {
          userMessage = "Unable to access the camera. Please check your device camera and try again. You can also upload a QR image as an alternative.";
          setShowPermissionHelp(false);
        }

        setScanError(userMessage);
        setScanPhase("error");
        showToast("error", userMessage);
      } finally {
        setIsStartingCamera(false);
      }
    },
    [buildConstraints, detectTorch]
  );

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

  const handleCameraChange = useCallback(
    (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      stopCamera();
      window.setTimeout(() => startCamera(deviceId), 150);
    },
    [stopCamera, startCamera]
  );

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

  // Torch toggle using constraints when supported, with graceful fallback.
  const toggleTorch = useCallback(async () => {
    const stream = videoRef.current?.srcObject;
    const track = stream?.getVideoTracks?.()?.[0];

    // Constraint-based torch (most modern browsers).
    if (track && typeof track.applyConstraints === "function") {
      let supported = false;
      if (typeof track.getCapabilities === "function") {
        try {
          const caps = track.getCapabilities();
          supported = Boolean(caps && caps.torch);
        } catch {}
      }
      if (supported) {
        const next = !torchOnRef.current;
        try {
          await track.applyConstraints({ advanced: [{ torch: next }] });
          torchOnRef.current = next;
          setTorchOn(next);
          return;
        } catch {
          // Fall through to legacy path below.
        }
      }
    }

    // Legacy path via @zxing controls.
    const controls = controlsRef.current;
    if (!controls || typeof controls.switchTorch !== "function") {
      showToast("error", "Flashlight unavailable");
      return;
    }
    try {
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
  // QR image upload fallback for mobile (or when camera is unavailable)
  // ------------------------------------------------------------------

  const handleFileScan = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileScanError("");
    setScanPhase("processing");
    setStatusMessage("Decoding QR from image...");

    try {
      const img = new Image();
      const imageUrl = URL.createObjectURL(file);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imageUrl;
      });

      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImage(img);
      URL.revokeObjectURL(imageUrl);

      const rawValue = result?.getText?.()?.trim?.() || result?.text?.trim?.();
      if (!rawValue) {
        throw new Error("No QR code found in the image.");
      }

      // Process the scanned QR value the same way as camera scans
      handleAttendanceScan(rawValue);
    } catch (err) {
      const msg = err?.message || "Failed to decode QR code from the image. Try a clearer photo.";
      setFileScanError(msg);
      setScanPhase("error");
      showToast("error", msg);
    } finally {
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  // ------------------------------------------------------------------
  // Retry camera after error (for the retry button)
  // ------------------------------------------------------------------

  const retryCamera = useCallback(() => {
    setScanError("");
    setShowPermissionHelp(false);
    setFileScanError("");
    // Re-fetch cameras in case they changed (e.g., permission was granted)
    loadCameras().then((list) => {
      const deviceId = selectInitialCamera(list);
      startCamera(deviceId);
    });
  }, [loadCameras, selectInitialCamera, startCamera]);

  // ------------------------------------------------------------------
  // Orientation & visibility change handling (mobile-friendly)
  // ------------------------------------------------------------------

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && cameraActiveRef.current) {
        // Page is hidden (user switched apps/tabs) — stop camera to save resources
        stopCamera();
      }
    };

    // On orientation change, we just re-render (CSS handles the layout).
    // But on iOS Safari, the video element may need a small kick.
    const handleOrientation = () => {
      if (cameraActiveRef.current && videoRef.current) {
        // Trigger a re-render by toggling a brief resize on the video
        try {
          videoRef.current.style.transform = "scale(1.001)";
          window.setTimeout(() => {
            if (videoRef.current) videoRef.current.style.transform = "";
          }, 50);
        } catch {}
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("orientationchange", handleOrientation);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, [stopCamera]);

  const handleAttendanceScan = async (qrValue) => {
    const rawValue = String(qrValue || "").trim();
    if (!rawValue) {
      const message = "Invalid QR code.";
      setStatusMessage(message);
      setScanError(message);
      setScanPhase("error");
      showToast("error", message);
      pauseAndResume();
      return;
    }

    // Haptic feedback on successful decode (mobile only).
    try { navigator.vibrate?.(100); } catch {}

    let qrPayload;
    try {
      qrPayload = JSON.parse(rawValue);
    } catch {
      qrPayload = null;
    }

    const requestBody = {};
    if (qrPayload && qrPayload.uuid) {
      requestBody.qrUuid = String(qrPayload.uuid).trim();
    } else {
      requestBody.participantIdentifier = rawValue;
    }

    setStatusMessage("Processing...");
    setScanError("");
    setScanPhase("processing");

    try {
      const res = await authFetch("/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      if (!res.ok) {
        const message = data.message || "Failed to record attendance.";
        setStatusMessage(message);
        setScanError(message);
        setScanPhase("error");
        showToast("error", message);
        pauseAndResume();
        return;
      }

      const timeIn = data.attendance?.timeIn ? formatTime(data.attendance.timeIn) : formatTime(new Date().toISOString());
      const recordedStatus = data.attendance?.status || "Present";
      const emailSent = Boolean(data.emailSent || data.emailNotification?.sent);
      const successMessage = emailSent
        ? "Attendance recorded successfully. A confirmation email has been sent."
        : "Attendance recorded successfully, but the confirmation email could not be sent.";

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
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        status: recordedStatus,
        emailNotification: data.emailNotification || null,
        emailSent,
        photo: matchedParticipant?.photo || null,
      });

      setScanPhase("success");
      setStatusMessage(successMessage);
      showToast("success", successMessage);

      // Auto-highlight the newly scanned attendee in the table.
      const newRowId = data.attendance?.id;
      if (newRowId) {
        setHighlightedId(newRowId);
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 2400);
      }

      await fetchToday();
      pauseAndResume();
    } catch (err) {
      const message = err?.message || "Network error. Please try again.";
      setStatusMessage(message);
      setScanError(message);
      setScanPhase("error");
      showToast("error", message);
      pauseAndResume();
    }
  };

  const pauseAndResume = () => {
    pauseScanRef.current = true;
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
      if (cameraActiveRef.current) setScanPhase("active");
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

  // Clean up the highlight timer on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Initialisation + cleanup.
  useEffect(() => {
    let cancelled = false;
    fetchToday();

    const init = async () => {
      const list = await loadCameras();
      if (cancelled) return;
      const deviceId = selectInitialCamera(list);
      await startCamera(deviceId);
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

  // ── Derived stats ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = attendanceList.length;
    const present = attendanceList.filter(
      (r) => String(r.status || "").toLowerCase() === "present"
    ).length;
    const late = attendanceList.filter(
      (r) => String(r.status || "").toLowerCase() === "late"
    ).length;
    const absent = attendanceList.filter(
      (r) => String(r.status || "").toLowerCase() === "absent"
    ).length;
    const unique = new Set(
      attendanceList.map((r) => r.participantId || r.participantIdentifier)
    ).size;
    return { total, present, late, absent, unique };
  }, [attendanceList]);

  const statCards = [
    { key: "total", label: "Today's Total", value: stats.total, icon: <FiCalendar size={20} />, cls: "total" },
    { key: "present", label: "Present", value: stats.present, icon: <FiCheckCircle size={20} />, cls: "present" },
    { key: "late", label: "Late", value: stats.late, icon: <FiClock size={20} />, cls: "late" },
    { key: "absent", label: "Absent", value: stats.absent, icon: <FiXCircle size={20} />, cls: "absent" },
    { key: "unique", label: "Unique Scanned", value: stats.unique, icon: <FiUserCheck size={20} />, cls: "unique" },
  ];

  const statusMeta = {
    loading: { text: "Camera Starting...", cls: "att-scanner-status--loading", pulse: true },
    active: { text: "Camera Ready", cls: "att-scanner-status--active", pulse: true },
    processing: { text: "Processing...", cls: "att-scanner-status--loading", pulse: true },
    success: { text: "Attendance Recorded", cls: "att-scanner-status--active", pulse: false },
    error: { text: "Error", cls: "att-scanner-status--error", pulse: false },
    idle: { text: "Camera Off", cls: "att-scanner-status--idle", pulse: false },
  };
  const currentStatus = statusMeta[scanPhase] || statusMeta.idle;

  return (
    <div className="att-page">
      {/* Sticky Top Toolbar */}
      <div className="att-toolbar">
        <div className="att-toolbar-left">
          <div className="att-toolbar-badge">
            <FiCamera size={20} />
          </div>
          <div>
            <h2 className="att-toolbar-title">Attendance</h2>
            <p className="att-toolbar-subtitle">
              {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="att-toolbar-actions">
          <button
            type="button"
            className={`att-btn ${cameraActive ? "att-btn--primary att-btn--primary--stop" : "att-btn--primary"}`}
            onClick={() => (cameraActive ? stopCamera() : startCamera(activeDeviceId || undefined))}
            disabled={isStartingCamera}
          >
            {isStartingCamera ? (
              <>
                <span className="att-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Starting...
              </>
            ) : cameraActive ? (
              <>
                <FiCameraOff size={18} /> Stop Camera
              </>
            ) : (
              <>
                <FiVideo size={18} /> Start Camera
              </>
            )}
          </button>

          {cameraActive && cameras.length > 1 ? (
            <>
              <select
                className="att-select"
                value={activeDeviceId || ""}
                onChange={handleCameraChange}
                aria-label="Select camera"
                title="Select camera"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="att-btn att-btn--outline"
                onClick={switchCamera}
                title="Switch camera"
              >
                <FiRefreshCw size={16} /> Switch
              </button>
            </>
          ) : null}

          {cameraActive && torchSupported ? (
            <button
              type="button"
              className={`att-btn ${torchOn ? "att-btn--primary" : "att-btn--outline"}`}
              onClick={toggleTorch}
              title="Toggle flashlight"
            >
              {torchOn ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}
              {torchOn ? "Torch: On" : "Torch: Off"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Toast */}
      {toastVisible ? (
        <div className={`att-toast att-toast--${toast.kind}`} role="status" aria-live="polite">
          {toast.kind === "success" ? <FiCheckCircle size={18} /> : <FiAlertTriangle size={18} />}
          {toast.message}
        </div>
      ) : null}

      {/* Top Statistics */}
      <div className="att-stats-grid">
        {loadingToday
          ? [...Array(5).keys()].map(statSkeleton)
          : statCards.map((card, i) => (
              <div
                className={`att-stat-card att-stat-card--${card.cls}`}
                key={card.key}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`att-stat-icon att-stat-icon--${card.cls}`}>{card.icon}</div>
                <div className="att-stat-meta">
                  <div className="att-stat-label">{card.label}</div>
                  <div className="att-stat-value">{card.value}</div>
                </div>
              </div>
            ))}
      </div>

      {/* Scanner + Recent Scans */}
      <div className="att-scan-layout">
        {/* Scanner Card */}
        <div className="att-scanner-card">
          <div className="att-scanner-card-header">
            <h3 className="att-scanner-title">
              <FiZap size={18} style={{ color: "var(--primary-2)" }} />
              QR Scanner
            </h3>
            <span className={`att-scanner-status ${currentStatus.cls}`}>
              <span className={`att-status-dot ${currentStatus.pulse ? "att-status-dot--pulse" : ""}`} />
              {currentStatus.text}
            </span>
          </div>

          {/* Camera permission help banner (shown when permission denied or insecure context) */}
          {showPermissionHelp ? (
            <div className="att-permission-banner">
              <div className="att-permission-banner-icon">
                <FiHelpCircle size={22} />
              </div>
              <div className="att-permission-banner-content">
                <div className="att-permission-banner-title">Camera Access Required</div>
                <div className="att-permission-banner-text">
                  {!isSecureContext
                    ? "This site must be accessed via HTTPS (secure connection) to use the camera. If you are testing locally, use https://localhost or deploy via HTTPS."
                    : "Please allow camera access in your browser settings:\n1. Tap the lock/info icon (🔒) in the address bar\n2. Find \"Camera\" or \"Permissions\"\n3. Select \"Allow\"\n4. Reload the page and try again"}
                </div>
              </div>
              <button
                type="button"
                className="att-permission-banner-close"
                onClick={() => setShowPermissionHelp(false)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ) : null}

          <div className="att-camera-viewport">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="att-video"
              style={{ display: cameraActive ? "block" : "none" }}
            />

            {/* Camera loading */}
            {isStartingCamera ? (
              <div className="att-camera-loading">
                <div className="att-spinner" />
                <div>Opening camera...</div>
              </div>
            ) : null}

            {/* Camera off state */}
            {!cameraActive && !isStartingCamera ? (
              <div className="att-camera-off">
                <div className="att-camera-off-icon">📷</div>
                <div className="att-camera-off-title">Camera is off</div>
                <div className="att-camera-off-hint">
                  {scanError || "Start the camera to scan a QR code and record attendance."}
                </div>

                <div className="att-camera-off-actions">
                  <button
                    type="button"
                    className="att-btn att-btn--primary"
                    onClick={() => startCamera(activeDeviceId || undefined)}
                  >
                    <FiVideo size={18} /> Start Camera
                  </button>

                  {/* Retry button shown when there's a camera error */}
                  {scanError ? (
                    <button
                      type="button"
                      className="att-btn att-btn--outline"
                      onClick={retryCamera}
                    >
                      <FiRotateCw size={16} /> Retry
                    </button>
                  ) : null}
                </div>

                {/* QR image upload fallback — always available */}
                <div className="att-file-upload-section">
                  <div className="att-file-upload-divider">
                    <span>or</span>
                  </div>
                  <button
                    type="button"
                    className="att-btn att-btn--ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FiUpload size={16} /> Upload QR Image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={handleFileScan}
                  />
                  {fileScanError ? (
                    <div className="att-file-upload-error">{fileScanError}</div>
                  ) : null}
                  <div className="att-file-upload-hint">
                    Take or select a photo of a QR code
                  </div>
                </div>
              </div>
            ) : null}

            {/* Animated scan frame */}
            {cameraActive && scanPhase !== "processing" ? (
              <div
                className={`att-scan-frame
                  ${scanPhase === "active" ? "att-scan-frame--active" : ""}
                  ${scanPhase === "success" ? "att-scan-frame--active att-scan-frame--success" : ""}
                  ${scanPhase === "error" ? "att-scan-frame--active att-scan-frame--error" : ""}`}
              >
                {scanPhase === "active" ? <div className="att-scan-line" /> : null}
                <span className="att-scan-frame__corner att-scan-frame__corner--tl" />
                <span className="att-scan-frame__corner att-scan-frame__corner--tr" />
                <span className="att-scan-frame__corner att-scan-frame__corner--bl" />
                <span className="att-scan-frame__corner att-scan-frame__corner--br" />
              </div>
            ) : null}

            {/* Processing overlay */}
            {scanPhase === "processing" ? (
              <div className="att-scan-processing">
                <div className="att-spinner" />
                <div>Processing...</div>
              </div>
            ) : null}

            {/* Success overlay */}
            {scanPhase === "success" ? (
              <div className="att-scan-success">
                <div className="att-scan-success-badge">✓</div>
              </div>
            ) : null}
          </div>

          <div style={{ padding: 14, borderTop: "1px solid var(--border-2)", fontSize: 13, color: "var(--muted-2)", textAlign: "center" }}>
            {statusMessage}
          </div>
        </div>

        {/* Recent Scans Panel */}
        <div className="att-recent-card">
          <div className="att-recent-header">
            <h3 className="att-recent-title">
              <FiActivity size={18} style={{ color: "var(--primary-2)" }} />
              Recent Scans
            </h3>
            <span className="att-recent-count">{attendanceList.length}</span>
          </div>

          <div className="att-recent-scroll">
            {loadingToday ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(4).keys()].map((i) => (
                  <div style={{ display: "flex", gap: 12 }} key={i}>
                    <div className="att-skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="att-skeleton" style={{ height: 14, width: "60%" }} />
                      <div className="att-skeleton" style={{ height: 12, width: "40%" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : attendanceList.length === 0 ? (
              <div className="att-recent-empty">
                <div className="att-recent-empty-icon">📡</div>
                <div className="att-recent-empty-title">No scans yet</div>
                <div className="att-recent-empty-hint">Scanned attendees will appear here instantly.</div>
              </div>
            ) : (
              attendanceList.map((r, idx) => (
                <div className={`att-recent-item ${idx === 0 ? "att-recent-item--new" : ""}`} key={r.id}>
                  <div className="att-recent-avatar">
                    {r.photo ? (
                      <img src={`${API_BASE_URL}/uploads/${String(r.photo).startsWith("/") ? r.photo : `/${r.photo}`}`} alt="" />
                    ) : (
                      getInitials(`${r.firstName || ""} ${r.lastName || ""}`)
                    )}
                  </div>
                  <div className="att-recent-meta">
                    <div className="att-recent-name">{`${r.firstName || ""} ${r.lastName || ""}`.trim() || "-"}</div>
                    <div className="att-recent-sub">{r.participantIdentifier || r.studentNumber || "-"}</div>
                  </div>
                  <div className="att-recent-right">
                    <span className={`att-badge ${getStatusClass(r.status)}`}>{r.status || "Present"}</span>
                    <span className="att-recent-time">{r.timeIn ? formatTime(r.timeIn) : "-"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Scan Result Details */}
      {attendanceResult ? (
        <div className="att-table-card" style={{ padding: 20 }}>
          <div className="att-scanner-title" style={{ marginBottom: 16 }}>
            <FiCheckCircle size={18} style={{ color: "#22c55e" }} />
            Attendance Recorded Successfully
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <ParticipantAvatar
              photoPath={attendanceResult.photo}
              participantName={attendanceResult.fullName}
              size={64}
              alt="Participant photo"
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text)" }}>{attendanceResult.fullName}</div>
              <div style={{ color: "var(--muted-2)", fontSize: 13 }}>{attendanceResult.participantIdentifier}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px 16px", fontSize: 13 }}>
            <div>
              <div style={{ color: "var(--muted-2)" }}>{labels.departmentLabel || "Department"}</div>
              <div style={{ fontWeight: 650, color: "var(--text)" }}>{attendanceResult.department}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted-2)" }}>{labels.roleLabel || "Level"}</div>
              <div style={{ fontWeight: 650, color: "var(--text)" }}>{attendanceResult.year}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted-2)" }}>{labels.groupLabel || "Group"}</div>
              <div style={{ fontWeight: 650, color: "var(--text)" }}>{attendanceResult.section}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted-2)" }}>Attendance Status</div>
              <span className={`att-badge ${getStatusClass(attendanceResult.status)}`}>{attendanceResult.status}</span>
            </div>
            <div>
              <div style={{ color: "var(--muted-2)" }}>Time Recorded</div>
              <div style={{ fontWeight: 650, color: "var(--text)" }}>{attendanceResult.timeIn}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted-2)" }}>Date</div>
              <div style={{ fontWeight: 650, color: "var(--text)" }}>{attendanceResult.date || "-"}</div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "var(--surface-2, #f8fafc)", border: "1px solid var(--border-2, #e2e8f0)", fontSize: 13, color: "var(--muted-2)" }}>
            Thank you for checking in, {attendanceResult.participantName}. Your attendance for this session has been recorded.
            {attendanceResult.status?.toLowerCase() === "late" ? " Please note: you were checked in as LATE based on the attendance time rules." : ""}
            {attendanceResult.emailNotification && !attendanceResult.emailNotification.sent
              ? " (Note: confirmation email could not be sent — your attendance is still safely recorded.)"
              : ""}
          </div>
        </div>
      ) : null}

      {/* Today's Attendance Table */}
      <div className="att-table-card">
        <div className="att-table-header">
          <h3 className="att-table-title">
            <FiUsers size={18} style={{ color: "var(--primary-2)" }} />
            Today's Attendance
          </h3>
          <span className="att-table-count">{attendanceList.length} record{attendanceList.length === 1 ? "" : "s"}</span>
        </div>

        <div className="att-table-scroll">
          <table className="att-table">
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
              {loadingToday ? (
                [...Array(4).keys()].map((i) => (
                  <tr className="att-table-skeleton-row" key={`sk-${i}`}>
                    <td><div className="att-skeleton att-table-skeleton-cell" style={{ width: 24 }} /></td>
                    <td><div className="att-skeleton att-table-skeleton-cell" style={{ width: 90 }} /></td>
                    <td><div className="att-skeleton att-table-skeleton-cell" style={{ width: 150 }} /></td>
                    <td><div className="att-skeleton att-table-skeleton-cell" style={{ width: 80 }} /></td>
                    <td><div className="att-skeleton att-table-skeleton-cell" style={{ width: 80 }} /></td>
                  </tr>
                ))
              ) : attendanceList.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="att-empty">
                      <div className="att-empty-illustration">
                        <FiSearch size={40} />
                      </div>
                      <div className="att-empty-title">Waiting for first scan...</div>
                      <div className="att-empty-hint">
                        Point the camera at a participant's QR code. Their attendance will appear here automatically.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                attendanceList.map((r, idx) => (
                  <tr key={r.id} className={r.id === highlightedId ? "att-row--highlight" : ""}>
                    <td className="att-cell-strong">{idx + 1}</td>
                    <td className="att-cell-strong">{r.participantIdentifier || r.studentNumber || "-"}</td>
                    <td>
                      <div className="att-cell-name">
                        <div className="att-cell-avatar">
                          {r.photo ? (
                            <img src={`${API_BASE_URL}/uploads/${String(r.photo).startsWith("/") ? r.photo : `/${r.photo}`}`} alt="" />
                          ) : (
                            getInitials(`${r.firstName || ""} ${r.lastName || ""}`)
                          )}
                        </div>
                        <div>
                          <div className="att-cell-main">{`${r.firstName || ""} ${r.lastName || ""}`.trim() || "-"}</div>
                          {r.department ? <div className="att-cell-sub">{r.department}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td>{r.timeIn ? formatTime(r.timeIn) : "-"}</td>
                    <td>
                      <span className={getStatusClass(r.status)}>{r.status || "Present"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Attendance;
