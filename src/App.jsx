import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { normalizeTime } from "./lib/format";
import { registerServiceWorker, rescheduleActiveReminders } from "./lib/notifications";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { ToastProvider } from "./context/ToastContext";
import AuthScreen from "./components/auth/AuthScreen";
import AppShell from "./components/layout/AppShell";
import ReminderBanner from "./components/ui/ReminderBanner";
import Adherence from "./pages/Adherence";
import Chat from "./pages/Chat";
import Contacts from "./pages/Contacts";
import Profile from "./pages/Profile";
import Timeline from "./pages/Timeline";
import Documents from "./pages/Documents";
import Home from "./pages/Home";
import Medications from "./pages/Medications";
import Risk from "./pages/Risk";

function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        animation: "pulse 1.6s ease-in-out infinite",
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: "var(--color-primary)" }}>CC</div>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontStyle: "italic",
          fontSize: 20,
          color: "var(--color-muted)",
        }}
      >
        CareConnect
      </div>
    </div>
  );
}

function ComingSoon({ page }) {
  const { t } = useLanguage();
  return <div style={{ padding: 40 }}>{t("comingSoon", { page: t(page) })}</div>;
}

function AppContent() {
  const { user, loading } = useAuthContext();
  const [activePage, setActivePage] = useState("home");
  // Keeps the auth screen up after sign-up so the invite-code card can be shown
  const [authHold, setAuthHold] = useState(false);
  const [currentReminder, setCurrentReminder] = useState(null);
  const [reminderQueue, setReminderQueue] = useState([]);
  const userId = user?.id;

  // Register the service worker, then re-arm every active reminder (its timers don't
  // survive the worker being stopped)
  useEffect(() => {
    if (!userId) return;
    (async () => {
      await registerServiceWorker();
      try {
        await rescheduleActiveReminders(userId);
      } catch (err) {
        console.error("[CareConnect] couldn't reschedule reminders:", err);
      }
    })();
  }, [userId]);

  // Don't carry one account's pending reminders over to the next
  useEffect(() => {
    setCurrentReminder(null);
    setReminderQueue([]);
  }, [userId]);

  // Reminders fired by the service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === "REMINDER_FIRED") {
        setReminderQueue((q) => [...q, event.data]);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  // Show one banner at a time
  useEffect(() => {
    if (!currentReminder && reminderQueue.length > 0) {
      setCurrentReminder(reminderQueue[0]);
      setReminderQueue((q) => q.slice(1));
    }
  }, [currentReminder, reminderQueue]);

  const onTaken = useCallback(
    async (reminder) => {
      // Log the dose against the time slot it was for (so the Home / Medications
      // screens, which match by HH:MM, see it) — best effort, never crashes the app
      try {
        const when = new Date();
        const slot = normalizeTime(reminder.timeString);
        if (slot) {
          const [h, m] = slot.split(":").map(Number);
          when.setHours(h, m, 0, 0);
        }
        const { error } = await supabase.from("reminder_logs").upsert({
          user_id: userId,
          reminder_id: reminder.id,
          scheduled_time: when.toISOString(),
          taken_at: new Date().toISOString(),
          status: "taken",
        });
        if (error) throw error;
      } catch (e) {
        console.error(e);
      }
      setCurrentReminder(null);
    },
    [userId]
  );

  const onDismiss = useCallback(() => setCurrentReminder(null), []);

  if (loading) return <FullScreenLoader />;
  if (!user || authHold) return <AuthScreen onHold={setAuthHold} />;

  return (
    <>
      <ReminderBanner reminder={currentReminder} onTaken={onTaken} onDismiss={onDismiss} />
      <AppShell activePage={activePage} onNavigate={setActivePage}>
        {activePage === "home" ? (
          <Home onNavigate={setActivePage} />
        ) : activePage === "chat" ? (
          <Chat />
        ) : activePage === "documents" ? (
          <Documents />
        ) : activePage === "adherence" ? (
          <Adherence />
        ) : activePage === "risk" ? (
          <Risk />
        ) : activePage === "medications" ? (
          <Medications />
        ) : activePage === "contacts" ? (
          <Contacts />
        ) : activePage === "timeline" ? (
          <Timeline onNavigate={setActivePage} />
        ) : activePage === "profile" ? (
          <Profile />
        ) : (
          <ComingSoon page={activePage} />
        )}
      </AppShell>
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
