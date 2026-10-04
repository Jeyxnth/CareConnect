import { useEffect, useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatDate } from "../../lib/format";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import {
  ChatIcon,
  CheckIcon,
  DocumentIcon,
  HomeIcon,
  MoreIcon,
  PhoneIcon,
  PillIcon,
  RiskIcon,
  SignOutIcon,
  TimelineIcon,
  UserIcon,
} from "./icons";

const NAV = [
  { key: "home", Icon: HomeIcon },
  { key: "chat", Icon: ChatIcon },
  { key: "documents", Icon: DocumentIcon },
  { key: "adherence", Icon: CheckIcon },
  { key: "risk", Icon: RiskIcon },
  { key: "medications", Icon: PillIcon },
  { key: "timeline", Icon: TimelineIcon },
  { key: "contacts", Icon: PhoneIcon },
  { key: "profile", Icon: UserIcon },
];

const MOBILE_TABS = NAV.slice(0, 4); // Home, Chat, Documents, Adherence (+ More)
const MORE_ITEMS = NAV.slice(4); // Risk, Medications, Timeline, Contacts

const MAIN_MOBILE_PAD = "env(safe-area-inset-bottom, 0px)";

function Monogram({ size, fontSize }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-primary-light)",
        color: "var(--color-primary)",
        fontWeight: 700,
        fontSize,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      CC
    </span>
  );
}

function LangToggle() {
  const { lang, toggleLang } = useLanguage();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={toggleLang}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1.5px solid ${hovered ? "var(--color-primary)" : "var(--color-border)"}`,
        color: hovered ? "var(--color-primary)" : "var(--color-body)",
        borderRadius: 20,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 500,
        background: "transparent",
        cursor: "pointer",
        transition: "border-color 0.15s, color 0.15s",
      }}
    >
      {lang === "en" ? "EN" : "தமிழ்"}
    </button>
  );
}

function NavItem({ item, label, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const { Icon } = item;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={active ? "page" : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        border: "none",
        padding: "10px 14px",
        borderRadius: 10,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        marginBottom: 2,
        transition: "background 0.15s, color 0.15s",
        background: active
          ? "var(--color-primary-light)"
          : hovered
            ? "var(--color-surface-alt)"
            : "transparent",
        color: active
          ? "var(--color-primary)"
          : hovered
            ? "var(--color-heading)"
            : "var(--color-body)",
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "20%",
            height: "60%",
            width: 3,
            background: "var(--color-primary)",
            borderRadius: "0 3px 3px 0",
          }}
        />
      )}
      <Icon active={active} />
      {label}
    </button>
  );
}

function Sidebar({ activePage, onNavigate }) {
  const { profile, user, signOut } = useAuthContext();
  const { t, lang } = useLanguage();

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 260,
        height: "100vh",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Monogram size={40} fontSize={16} />
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontStyle: "italic",
              fontSize: 20,
              color: "var(--color-heading)",
            }}
          >
            {t("appName")}
          </span>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onNavigate("profile")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onNavigate("profile")}
          style={{ marginTop: 12, cursor: "pointer" }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "var(--color-heading)",
              marginBottom: 4,
              overflowWrap: "anywhere",
            }}
          >
            {profile?.name || user?.email}
          </div>
          <Badge variant="primary" size="sm">
            {profile?.role === "caregiver" ? t("caregiverRole") : t("patientRole")}
          </Badge>
          {profile?.discharge_date && (
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>
              {t("dischargedOn", { date: formatDate(profile.discharge_date, lang) })}
            </div>
          )}
        </div>
      </div>

      <nav style={{ flexGrow: 1, padding: 12, overflowY: "auto" }}>
        {NAV.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            label={t(item.key)}
            active={activePage === item.key}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </nav>

      <div style={{ padding: 16, borderTop: "1px solid var(--color-border)" }}>
        <LangToggle />
        <div style={{ marginTop: 8 }}>
          <Button variant="ghost" size="sm" fullWidth icon={<SignOutIcon />} onClick={signOut}>
            {t("signOut")}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { t } = useLanguage();
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 56,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "env(safe-area-inset-top, 0px) 16px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Monogram size={32} fontSize={13} />
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--color-heading)",
          }}
        >
          {t("appName")}
        </span>
      </div>
      <LangToggle />
    </header>
  );
}

function MobileTab({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "8px 4px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 500,
        color: active ? "var(--color-primary)" : "var(--color-muted)",
      }}
    >
      {children}
      {label}
    </button>
  );
}

function MobileTabBar({ activePage, onNavigate }) {
  const { t } = useLanguage();
  const { signOut } = useAuthContext();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((i) => i.key === activePage);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const go = (key) => {
    setMoreOpen(false);
    onNavigate(key);
  };

  return (
    <>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          height: `calc(60px + ${MAIN_MOBILE_PAD})`,
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          paddingBottom: MAIN_MOBILE_PAD,
          display: "flex",
          zIndex: 100,
        }}
      >
        {MOBILE_TABS.map(({ key, Icon }) => (
          <MobileTab key={key} label={t(key)} active={activePage === key} onClick={() => go(key)}>
            <Icon size={22} active={activePage === key} />
          </MobileTab>
        ))}
        <MobileTab label={t("more")} active={moreActive} onClick={() => setMoreOpen(true)}>
          <MoreIcon size={22} active={moreActive} />
        </MobileTab>
      </nav>

      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 }}
          />
          <div
            role="dialog"
            aria-label={t("more")}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "50vh",
              overflowY: "auto",
              background: "var(--color-surface)",
              borderRadius: "20px 20px 0 0",
              borderTop: "1px solid var(--color-border)",
              padding: 20,
              paddingBottom: `calc(20px + ${MAIN_MOBILE_PAD})`,
              zIndex: 201,
              animation: "slideUp 0.25s ease-out",
            }}
          >
            {MORE_ITEMS.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                label={t(item.key)}
                active={activePage === item.key}
                onClick={() => go(item.key)}
              />
            ))}
            {/* The mobile header has no sign-out, so it lives here */}
            <div style={{ marginTop: 8, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
              <Button variant="ghost" size="sm" fullWidth icon={<SignOutIcon />} onClick={signOut}>
                {t("signOut")}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function AppShell({ children, activePage, onNavigate }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <>
      {isDesktop ? (
        <Sidebar activePage={activePage} onNavigate={onNavigate} />
      ) : (
        <>
          <MobileHeader />
          <MobileTabBar activePage={activePage} onNavigate={onNavigate} />
        </>
      )}
      <main
        style={
          isDesktop
            ? { marginLeft: 260, minHeight: "100vh", background: "var(--color-bg)", padding: 32 }
            : {
                marginTop: 56,
                marginBottom: `calc(60px + ${MAIN_MOBILE_PAD})`,
                background: "var(--color-bg)",
                padding: 16,
              }
        }
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div key={activePage} style={{ animation: "fadeIn 0.15s ease-out" }}>
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
