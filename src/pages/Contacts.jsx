import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Skeleton from "../components/ui/Skeleton";
import Toggle from "../components/ui/Toggle";
import { PhoneIcon } from "../components/layout/icons";

const MAX_CONTACTS = 5;
// [value stored in the DB, translation key]
const RELATIONSHIPS = [
  ["Doctor", "relDoctor"],
  ["Family", "relFamily"],
  ["Friend", "relFriend"],
  ["Nurse", "relNurse"],
  ["Other", "relOther"],
];
const REL_KEYS = Object.fromEntries(RELATIONSHIPS);

const cleanPhone = (v) => v.replace(/[\s-]/g, "");
const validPhone = (v) => /^\+?\d{7,15}$/.test(v);

const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: 13,
};

function EmptyIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--color-primary-light)" />
      <rect x="40" y="26" width="40" height="68" rx="8" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2.5" />
      <path d="M52 34h16" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <path
        d="M60 74c-7-5-11-8.5-11-13a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 4.500-4 8-11 13z"
        fill="var(--color-primary)"
        opacity="0.85"
      />
    </svg>
  );
}

// ─── One contact ───────────────────────────────────────────────────────────

function ContactCard({ contact, busy, onSave, onMakePrimary, onDelete }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(contact.name);
  const [rel, setRel] = useState(contact.relationship);
  const [phone, setPhone] = useState(contact.phone);
  const [errors, setErrors] = useState({});

  const relLabel = REL_KEYS[contact.relationship] ? t(REL_KEYS[contact.relationship]) : contact.relationship;
  const saving = busy === `save-${contact.id}`;

  async function save() {
    const cleaned = cleanPhone(phone);
    const next = {};
    if (!name.trim()) next.name = t("nameRequired");
    if (!validPhone(cleaned)) next.phone = t("phoneInvalid");
    setErrors(next);
    if (Object.keys(next).length) return;
    if (await onSave(contact, { name: name.trim(), relationship: rel, phone: cleaned })) setEditing(false);
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label={t("contactName")} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
          <Select
            label={t("relationship")}
            value={rel}
            onChange={(e) => setRel(e.target.value)}
            options={RELATIONSHIPS.map(([value, key]) => ({ value, label: t(key) }))}
          />
          <Input label={t("phone")} type="tel" value={phone} error={errors.phone} onChange={(e) => setPhone(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" loading={saving} onClick={save}>
              {t("save")}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontStyle: "italic",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--color-heading)",
                  overflowWrap: "anywhere",
                }}
              >
                {contact.name}
              </div>
              <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
                {relLabel} · {contact.phone}
              </div>
            </div>
            {contact.is_primary && <Badge variant="danger">{t("primaryBadge")}</Badge>}
          </div>

          <a
            href={`tel:${contact.phone}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              marginTop: 14,
              background: "var(--color-alert)",
              color: "#fff",
              textDecoration: "none",
              borderRadius: 10,
              padding: 14,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <PhoneIcon stroke="#fff" />
            {t("callName", { name: contact.name })}
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" style={{ ...linkButtonStyle, color: "var(--color-primary)" }} onClick={() => setEditing(true)}>
              {t("edit")}
            </button>
            {!contact.is_primary && (
              <button
                type="button"
                disabled={busy === `primary-${contact.id}`}
                style={{ ...linkButtonStyle, color: "var(--color-primary)" }}
                onClick={() => onMakePrimary(contact)}
              >
                {t("makePrimary")}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              disabled={busy === `del-${contact.id}`}
              style={{ ...linkButtonStyle, color: "var(--color-alert)", fontWeight: confirming ? 600 : 400 }}
              onClick={confirming ? () => onDelete(contact) : () => setConfirming(true)}
            >
              {confirming ? t("confirmDelete") : t("delete")}
            </button>
            {confirming && (
              <button type="button" style={{ ...linkButtonStyle, color: "var(--color-muted)" }} onClick={() => setConfirming(false)}>
                {t("cancel")}
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Contacts() {
  const { user } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const userId = user.id;

  const [contacts, setContacts] = useState(undefined); // undefined = loading
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [rel, setRel] = useState("Doctor");
  const [phone, setPhone] = useState("");
  const [primary, setPrimary] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .order("display_order", { ascending: true });
    if (error) throw error;
    setContacts(data);
    return data;
  }, [userId]);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      setContacts([]);
      toast.show(t("error"), "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const fail = (err) => {
    console.error(err);
    toast.show(t("error"), "error");
  };

  // The unique index allows only one primary per user, so the old primary must be
  // demoted BEFORE a new one is set. If the second step fails, put the old one back.
  async function switchPrimary(oldPrimary, setNew) {
    if (oldPrimary) {
      const { error } = await supabase
        .from("emergency_contacts")
        .update({ is_primary: false })
        .eq("id", oldPrimary.id)
        .eq("user_id", userId);
      if (error) throw error;
    }
    try {
      await setNew();
    } catch (err) {
      if (oldPrimary) {
        await supabase.from("emergency_contacts").update({ is_primary: true }).eq("id", oldPrimary.id).eq("user_id", userId);
      }
      throw err;
    }
  }

  async function handleAdd() {
    const cleaned = cleanPhone(phone);
    const next = {};
    if (!name.trim()) next.name = t("nameRequired");
    if (!validPhone(cleaned)) next.phone = t("phoneInvalid");
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const makePrimary = contacts.length === 0 || primary; // the first contact is always primary
      const oldPrimary = makePrimary ? contacts.find((c) => c.is_primary) : null;
      const displayOrder = contacts.reduce((max, c) => Math.max(max, c.display_order ?? 0), 0) + 1;

      await switchPrimary(oldPrimary, async () => {
        const { error } = await supabase.from("emergency_contacts").insert({
          user_id: userId,
          name: name.trim(),
          relationship: rel,
          phone: cleaned,
          is_primary: makePrimary,
          display_order: displayOrder,
        });
        if (error) throw error;
      });

      await load();
      setFormOpen(false);
      setName("");
      setPhone("");
      setRel("Doctor");
      setPrimary(false);
      toast.show(t("contactAdded"), "success");
    } catch (err) {
      fail(err);
      load().catch(console.error);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(contact, patch) {
    setBusy(`save-${contact.id}`);
    try {
      const { error } = await supabase.from("emergency_contacts").update(patch).eq("id", contact.id).eq("user_id", userId);
      if (error) throw error;
      await load();
      toast.show(t("contactSaved"), "success");
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleMakePrimary(contact) {
    setBusy(`primary-${contact.id}`);
    try {
      await switchPrimary(contacts.find((c) => c.is_primary), async () => {
        const { error } = await supabase
          .from("emergency_contacts")
          .update({ is_primary: true })
          .eq("id", contact.id)
          .eq("user_id", userId);
        if (error) throw error;
      });
      await load();
    } catch (err) {
      fail(err);
      load().catch(console.error);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(contact) {
    setBusy(`del-${contact.id}`);
    try {
      const { error } = await supabase.from("emergency_contacts").delete().eq("id", contact.id).eq("user_id", userId);
      if (error) throw error;

      // If the primary was deleted, promote the remaining contact with the lowest display_order
      const remaining = contacts.filter((c) => c.id !== contact.id);
      if (contact.is_primary && remaining.length) {
        const next = [...remaining].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0];
        const { error: promoteError } = await supabase
          .from("emergency_contacts")
          .update({ is_primary: true })
          .eq("id", next.id)
          .eq("user_id", userId);
        if (promoteError) throw promoteError;
      }
      await load();
      toast.show(t("contactDeleted"), "success");
    } catch (err) {
      fail(err);
      load().catch(console.error);
    } finally {
      setBusy(null);
    }
  }

  const atMax = (contacts?.length ?? 0) >= MAX_CONTACTS;
  const isFirst = contacts?.length === 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22 }}>{t("contacts")}</h2>
        <Button
          size="sm"
          disabled={contacts === undefined}
          onClick={() => setFormOpen((open) => !open)}
          style={{ borderRadius: "50%", width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1 }}
        >
          {formOpen ? "×" : "+"}
        </Button>
      </div>

      <div
        aria-hidden={!formOpen}
        style={{
          maxHeight: formOpen ? 700 : 0,
          overflow: "hidden",
          visibility: formOpen ? "visible" : "hidden",
          transition: `max-height 0.3s ease, visibility 0s linear ${formOpen ? "0s" : "0.3s"}`,
        }}
      >
        <Card style={{ marginBottom: 16 }}>
          {atMax ? (
            <div style={{ fontSize: 14, color: "var(--color-muted)" }}>{t("maxContacts")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input label={t("contactName")} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
              <Select
                label={t("relationship")}
                value={rel}
                onChange={(e) => setRel(e.target.value)}
                options={RELATIONSHIPS.map(([value, key]) => ({ value, label: t(key) }))}
              />
              <Input label={t("phone")} type="tel" value={phone} error={errors.phone} onChange={(e) => setPhone(e.target.value)} />
              <Toggle
                checked={isFirst || primary}
                disabled={isFirst}
                onChange={setPrimary}
                label={t("setPrimary")}
              />
              <Button fullWidth loading={saving} onClick={handleAdd}>
                {t("save")}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {contacts === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={130} borderRadius={16} />
          <Skeleton height={130} borderRadius={16} />
        </div>
      ) : contacts.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, padding: "24px 0" }}>
          <EmptyIllustration />
          <h2 style={{ fontSize: 20, maxWidth: 360 }}>{t("emptyContacts")}</h2>
        </div>
      ) : (
        contacts.map((c) => (
          <ContactCard key={c.id} contact={c} busy={busy} onSave={handleSave} onMakePrimary={handleMakePrimary} onDelete={handleDelete} />
        ))
      )}
    </div>
  );
}
