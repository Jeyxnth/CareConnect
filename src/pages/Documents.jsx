import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { PopupBlockedError, printSummary } from "../lib/api";
import { extractDocumentText } from "../lib/ocr";
import { fmt, fmtMeds, parseStructuredData } from "../lib/medicalParser";
import { formatDate } from "../lib/format";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import ImportReview from "../components/ImportReview";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";

const MAX_TEXT_CHARS = 10000;
const BUCKET = "medical-documents";

// Spaces -> underscores; also drop characters that aren't safe in storage keys.
// The extension is kept.
const sanitiseFilename = (name) => name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");

const fileKind = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic"].includes(ext)) return "image";
  return "text";
};

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const isEmpty = (v) => !v || v.length === 0;

// ─── Icons ─────────────────────────────────────────────────────────────────

function FileIcon({ kind }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        padding: 10,
        borderRadius: 10,
        background: "var(--color-surface-alt)",
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
        {kind === "pdf" ? (
          <>
            <rect x="2" y="3" width="20" height="18" rx="3" fill="var(--color-alert)" />
            <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">
              PDF
            </text>
          </>
        ) : kind === "image" ? (
          <g fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="1.5" />
            <path d="M21 16l-5-5-9 9" />
          </g>
        ) : (
          <g fill="none" stroke="var(--color-body)" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />
          </g>
        )}
      </svg>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" />
    </svg>
  );
}

function EmptyIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--color-primary-light)" />
      <path d="M38 24h32l16 16v52a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4z" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M70 24v16h16" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M44 52h24M44 62h18" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      {/* stethoscope */}
      <path d="M48 76v6a10 10 0 0 0 20 0v-6" stroke="var(--color-primary-dark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 76h-3M68 76h3" stroke="var(--color-primary-dark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M78 82v4a8 8 0 0 1-8 8" stroke="var(--color-primary-dark)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="78" cy="80" r="3.5" fill="var(--color-primary)" />
    </svg>
  );
}

// ─── Processing status ─────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        border: "2px solid var(--color-primary)",
        borderTopColor: "transparent",
        borderRadius: "50%",
        display: "inline-block",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

function StepRow({ label, step }) {
  const { status, ms, error } = step;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <span style={{ width: 18, textAlign: "center", flexShrink: 0, lineHeight: "20px" }}>
        {status === "running" && <Spinner />}
        {status === "done" && <span style={{ color: "var(--color-success)", fontWeight: 700 }}>✓</span>}
        {status === "error" && <span style={{ color: "var(--color-alert)", fontWeight: 700 }}>✗</span>}
        {status === "pending" && <span style={{ color: "var(--color-border)" }}>○</span>}
      </span>
      <div style={{ fontSize: 14 }}>
        <span style={{ color: status === "pending" ? "var(--color-muted)" : "var(--color-heading)" }}>{label}</span>
        {status === "done" && <span style={{ color: "var(--color-muted)", marginLeft: 8 }}>{seconds(ms)}</span>}
        {status === "error" && (
          <div style={{ color: "var(--color-alert)", fontSize: 13, marginTop: 2 }}>{error}</div>
        )}
      </div>
    </div>
  );
}

function ProcessingCard({ job, onDismiss }) {
  const { t } = useLanguage();
  const finished = job.reading.status !== "running" && job.extracting.status !== "running";
  const hasError = job.reading.status === "error" || job.extracting.status === "error" || job.error;

  return (
    <Card style={{ marginBottom: 24, animation: "fadeIn 0.2s ease-out" }}>
      <div style={{ fontWeight: 500, color: "var(--color-heading)", marginBottom: 8, overflowWrap: "anywhere" }}>
        {job.filename}
      </div>
      <StepRow label={t("stepReading")} step={job.reading} />
      <StepRow label={t("stepExtracting")} step={job.extracting} />
      {job.error && <div style={{ color: "var(--color-alert)", fontSize: 13, marginTop: 6 }}>{job.error}</div>}
      {finished && hasError && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-muted)", fontSize: 13 }}
          >
            {t("dismiss")}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── Document card ─────────────────────────────────────────────────────────

function Section({ icon, label, color, empty, children }) {
  const { t } = useLanguage();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: color ?? "var(--color-primary)", marginBottom: 4 }}>
        {icon} {label}
      </div>
      {empty ? (
        <div style={{ fontStyle: "italic", color: "var(--color-muted)", fontSize: 14 }}>{t("notFound")}</div>
      ) : (
        <div style={{ whiteSpace: "pre-line", fontSize: 14, lineHeight: 1.6, color: "var(--color-body)" }}>{children}</div>
      )}
    </div>
  );
}

