import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { MILESTONE_TITLE_KEYS, autoMarkPast, ensureDefaultMilestones, fetchMilestones } from "../lib/milestones";
import { formatDate, toDateStr } from "../lib/format";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Skeleton from "../components/ui/Skeleton";

const STATUSES = [
  ["pending", "statusPending"],
  ["achieved", "statusAchieved"],
  ["missed", "statusMissed"],
];

const linkButtonStyle = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13 };

// ─── Step circle ───────────────────────────────────────────────────────────

function Circle({ status, current }) {
  let style = { background: "var(--color-surface)", border: "2px solid var(--color-border)" };
  let inner = null;
  if (status === "achieved") {
    style = { background: "var(--color-primary)", border: "2px solid var(--color-primary)", color: "#fff" };
    inner = "✓";
  } else if (status === "missed") {
    style = { background: "var(--color-alert)", border: "2px solid var(--color-alert)", color: "#fff" };
    inner = "✗";
  } else if (current) {
    style = { background: "var(--color-surface)", border: "2px solid var(--color-primary)" };
    inner = <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--color-primary)" }} />;
  }

  return (
    <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
      {current && status === "pending" && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid var(--color-primary)",
            animation: "pulseRing 1.6s ease-out infinite",
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          width: 36,
          height: 36,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 700,
          ...style,
        }}
      >
        {inner}
      </div>
    </div>
  );
}

function useMilestoneText() {
  const { t, lang } = useLanguage();
  return {
    titleOf: (m) => (MILESTONE_TITLE_KEYS[m.title] ? t(MILESTONE_TITLE_KEYS[m.title]) : m.title),
    dateOf: (m) => formatDate(m.milestone_date, lang, { day: "numeric", month: "short" }),
  };
}

// ─── Inline edit panel ─────────────────────────────────────────────────────

