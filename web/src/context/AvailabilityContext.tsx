import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { fetchAvailability, type AvailabilitySnapshot } from "@/lib/api";

interface AvailabilityContextValue {
  availability: AvailabilitySnapshot | null;
  loading: boolean;
  error: string | null;
  /** Updated after each successful fetch — use to refresh time-sensitive UI (e.g. execution countdown). */
  refreshedAt: number;
  refresh: () => Promise<void>;
}

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);

export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [availability, setAvailability] = useState<AvailabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchAvailability(force);
      setAvailability(snapshot);
      setRefreshedAt(Date.now());
    } catch (err: any) {
      setError(err?.message ?? String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  // Re-fetch on launch and whenever the route changes so week rows roll forward after midnight.
  useEffect(() => {
    load(true).catch(() => {});
  }, [load, location.key]);

  return (
    <AvailabilityContext.Provider value={{ availability, loading, error, refreshedAt, refresh }}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  const ctx = useContext(AvailabilityContext);
  if (!ctx) throw new Error("useAvailability must be used within AvailabilityProvider");
  return ctx;
}
