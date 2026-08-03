import { useEffect, useMemo, useRef, useState } from "react";

import ParticipantInformationSection from "./ParticipantInformationSection";
import ParticipantAvatar from "./ParticipantAvatar";
import { useOrgLabels } from "../../config/labels";
import "../../styles/participants/ParticipantModal.css";


function normalizeText(v) {
  return String(v ?? "").trim();
}

function normalizeParticipantIdentifier(v) {
  return normalizeText(v);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(email));
}

function buildParticipantName({ lastName, firstName, middleName }) {
  const last = normalizeText(lastName);
  const first = normalizeText(firstName);
  const middle = normalizeText(middleName);
  const middlePart = middle ? ` ${middle}` : "";
  return `${last}, ${first}${middlePart}`.trim();
}

function validateForm({ values, existingIdentifiers, ignoreIdentifier, labels }) {
  const errors = {};


  const required = [
    "participantIdentifier",
    "lastName",
    "firstName",
    "middleName",
    "gender",
    "dateOfBirth",
    "email",
    "contactNumber",
    "course",
    "yearLevel",
    "section",
  ];

  for (const key of required) {
    if (key === "dateOfBirth") {
      if (!String(values.dateOfBirth || "").trim()) {
        errors.dateOfBirth = "Date of Birth is required.";
      }
      continue;
    }

    if (key === "participantIdentifier") {
      if (!normalizeText(values[key])) {
        errors.participantIdentifier = "Participant ID is required.";
      }
      continue;
    }

    if (!normalizeText(values[key])) {
      errors[key] = "This field is required.";
    }
  }

  const pid = normalizeParticipantIdentifier(values.participantIdentifier);
  if (
    pid &&
    existingIdentifiers.has(pid.toLowerCase()) &&
    (!ignoreIdentifier || normalizeParticipantIdentifier(ignoreIdentifier).toLowerCase() !== pid.toLowerCase())
  ) {
    errors.participantIdentifier = `${labels?.primaryIdLabel || "Participant ID"} must be unique.`;
  }


  const email = normalizeText(values.email);
  if (email && !isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  // dateOfBirth comes from <input type="date"> so it should already be YYYY-MM-DD.
  // Validate by format only (avoid timezone/Date parsing side effects).
  const dob = String(values.dateOfBirth || "").trim();
  if (dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      errors.dateOfBirth = "Enter a valid date of birth.";
    }
  }


  return errors;
}

function ParticipantModal({
  isOpen,
  onClose,
  onSave,
  existingParticipants = [],
  editMode = false,
  initialParticipant = null,
  isSubmitting = false,
}) {
  const labels = useOrgLabels();
  const firstFocusableRef = useRef(null);
  const overlayRef = useRef(null);

  const existingIdentifiers = useMemo(() => {
    const set = new Set();
    for (const p of existingParticipants) {
      const identifier = p?.participantIdentifier ?? p?.studentNumber;
      if (identifier != null) {
        const v = String(identifier).trim().toLowerCase();
        if (v) set.add(v);
      }
    }
    return set;
  }, [existingParticipants]);

  const initialValues = useMemo(
    () => ({
      participantIdentifier: "",
      lastName: "",
      firstName: "",
      middleName: "",
      gender: "",
      dateOfBirth: "",
      email: "",
      contactNumber: "",
      course: "",
      yearLevel: "",
      section: "",
    }),
    []
  );

  const [values, setValues] = useState(initialValues);
  const [originalIdentifier, setOriginalIdentifier] = useState("");
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      alert("Only JPG, JPEG, and PNG files are allowed.");
      return;
    }

    // Validate file size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5 MB.");
      return;
    }

    setPhotoFile(file);
    setRemovePhoto(false);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };



  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => firstFocusableRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }

      if (e.key !== "Tab") return;

      const root = overlayRef.current;
      if (!root) return;

      const focusables = root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