function EditPanel({ row, busy, onSave, onDelete, onClose }) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(row.title ?? "");
  const [description, setDescription] = useState(row.description ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [status, setStatus] = useState(row.status);
  const [date, setDate] = useState(row.milestone_date ?? "");
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);

  function save() {
    const next = {};
    if (!title.trim()) next.title = t("titleRequired");
    if (!date) next.date = t("dateRequired");
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(row, { title: title.trim(), description: description.trim(), notes: notes.trim(), status, milestone_date: date });
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 12,
        background: "var(--color-surface-alt)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        animation: "fadeIn 0.2s ease-out",
        textAlign: "left",
      }}
    >
      <Input label={t("milestoneTitle")} value={title} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
      <Input label={t("description")} value={description} onChange={(e) => setDescription(e.target.value)} />
      <Input label={t("notes")} multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Select
        label={t("status")}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={STATUSES.map(([value, key]) => ({ value, label: t(key) }))}
      />
      <Input label={t("date")} type="date" value={date} error={errors.date} onChange={(e) => setDate(e.target.value)} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Button size="sm" loading={busy === `save-${row.id}`} onClick={save}>
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <span style={{ flex: 1 }} />
        {row.is_custom && (
          <>
            <button
              type="button"
              style={{ ...linkButtonStyle, color: "var(--color-alert)", fontWeight: confirming ? 600 : 400 }}
              onClick={confirming ? () => onDelete(row) : () => setConfirming(true)}
            >
              {confirming ? t("confirmDelete") : t("delete")}
            </button>
            {confirming && (
              <button type="button" style={{ ...linkButtonStyle, color: "var(--color-muted)" }} onClick={() => setConfirming(false)}>
                {t("cancel")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Timeline({ onNavigate }) {
  const { user, profile } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { titleOf, dateOf } = useMilestoneText();
  const userId = user.id;
  const isCaregiver = profile?.role === "caregiver";
  const discharge = profile?.discharge_date ?? null;

  const [rows, setRows] = useState(undefined); // undefined = loading
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newErrors, setNewErrors] = useState({});

  const load = useCallback(async () => {
    if (!isCaregiver) await ensureDefaultMilestones(userId, discharge);
    setRows(await autoMarkPast(await fetchMilestones(userId)));
  }, [userId, discharge, isCaregiver]);

  const fail = useCallback(
    (err) => {
      console.error(err);
      toast.show(t("error"), "error");
    },
    [toast, t]
  );

  useEffect(() => {
    load().catch((err) => {
      setRows((prev) => prev ?? []);
      fail(err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function handleSave(row, patch) {
    setBusy(`save-${row.id}`);
    try {
      const { error } = await supabase.from("recovery_milestones").update(patch).eq("id", row.id).eq("user_id", userId);
      if (error) throw error;
      // Re-fetch only (no auto-mark): a status chosen by hand shouldn't be overridden in this view
      setRows(await fetchMilestones(userId));
      setSelected(null);
      toast.show(t("milestoneSaved"), "success");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(row) {
    setBusy(`save-${row.id}`);
    try {
      const { error } = await supabase
        .from("recovery_milestones")
        .delete()
        .eq("id", row.id)
        .eq("user_id", userId)
        .eq("is_custom", true); // only custom milestones can be deleted
      if (error) throw error;
      setRows((prev) => prev.filter((m) => m.id !== row.id));
      setSelected(null);
      toast.show(t("milestoneDeleted"), "success");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd() {
    const next = {};
    if (!newTitle.trim()) next.title = t("titleRequired");
    if (!newDate) next.date = t("dateRequired");
    setNewErrors(next);
    if (Object.keys(next).length) return;

    setBusy("add");
    try {
      const { error } = await supabase.from("recovery_milestones").insert({
        user_id: userId,
        milestone_date: newDate,
        title: newTitle.trim(),
        description: newDesc.trim(),
        status: "pending",
        is_custom: true,
      });
      if (error) throw error;
      setRows(await fetchMilestones(userId));
      setFormOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewDate("");
      toast.show(t("milestoneAdded"), "success");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const today = toDateStr(new Date());
  const achieved = rows?.filter((m) => m.status === "achieved").length ?? 0;
  const total = rows?.length ?? 0;
  const currentId = rows?.find((m) => m.status === "pending" && m.milestone_date >= today)?.id;
  const toggleSelected = (id) => setSelected((s) => (s === id ? null : id));
  const selectedRow = rows?.find((m) => m.id === selected);

  const panel = (row) => (
    <EditPanel key={row.id} row={row} busy={busy} onSave={handleSave} onDelete={handleDelete} onClose={() => setSelected(null)} />
  );

  return (
    <div>
      {!isCaregiver && !discharge && (
        <Card padding={16} style={{ marginBottom: 16, background: "var(--color-primary-light)", border: "1px solid var(--color-primary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 200, fontSize: 14, color: "var(--color-primary-dark)" }}>{t("noDischargeBanner")}</span>
            <Button size="sm" onClick={() => onNavigate("profile")}>
              {t("setInProfile")}
            </Button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 22 }}>{t("timeline")}</h2>
        <Button size="sm" variant="secondary" onClick={() => setFormOpen((o) => !o)}>
          {t("addMilestone")}
        </Button>
      </div>

      <div
        aria-hidden={!formOpen}
        style={{
          maxHeight: formOpen ? 600 : 0,
          overflow: "hidden",
          visibility: formOpen ? "visible" : "hidden",
          transition: `max-height 0.3s ease, visibility 0s linear ${formOpen ? "0s" : "0.3s"}`,
        }}
      >
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label={t("date")} type="date" value={newDate} error={newErrors.date} onChange={(e) => setNewDate(e.target.value)} />
            <Input label={t("milestoneTitle")} value={newTitle} error={newErrors.title} onChange={(e) => setNewTitle(e.target.value)} />
            <Input label={t("description")} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <Button fullWidth loading={busy === "add"} onClick={handleAdd}>
              {t("save")}
            </Button>
          </div>
        </Card>
      </div>

      {rows === undefined ? (
        <Skeleton height={160} borderRadius={16} />
      ) : rows.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", color: "var(--color-muted)", fontSize: 14 }}>{t("noMilestones")}</div>
        </Card>
      ) : (
        <Card>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: "var(--color-heading)", fontWeight: 500, marginBottom: 8 }}>
              {t("milestonesAchieved", { a: achieved, b: total })}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-border)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${total ? (achieved / total) * 100 : 0}%`,
                  background: "var(--color-primary)",
                  borderRadius: 3,
                  transition: "width 0.4s ease-out",
                }}
              />
            </div>
          </div>

          {isDesktop ? (
            <>
              <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                <div style={{ position: "relative", display: "flex", minWidth: rows.length * 120 }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 17,
                      left: 60,
                      right: 60,
                      height: 2,
                      background: "var(--color-border)",
                    }}
                  />
                  {rows.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={selected === m.id}
                      onClick={() => toggleSelected(m.id)}
                      style={{
                        flex: "1 0 120px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 6px",
                        position: "relative",
                      }}
                    >
                      <Circle status={m.status} current={m.id === currentId} />
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 8 }}>{dateOf(m)}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-heading)", textAlign: "center", marginTop: 2 }}>
                        {titleOf(m)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {selectedRow && panel(selectedRow)}
            </>
          ) : (
            <div>
              {rows.map((m, rowIdx) => (
                <div key={m.id} style={{ position: "relative", paddingBottom: rowIdx === rows.length - 1 ? 0 : 20 }}>
                  {rowIdx < rows.length - 1 && (
                    <div style={{ position: "absolute", left: 17, top: 36, bottom: 0, width: 2, background: "var(--color-border)" }} />
                  )}
                  <button
                    type="button"
                    aria-pressed={selected === m.id}
                    onClick={() => toggleSelected(m.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      textAlign: "left",
                      position: "relative",
                    }}
                  >
                    <Circle status={m.status} current={m.id === currentId} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-heading)" }}>{titleOf(m)}</div>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{dateOf(m)}</div>
                    </div>
                  </button>
                  {selected === m.id && <div style={{ paddingLeft: 50 }}>{panel(m)}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
