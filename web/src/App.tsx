import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ActivityPage } from "@/pages/ActivityPage";
import { AttemptStagingPage } from "@/pages/AttemptStagingPage";
import { HomePage } from "@/pages/HomePage";
import { NewAttemptPage } from "@/pages/NewAttemptPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { fetchAvailability, fetchStatus, patchEnabled } from "@/lib/api";

function DashboardLayout() {
  const [enabled, setEnabled] = useState(false);
  const [msUntilMidnight, setMsUntilMidnight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    const status = await fetchStatus();
    setEnabled(status.enabled);
    setMsUntilMidnight(status.msUntilMidnight);
  }, []);

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 30_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  const onEnabledChange = async (v: boolean) => {
    try {
      await patchEnabled(v);
      setEnabled(v);
      toast.success(v ? "Auto-book enabled" : "Auto-book paused");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAvailability(true);
      await loadStatus();
      toast.success("Availability refreshed");
      window.dispatchEvent(new Event("tennreserve:refresh"));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AppShell
      enabled={enabled}
      onEnabledChange={onEnabledChange}
      msUntilMidnight={msUntilMidnight}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/attempts/new" element={<NewAttemptPage />} />
          <Route path="/attempts/:id" element={<AttemptStagingPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster theme="dark" position="bottom-right" />
    </BrowserRouter>
  );
}