function DocumentCard({ doc, onDeleted, onUpdated, onImport }) {
  const { profile, user, accessToken } = useAuthContext();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const d = doc.structured_data;
  const patientName = d?.patient_name || doc.patient_name;

  // Signed URLs last an hour, so make a fresh one each time the card is opened
  useEffect(() => {
    if (!expanded || !doc.storage_path) return;
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(error);
          toast.show(t("error"), "error");
          return;
        }
        setDownloadUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
      setDownloadUrl(null); // never show a stale link when the card is re-opened
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, doc.storage_path]);

  // Re-run extraction on the saved text for documents that were stored without structured data
  async function handleRetryExtraction() {
    setRetrying(true);
    try {
      const { data: row, error } = await supabase
        .from("medical_documents")
        .select("document_text")
        .eq("id", doc.id)
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      if (!row.document_text?.trim()) {
        toast.show(t("noTextFound"), "error");
        return;
      }

      const structured = await parseStructuredData(row.document_text, accessToken);
      if (!structured) {
        toast.show(t("retryFailed"), "error");
        return;
      }

      const { data: updated, error: updateError } = await supabase
        .from("medical_documents")
        .update({ structured_data: structured, patient_name: structured.patient_name || null })
        .eq("id", doc.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (updateError) throw updateError;

      onUpdated(updated);
      toast.show(t("extractionUpdated"), "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setRetrying(false);
    }
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      await printSummary(doc.structured_data, profile);
    } catch (err) {
      if (err instanceof PopupBlockedError) {
        toast.show(t("popupBlocked"), "error");
      } else {
        console.error(err);
        toast.show(t("error"), "error");
      }
    } finally {
      setPrinting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      // 1. Remove the stored file. If that fails we still remove the record, and warn.
      let storageFailed = false;
      if (doc.storage_path) {
        try {
          const { error } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
          if (error) throw error;
        } catch (err) {
          console.error(err);
          storageFailed = true;
        }
      }

      // 2. Then the database row
      const { error } = await supabase.from("medical_documents").delete().eq("id", doc.id).eq("user_id", user.id);
      if (error) throw error;
      onDeleted(doc.id);
      toast.show(storageFailed ? t("storageCleanupWarning") : t("docDeleted"), storageFailed ? "info" : "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
      setDeleting(false);
    }
  }

  const toggle = () => setExpanded((v) => !v);

  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: 20, cursor: "pointer" }}
      >
        <FileIcon kind={fileKind(doc.filename)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-heading)", overflowWrap: "anywhere" }}>{doc.filename}</div>
          {expanded && downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 12, color: "var(--color-primary)", textDecoration: "none" }}
            >
              {t("downloadOriginal")}
            </a>
          )}
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>{patientName || t("unknownPatient")}</div>
          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{d?.diagnosis?.[0] || t("noDiagnosis")}</div>
          <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
            {formatDate(new Date(doc.created_at), lang)}
          </div>
        </div>
        <span
          aria-hidden="true"
          style={{
            color: "var(--color-muted)",
            fontSize: 12,
            transition: "transform 0.3s ease-out",
            transform: expanded ? "rotate(180deg)" : "none",
          }}
        >
          ▼
        </span>
      </div>

      <div style={{ maxHeight: expanded ? 4000 : 0, overflow: "hidden", transition: "max-height 0.3s ease-out" }}>
        <div style={{ padding: "4px 20px 20px", borderTop: "1px solid var(--color-border)" }}>
          <div style={{ height: 16 }} />
          <Section icon="👤" label={t("patientLabel")} empty={!patientName}>
            {patientName}
          </Section>
          <Section icon="🩺" label={t("diagnosisLabel")} empty={isEmpty(d?.diagnosis)}>
            {fmt(d?.diagnosis)}
          </Section>
          <Section icon="💊" label={t("medications")} empty={isEmpty(d?.medications)}>
            {fmtMeds(d?.medications)}
          </Section>
          <Section icon="📅" label={t("followUpsLabel")} empty={isEmpty(d?.follow_ups)}>
            {fmt(d?.follow_ups)}
          </Section>
          <Section icon="⚠️" label={t("warningSignsLabel")} color="var(--color-warning)" empty={isEmpty(d?.warning_signs)}>
            {fmt(d?.warning_signs).replace(/^• /gm, "⚠️ ")}
          </Section>
          <Section icon="🥗" label={t("dietLabel")} empty={isEmpty(d?.diet)}>
            {fmt(d?.diet)}
          </Section>
          <Section icon="🏃" label={t("activityLabel")} empty={isEmpty(d?.activity_restrictions)}>
            {fmt(d?.activity_restrictions)}
          </Section>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            {!d && (
              <Button variant="ghost" size="sm" loading={retrying} onClick={handleRetryExtraction}>
                {t("retryExtraction")}
              </Button>
            )}
            {d && (
              <Button size="sm" onClick={() => onImport(doc)}>
                {t("importToPlan")}
              </Button>
            )}
            <Button variant="secondary" size="sm" loading={printing} disabled={!d} onClick={handlePrint}>
              {t("print")}
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={confirming ? handleDelete : () => setConfirming(true)}>
              {confirming ? t("confirmDelete") : t("delete")}
            </Button>
            {confirming && !deleting && (
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-muted)", fontSize: 13 }}
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Documents() {
  const { user, accessToken } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [docs, setDocs] = useState(undefined);
  const [job, setJob] = useState(null);
  const [importDoc, setImportDoc] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const busyRef = useRef(false);

  // Stable identity so `t` changing on language switch doesn't refetch the list
  const failRef = useRef();
  failRef.current = (err) => {
    console.error(err);
    toast.show(t("error"), "error");
  };

  const userId = user.id;
  useEffect(() => {
    supabase
      .from("medical_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setDocs([]);
          return failRef.current(error);
        }
        setDocs(data);
      });
  }, [userId]);

  const patchJob = useCallback((patch) => setJob((j) => (j ? { ...j, ...patch } : j)), []);

  async function processFile(file) {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setJob({
      filename: file.name,
      reading: { status: "running" },
      extracting: { status: "pending" },
    });

    try {
      // Step 1 — store the original file, then read it. If the upload fails we stop
      // here and don't run OCR.
      const readStart = performance.now();
      const storagePath = `${userId}/${Date.now()}-${sanitiseFilename(file.name)}`;
      let uploadError = null;
      try {
        ({ error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
          contentType: file.type || undefined,
        }));
      } catch (err) {
        uploadError = err;
      }
      if (uploadError) {
        console.error(uploadError);
        toast.show(t("uploadFailed"), "error");
        setJob(null);
        return;
      }
      // Best-effort cleanup so a failed run doesn't leave an orphaned file behind
      const removeUpload = () => supabase.storage.from(BUCKET).remove([storagePath]).then(() => {}, () => {});

      let text;
      try {
        text = await extractDocumentText(file);
        if (!text || !text.trim()) throw new Error(t("noTextFound"));
      } catch (err) {
        console.error(err);
        patchJob({ reading: { status: "error", error: err.message || t("error") } });
        removeUpload();
        return;
      }
      patchJob({
        reading: { status: "done", ms: performance.now() - readStart },
        extracting: { status: "running" },
      });

      // Step 2 — extract structured data
      const extractStart = performance.now();
      let structured = null;
      try {
        structured = await parseStructuredData(text, accessToken);
      } catch (err) {
        console.error(err);
      }
      const extractFailed = !structured;
      patchJob({
        extracting: extractFailed
          ? { status: "error", error: t("extractFailed") }
          : { status: "done", ms: performance.now() - extractStart },
      });

      // Save (even without structured data, so the text isn't lost)
      const { data, error } = await supabase
        .from("medical_documents")
        .insert({
          user_id: userId,
          patient_name: structured?.patient_name || null,
          filename: file.name,
          storage_path: storagePath,
          document_text: text.slice(0, MAX_TEXT_CHARS),
          structured_data: structured,
        })
        .select()
        .single();
      if (error) {
        console.error(error);
        removeUpload();
        patchJob({ error: t("error") });
        toast.show(t("error"), "error");
        return;
      }

      setDocs((prev) => [data, ...(prev ?? [])]);
      if (!extractFailed) {
        setJob(null);
        toast.show(t("docProcessed"), "success");
      }
    } finally {
      busyRef.current = false;
    }
  }

  function handleChosen(e) {
    const file = e.target.files?.[0];
    // Reset so the same file can be chosen again
    if (inputRef.current) inputRef.current.value = "";
    processFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  }

  const busy = job && (job.reading.status === "running" || job.extracting.status === "running");

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // dragleave also fires when crossing child elements — only clear on a real exit
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={handleDrop}
        style={{ marginBottom: 24 }}
      >
        <Card
          padding={isDesktop ? 40 : 24}
          style={{
            border: `2px dashed ${dragging ? "var(--color-primary)" : "var(--color-border)"}`,
            background: dragging ? "var(--color-primary-light)" : "var(--color-surface)",
            transform: dragging ? "scale(1.01)" : "none",
            transition: "border-color 0.2s, background 0.2s, transform 0.2s",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <UploadIcon />
            <h2 style={{ fontSize: 20 }}>{t("uploadDoc")}</h2>
            <div style={{ color: "var(--color-muted)", fontSize: 13 }}>{t("uploadFormats")}</div>
            <input ref={inputRef} type="file" accept=".pdf,image/*,.txt" hidden onChange={handleChosen} />
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
                {t("chooseFile")}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {job && <ProcessingCard job={job} onDismiss={() => setJob(null)} />}
      {importDoc && <ImportReview doc={importDoc} onClose={() => setImportDoc(null)} />}

      {docs === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height={88} borderRadius={16} />
          <Skeleton height={88} borderRadius={16} />
        </div>
      ) : docs.length === 0 ? (
        !job && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, padding: "16px 0" }}>
            <EmptyIllustration />
            <h2 style={{ fontSize: 22 }}>{t("emptyDocsTitle")}</h2>
            <p style={{ margin: 0, maxWidth: 420, fontSize: 14, color: "var(--color-muted)" }}>{t("emptyDocsText")}</p>
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onDeleted={(id) => setDocs((prev) => prev.filter((x) => x.id !== id))}
              onUpdated={(row) => setDocs((prev) => prev.map((x) => (x.id === row.id ? row : x)))}
              onImport={setImportDoc}
            />
          ))}
        </div>
      )}
    </div>
  );
}
