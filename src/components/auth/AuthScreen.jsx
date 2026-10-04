import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../context/LanguageContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Input from "../ui/Input";

// 6-digit numeric invite code
const generateInviteCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");

function passwordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 1, label: "passwordWeak", color: "var(--color-alert)" };
  if (score === 3) return { level: 2, label: "passwordFair", color: "var(--color-warning)" };
  return { level: 3, label: "passwordStrong", color: "var(--color-success)" };
}

function Monogram({ size, light }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: light ? "#fff" : "var(--color-primary)",
        color: light ? "var(--color-primary)" : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.36,
        flexShrink: 0,
      }}
    >
      CC
    </div>
  );
}

function Illustration() {
  return (
    <svg viewBox="0 0 300 200" width="100%" style={{ maxWidth: 360, marginTop: 32 }} aria-hidden="true">
      {/* sun / warmth */}
      <circle cx="150" cy="92" r="76" fill="#fff" opacity="0.15" />
      <circle cx="150" cy="92" r="50" fill="#fff" opacity="0.15" />
      {/* ground */}
      <path d="M10 178 Q150 148 290 178" stroke="#fff" strokeWidth="2" fill="none" opacity="0.3" strokeLinecap="round" />
      {/* doctor */}
      <circle cx="108" cy="84" r="14" fill="#fff" opacity="0.4" />
      <path d="M84 170 V124 Q84 102 108 102 Q132 102 132 124 V170 Z" fill="#fff" opacity="0.4" />
      {/* patient */}
      <circle cx="194" cy="96" r="12" fill="#fff" opacity="0.3" />
      <path d="M172 170 V132 Q172 114 194 114 Q216 114 216 132 V170 Z" fill="#fff" opacity="0.3" />
      {/* connection: curved line + heart */}
      <path d="M124 78 Q150 40 178 90" stroke="#fff" strokeWidth="2" strokeDasharray="3 6" fill="none" opacity="0.4" strokeLinecap="round" />
      <path
        d="M150 66 C150 60 141 58 141 65 C141 71 150 76 150 76 C150 76 159 71 159 65 C159 58 150 60 150 66 Z"
        fill="#fff"
        opacity="0.4"
      />
      {/* soft sparkles */}
      <circle cx="52" cy="60" r="3" fill="#fff" opacity="0.25" />
      <circle cx="252" cy="50" r="4" fill="#fff" opacity="0.2" />
      <circle cx="262" cy="120" r="2.5" fill="#fff" opacity="0.3" />
    </svg>
  );
}