const computedErrors = useMemo(() => {
    // Capture labels for validation
    return validateForm({
      values,
      existingIdentifiers,
      ignoreIdentifier: editMode ? originalIdentifier : undefined,
      labels,
    });
  }, [values, existingIdentifiers, editMode, originalIdentifier, labels]);


  const isSaveDisabled = Object.keys(computedErrors).length > 0 || isSubmitting;

  const visibleError = (key) => {
    return touched[key] || (Object.keys(touched).length === 0 && errors[key]);
  };

  const markTouched = (key) => () => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const setField = (key) => (e) => {
    const next = e.target.value;
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const sectionOptionsByYearLevel = useMemo(
    () => ({
      "1st": ["A", "B", "C", "D"],
      "2nd": ["A", "B", "C", "D"],
      "3rd": ["A", "B", "C", "D"],
      "4th": ["A", "B", "C", "D"],
    }),
    []
  );

  const availableSectionOptions = values.yearLevel
    ? sectionOptionsByYearLevel[values.yearLevel] || []
    : [];

  useEffect(() => {
    if (!isOpen) return;

    // When switching between participants, the parent updates `initialParticipant`.
    // Ensure we always map ALL modal fields from the selected record.
    if (editMode && initialParticipant) {
      const toISODate = (v) => {
        const s = String(v ?? "").trim();
        if (!s) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : "";
      };

      // Modal expects `yearLevel` strings ("1st".."4th"). Table/backend payload uses `year` ("1".."4").
      const normalizeYearLevel = (v) => {
        const raw = String(v ?? "").trim();
        if (!raw) return "";
        // If already in UI format, keep.
        const mUi = raw.match(/^(\d+)(st|nd|rd|th)$/i);
        if (mUi) return `${mUi[1]}${mUi[2].toLowerCase()}`;
        // If backend sends plain year number, convert.
        const mYear = raw.match(/^(1|2|3|4)$/);
        if (!mYear) return raw;
        const yearNum = mYear[1];
        const suffix = yearNum === "1" ? "st" : yearNum === "2" ? "nd" : yearNum === "3" ? "rd" : "th";
        return `${yearNum}${suffix}`;
      };

      const asForm = {
        participantIdentifier: String(initialParticipant.participantIdentifier ?? initialParticipant.studentNumber ?? ""),
        lastName: String(initialParticipant.lastName ?? ""),
        firstName: String(initialParticipant.firstName ?? ""),
        middleName: String(initialParticipant.middleName ?? ""),
        gender: String(initialParticipant.gender ?? ""),
        dateOfBirth: toISODate(initialParticipant.dateOfBirth),
        course: String(initialParticipant.course ?? initialParticipant.department ?? ""),
        yearLevel: normalizeYearLevel(initialParticipant.yearLevel ?? initialParticipant.year ?? ""),
        section: String(initialParticipant.section ?? initialParticipant.groupName ?? ""),
        email: String(initialParticipant.email ?? ""),
        contactNumber: String(initialParticipant.contactNumber ?? ""),
      };

      // Backward compatibility: if some older payloads use a combined `name`, derive fields.
      if ((!asForm.lastName || !asForm.firstName) && typeof initialParticipant.name === "string") {
        const parts = initialParticipant.name.split(",");
        if (!asForm.lastName) asForm.lastName = String(parts[0] ?? "");
        const right = String(parts[1] ?? "").trim();
        if (!asForm.firstName) asForm.firstName = right ? right.split(" ")[0] : "";
        if (!asForm.middleName && right) {
          const words = right.split(" ").filter(Boolean);
          asForm.middleName = words.length > 1 ? words.slice(1).join(" ") : "";
        }
      }

      setValues(asForm);
      setOriginalIdentifier(String(asForm.participantIdentifier || ""));
      setErrors({});
      setTouched({});
      return;
    }

    setValues(initialValues);
    setOriginalIdentifier("");
    setErrors({});
    setTouched({});
  }, [isOpen, editMode, initialParticipant, initialValues]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

const nextErrors = validateForm({
      values,
      existingIdentifiers,
      ignoreIdentifier: editMode ? originalIdentifier : undefined,
      labels,
    });

    setErrors(nextErrors);

    const allTouched = {};
    for (const k of Object.keys(values)) allTouched[k] = true;
    setTouched(allTouched);

    if (Object.keys(nextErrors).length > 0) return;

    const yearLevelRaw = normalizeText(values.yearLevel);
    const year = (() => {
      const m = yearLevelRaw.match(/^(\d+)(st|nd|rd|th)?$/i);
      if (!m) return "";
      return String(m[1]);
    })();

    const newParticipant = {
      id: initialParticipant?.id ?? Date.now(),
      participantIdentifier: normalizeParticipantIdentifier(values.participantIdentifier),
      lastName: normalizeText(values.lastName),
      firstName: normalizeText(values.firstName),
      middleName: normalizeText(values.middleName),
      gender: normalizeText(values.gender),
      dateOfBirth: String(values.dateOfBirth || "").trim(),
      email: normalizeText(values.email),
      contactNumber: normalizeText(values.contactNumber),
      course: normalizeText(values.course),
      year,
      yearLevel: yearLevelRaw,
      section: normalizeText(values.section),
      status: initialParticipant?.status || "Active",
      photo: initialParticipant?.photo || null,
      photoFile: photoFile,
      removePhoto: removePhoto,
    };



    const didSave = await onSave?.(newParticipant);

    if (didSave) {
      setValues(initialValues);
      setErrors({});
      setTouched({});
      onClose?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="add-participant-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={editMode ? "Edit Participant" : "Add Participant"}
      id="add-participant-modal-root"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (!isSaveDisabled) handleSubmit();
        }
      }}
    >
      <div className="sis-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sis-modal-header" role="banner">
          <div className="sis-header-left">
            <h2 className="sis-title">{editMode ? "Edit Participant" : "Add Participant"}</h2>
            <p className="sis-subtitle">
              Register a participant with complete profile and enrollment details.
            </p>
          </div>

          <button
            className="sis-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              className="sis-close-icon"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4.2 4.2l9.6 9.6M13.8 4.2l-9.6 9.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="sis-modal-body" aria-label="Add participant form">
          <div className="sis-body-scroll">
            <div className="sis-form">
              <section
                className="sis-card"
                aria-label="PARTICIPANT INFORMATION"
              >
                <header className="sis-card-header">
                  <div className="sis-card-title">Participant Information</div>
                  <div className="sis-card-sub">
                  </div>
                </header>

                {/* Photo Upload Section */}
                <div style={{ padding: "14px 18px 18px", borderBottom: "1px solid rgba(226,232,240,.95)", display: "flex", alignItems: "center", gap: 20 }}>
                  {(photoPreview || (editMode && initialParticipant?.photo && !removePhoto && !photoPreview)) ? (
                    <div style={{ position: "relative" }}>
                      <ParticipantAvatar
                        photoPath={photoPreview || initialParticipant?.photo}
                        participantName={`${values.firstName} ${values.lastName}`}
                        size={80}
                      alt="Participant photo preview"
                      />
                    </div>
                  ) : (
                    <ParticipantAvatar
                      photoPath={null}
                      participantName={`${values.firstName} ${values.lastName}`}
                      size={80}
                      alt="Default avatar"
                    />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      onChange={handlePhotoChange}
                      style={{ display: "none" }}
                      id="photo-upload-input"
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="sis-btn sis-btn-outline"
                        style={{ height: 36, fontSize: 12, padding: "0 12px" }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {editMode && initialParticipant?.photo && !removePhoto && !photoPreview ? "Change Photo" : "Upload Photo"}
                      </button>
                      {(editMode && initialParticipant?.photo && !removePhoto && !photoPreview) || photoPreview ? (
                        <button
                          type="button"
                          className="sis-btn sis-btn-outline"
                          style={{ height: 36, fontSize: 12, padding: "0 12px", color: "#b91c1c", borderColor: "#fecaca" }}
                          onClick={handleRemovePhoto}
                        >
                          Remove Photo
                        </button>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>JPG, JPEG, PNG. Max 5 MB.</div>
                  </div>
                </div>

                <div className="sis-grid sis-grid-3">
                  <div className="sis-field">
                    <label className="sis-label" htmlFor="participantIdentifier">
                      Participant ID <span className="sis-req">*</span>
                    </label>
                    <input
                      ref={firstFocusableRef}
                      className="sis-input"
                      id="participantIdentifier"
                      type="text"
                      value={values.participantIdentifier}
                      onChange={setField("participantIdentifier")}
                      onBlur={markTouched("participantIdentifier")}
                      aria-invalid={Boolean(errors.participantIdentifier)}
                      aria-describedby={
                        visibleError("participantIdentifier") && errors.participantIdentifier
                          ? "participantIdentifier-error"
                          : undefined
                      }
                    />
                    {visibleError("participantIdentifier") && errors.participantIdentifier ? (
                      <div className="sis-error" id="participantIdentifier-error">
                        {errors.participantIdentifier}
                      </div>
                    ) : null}
                  </div>

                  <div className="sis-field">
                    <label className="sis-label" htmlFor="lastName">
                      Last Name <span className="sis-req">*</span>
                    </label>
                    <input
                      className="sis-input"
                      id="lastName"
                      type="text"
                      value={values.lastName}
                      onChange={setField("lastName")}
                      onBlur={markTouched("lastName")}
                      aria-invalid={Boolean(errors.lastName)}
                      aria-describedby={
                        visibleError("lastName") && errors.lastName
                          ? "lastName-error"
                          : undefined
                      }
                    />
                    {visibleError("lastName") && errors.lastName ? (
                      <div className="sis-error" id="lastName-error">
                        {errors.lastName}
                      </div>
                    ) : null}
                  </div>

                  <div className="sis-field">
                    <label className="sis-label" htmlFor="firstName">
                      First Name <span className="sis-req">*</span>
                    </label>
                    <input
                      className="sis-input"
                      id="firstName"
                      type="text"
                      value={values.firstName}
                      onChange={setField("firstName")}
                      onBlur={markTouched("firstName")}
                      aria-invalid={Boolean(errors.firstName)}
                      aria-describedby={
                        visibleError("firstName") && errors.firstName
                          ? "firstName-error"
                          : undefined
                      }
                    />
                    {visibleError("firstName") && errors.firstName ? (
                      <div className="sis-error" id="firstName-error">
                        {errors.firstName}
                      </div>
                    ) : null}
                  </div>

                  <div className="sis-field">
                    <label className="sis-label" htmlFor="middleName">
                      Middle Name <span className="sis-req">*</span>
                    </label>
                    <input
                      className="sis-input"
                      id="middleName"
                      type="text"
                      value={values.middleName}
                      onChange={setField("middleName")}
                      onBlur={markTouched("middleName")}
                      aria-invalid={Boolean(errors.middleName)}
                      aria-describedby={
                        visibleError("middleName") && errors.middleName
                          ? "middleName-error"
                          : undefined
                      }
                    />
                    {visibleError("middleName") && errors.middleName ? (
                      <div className="sis-error" id="middleName-error">
                        {errors.middleName}
                      </div>
                    ) : null}
                  </div>

                  <div className="sis-field">
                    <label className="sis-label" htmlFor="gender">
                      Gender <span className="sis-req">*</span>
                    </label>
                    <select
                      className="sis-input"
                      id="gender"
                      value={values.gender}
                      onChange={setField("gender")}
                      onBlur={markTouched("gender")}
                      aria-invalid={Boolean(errors.gender)}
                      aria-describedby={
                        visibleError("gender") && errors.gender
                          ? "gender-error"
                          : undefined
                      }
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    {visibleError("gender") && errors.gender ? (
                      <div className="sis-error" id="gender-error">
                        {errors.gender}
                      </div>
                    ) : null}
                  </div>

                  <div className="sis-field">
                    <label className="sis-label" htmlFor="dateOfBirth">
                      Date of Birth <span className="sis-req">*</span>
                    </label>
                    <input
                      className="sis-input"
                      id="dateOfBirth"
                      type="date"
                      value={values.dateOfBirth}
                      onChange={setField("dateOfBirth")}
                      onBlur={markTouched("dateOfBirth")}
                      aria-invalid={Boolean(errors.dateOfBirth)}
                      aria-describedby={
                        visibleError("dateOfBirth") && errors.dateOfBirth
                          ? "dateOfBirth-error"
                          : undefined
                      }
                    />
                    {visibleError("dateOfBirth") && errors.dateOfBirth ? (
                      <div className="sis-error" id="dateOfBirth-error">
                        {errors.dateOfBirth}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <div>

<ParticipantInformationSection
  values={values}
  errors={errors}
  touched={touched}
  setField={setField}
  markTouched={markTouched}
  onYearLevelChange={(nextYear) => {
    setValues((prev) => ({
      ...prev,
      yearLevel: nextYear,
      section: "",
    }));
  }}
  onSectionChange={(nextSection) => {
    setValues((prev) => ({
      ...prev,
      section: nextSection,
    }));
  }}
  availableSectionOptions={availableSectionOptions}
/>
              </div>

              <section
                className="sis-card sis-card-muted"
                aria-label="CONTACT INFORMATION"
              >
                <header className="sis-card-header">
                  <div className="sis-card-title">Contact Information</div>
                  <div className="sis-card-sub">
                  </div>
                </header>

                <div className="sis-grid sis-grid-2">
                  <div className="sis-field">
                    <label className="sis-label" htmlFor="email">
                      Email Address <span className="sis-req">*</span>
                    </label>
                    <input
                      className="sis-input"
                      id="email"
                      type="email"
                      inputMode="email"
                      value={values.email}
                      onChange={setField("email")}
                      onBlur={markTouched("email")}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={
                        visibleError("email") && errors.email
                          ? "email-error"
                          : undefined
                      }
                    />
                    {visibleError("email") && errors.email ? (
                      <div className="sis-error" id="email-error">
                        {errors.email}
                      </div>
                    ) : null}
                  </div>

                  <div className="sis-field">
                    <label className="sis-label" htmlFor="contactNumber">
                      Contact Number <span className="sis-req">*</span>
                    </label>
                    <input
                      className="sis-input"
                      id="contactNumber"
                      type="text"
                      value={values.contactNumber}
                      onChange={setField("contactNumber")}
                      onBlur={markTouched("contactNumber")}
                      aria-invalid={Boolean(errors.contactNumber)}
                      aria-describedby={
                        visibleError("contactNumber") && errors.contactNumber
                          ? "contactNumber-error"
                          : undefined
                      }
                    />
                    {visibleError("contactNumber") && errors.contactNumber ? (
                      <div className="sis-error" id="contactNumber-error">
                        {errors.contactNumber}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>

        <div className="sis-modal-footer">
          <button
            type="button"
            className="sis-btn sis-btn-outline"
            onClick={() => {
              if (isSubmitting) return;
              setValues(initialValues);
              setErrors({});
              setTouched({});
              onClose?.();
            }}
            disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            type="button"
            className="sis-btn sis-btn-primary"
            onClick={handleSubmit}
            disabled={isSaveDisabled}
          >
            {isSubmitting ? (editMode ? "Updating..." : "Saving...") : editMode ? "Save Changes" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ParticipantModal;