export default function AuthScreen({ onHold }) {
  const { t, lang, toggleLang } = useLanguage();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [mode, setMode] = useState("sign-in");
  const [stage, setStage] = useState("form"); // form | link-retry | welcome
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("patient");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const [inviteCode, setInviteCode] = useState(null);
  const [copied, setCopied] = useState(false);

  const strength = passwordStrength(password);

  // `hold` keeps this screen mounted after sign-up, since the new session would
  // otherwise swap it for the app before the invite-code card is shown.
  const finish = () => onHold(false);

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setCodeError("");
    setNotice("");
  };

  async function handleSignIn() {
    if (!email.trim() || !password) return setError(t("fillAllFields"));
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (authError) {
      setError(
        /invalid login credentials/i.test(authError.message)
          ? t("invalidCredentials")
          : authError.message
      );
    }
  }

  async function createInviteCode(userId) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      const { error: insertError } = await supabase.from("caregiver_links").insert({
        patient_user_id: userId,
        invite_code: candidate,
        accepted: false,
      });
      if (!insertError) return candidate;
      if (insertError.code !== "23505") break; // only retry on a unique-code collision
    }
    return null;
  }

  async function redeemCode() {
    const { error: rpcError } = await supabase.rpc("redeem_invite_code", { code });
    if (rpcError) {
      setCodeError(t("inviteInvalid"));
      return false;
    }
    return true;
  }

  async function handleSignUp() {
    if (!name.trim()) return setError(t("nameRequired"));
    if (!email.trim() || !password) return setError(t("fillAllFields"));
    if (password.length < 8) return setError(t("passwordTooShort"));
    if (role === "caregiver" && !/^\d{6}$/.test(code)) return setCodeError(t("inviteInvalid"));

    setSubmitting(true);
    onHold(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), role } },
    });

    if (authError) {
      setSubmitting(false);
      finish();
      return setError(authError.message);
    }

    // Email confirmation enabled: there is no session yet, so nothing more to do here.
    if (!data.session) {
      setSubmitting(false);
      finish();
      setPassword("");
      setMode("sign-in");
      return setNotice(t("checkEmail"));
    }

    setWelcomeName(name.trim());
    if (role === "patient") {
      setInviteCode(await createInviteCode(data.user.id));
      setStage("welcome");
    } else if (await redeemCode()) {
      finish();
    } else {
      setStage("link-retry");
    }
    setSubmitting(false);
  }

  async function handleRetryLink() {
    if (!/^\d{6}$/.test(code)) return setCodeError(t("inviteInvalid"));
    setCodeError("");
    setSubmitting(true);
    const ok = await redeemCode();
    setSubmitting(false);
    if (ok) finish();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code stays visible to copy by hand */
    }
  }

  const onSubmit = (e) => {
    e.preventDefault();
    setError("");
    setCodeError("");
    setNotice("");
    if (stage === "link-retry") return handleRetryLink();
    return mode === "sign-in" ? handleSignIn() : handleSignUp();
  };

  const inviteField = (
    <div style={{ animation: "fadeIn 0.25s ease-out" }}>
      <Input
        label={t("inviteCode")}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
          setCodeError("");
        }}
        placeholder="000000"
        hint={t("inviteHint")}
        error={codeError}
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
      />
    </div>
  );

  const roleCard = (value, icon, title, subtitle) => {
    const selected = role === value;
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => {
          setRole(value);
          setCodeError("");
        }}
        style={{
          flex: 1,
          textAlign: "left",
          cursor: "pointer",
          borderRadius: 12,
          padding: 16,
          border: selected ? "2px solid var(--color-primary)" : "1.5px solid var(--color-border)",
          background: selected ? "var(--color-primary-light)" : "var(--color-surface)",
          color: "inherit",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: selected ? "var(--color-primary-dark)" : "var(--color-heading)" }}>
          {title}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, color: "var(--color-muted)" }}>{subtitle}</div>
      </button>
    );
  };

  const modeButton = (value, label) => (
    <button
      type="button"
      onClick={() => switchMode(value)}
      style={{
        background: "none",
        border: "none",
        borderBottom: `2px solid ${mode === value ? "var(--color-primary)" : "transparent"}`,
        padding: "0 0 8px",
        fontSize: 16,
        fontWeight: mode === value ? 600 : 400,
        color: mode === value ? "var(--color-heading)" : "var(--color-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const pill = (icon, text) => (
    <span
      style={{
        border: "1px solid rgba(255,255,255,0.3)",
        background: "rgba(255,255,255,0.12)",
        color: "#fff",
        borderRadius: 20,
        padding: "6px 14px",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {icon} {text}
    </span>
  );

  let rightContent;
  if (stage === "welcome") {
    rightContent = (
      <Card style={{ animation: "fadeIn 0.3s ease-out", textAlign: "center" }}>
        <h2 style={{ fontSize: 24, marginBottom: 20 }}>{t("welcomeUser", { name: welcomeName })}</h2>
        {inviteCode ? (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 15 }}>{t("yourInviteCode")}</p>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                letterSpacing: 8,
                fontSize: 28,
                fontWeight: 700,
                color: "var(--color-primary)",
                background: "var(--color-primary-light)",
                borderRadius: 12,
                padding: 16,
                textAlign: "center",
                paddingLeft: 24, // offsets trailing letter-spacing so the digits look centred
              }}
            >
              {inviteCode}
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" onClick={copyCode}>
                {copied ? `${t("copied")} ✓` : t("copyCode")}
              </Button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--color-alert)" }}>{t("codeGenFailed")}</p>
        )}
        <div style={{ marginTop: 24 }}>
          <Button fullWidth onClick={finish}>
            {t("continueToApp")}
          </Button>
        </div>
      </Card>
    );
  } else {
    rightContent = (
      <>
        <div style={{ display: "flex", gap: 24, marginBottom: 28 }}>
          {stage === "form" && modeButton("sign-in", t("signIn"))}
          {stage === "form" && modeButton("sign-up", t("createAccount"))}
        </div>

        {notice && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 14,
              background: "var(--color-primary-light)",
              color: "var(--color-primary-dark)",
            }}
          >
            {notice}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {stage === "link-retry" ? (
            <>
              {inviteField}
              <Button type="submit" fullWidth loading={submitting}>
                {t("linkAccount")}
              </Button>
              <Button variant="ghost" fullWidth onClick={finish}>
                {t("skip")}
              </Button>
            </>
          ) : mode === "sign-in" ? (
            <>
              <Input
                label={t("email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                label={t("password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <Button type="submit" fullWidth loading={submitting}>
                {t("signIn")}
              </Button>
            </>
          ) : (
            <>
              <Input
                label={t("fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
              <Input
                label={t("email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <div>
                <Input
                  label={t("password")}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {strength && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            background: i <= strength.level ? strength.color : "var(--color-border)",
                            transition: "background 0.2s",
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: strength.color }}>{t(strength.label)}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {roleCard("patient", "🏥", t("iAmPatient"), t("iAmPatientSub"))}
                {roleCard("caregiver", "👨‍👩‍👧", t("iAmCaregiver"), t("iAmCaregiverSub"))}
              </div>
              {role === "caregiver" && inviteField}
              <Button type="submit" fullWidth loading={submitting}>
                {t("createAccount")}
              </Button>
            </>
          )}

          {error && (
            <div role="alert" style={{ color: "var(--color-alert)", fontSize: 13 }}>
              {error}
            </div>
          )}
        </form>
      </>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {isDesktop && (
        <div
          style={{
            width: "40%",
            background: "linear-gradient(160deg, #357A6F, #4A9B8E)",
            padding: 48,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            color: "#fff",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Monogram size={56} light />
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontStyle: "italic",
                  fontSize: 28,
                  color: "#fff",
                }}
              >
                {t("appName")}
              </span>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 16, opacity: 0.85 }}>{t("tagline")}</p>
            <Illustration />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {pill("🔒", t("featureSecure"))}
            {pill("💊", t("featureReminders"))}
            {pill("🤖", t("featureAI"))}
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: isDesktop ? 48 : 24,
          position: "relative",
          background: "var(--color-bg)",
        }}
      >
        <button
          type="button"
          onClick={toggleLang}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "var(--color-surface-alt)",
            border: "1px solid var(--color-border)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13,
            color: "var(--color-body)",
            cursor: "pointer",
          }}
          lang={lang === "en" ? "ta" : "en"}
        >
          {t("switchLanguage")}
        </button>

        <div style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}>
          {!isDesktop && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              <Monogram size={40} />
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontStyle: "italic",
                  fontSize: 22,
                  color: "var(--color-heading)",
                }}
              >
                {t("appName")}
              </span>
            </div>
          )}
          {rightContent}
        </div>
      </div>
    </div>
  );
}
