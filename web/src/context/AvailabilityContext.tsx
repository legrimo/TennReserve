import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  fetchAvailability,
  fetchFacilities,
  type AvailabilitySnapshot,
  type Facility,
} from "@/lib/api";

const STORAGE_KEY = "tennreserve.facilityId";

interface AvailabilityContextValue {
  availability: AvailabilitySnapshot | null;
  loading: boolean;
  error: string | null;
  /** Updated after each successful fetch — use to refresh time-sensitive UI (e.g. execution countdown). */
  refreshedAt: number;
  refresh: () => Promise<void>;
  facilities: Facility[];
  defaultFacilityId: number;
  selectedFacilityId: number;
  setSelectedFacilityId: (id: number) => void;
  selectedFacility: Facility | undefined;
}

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);

function readStoredFacilityId(fallback: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isInteger(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [defaultFacilityId, setDefaultFacilityId] = useState(11);
  const [selectedFacilityId, setSelectedFacilityIdState] = useState(() => readStoredFacilityId(4));
  const [availability, setAvailability] = useState<AvailabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  useEffect(() => {
    fetchFacilities()
      .then((data) => {
        setFacilities(data.facilities);
        setDefaultFacilityId(data.defaultFacilityId);
        setSelectedFacilityIdState((prev) => {
          if (data.facilities.some((f) => f.id === prev)) return prev;
          try {
            localStorage.setItem(STORAGE_KEY, String(data.uiDefaultFacilityId));
          } catch {
            /* ignore */
          }
          return data.uiDefaultFacilityId;
        });
      })
      .catch(() => {});
  }, []);

  const setSelectedFacilityId = useCallback((id: number) => {
    setSelectedFacilityIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await fetchAvailability(force, selectedFacilityId);
        setAvailability(snapshot);
        setRefreshedAt(Date.now());
      } catch (err: any) {
        setError(err?.message ?? String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [selectedFacilityId]
  );

  const refresh = useCallback(() => load(true), [load]);

  // Re-fetch on launch, facility change, and route change so week rows roll forward after midnight.
  useEffect(() => {
    load(true).catch(() => {});
  }, [load, location.key]);

  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId);

  return (
    <AvailabilityContext.Provider
      value={{
        availability,
        loading,
        error,
        refreshedAt,
        refresh,
        facilities,
        defaultFacilityId,
        selectedFacilityId,
        setSelectedFacilityId,
        selectedFacility,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  const ctx = useContext(AvailabilityContext);
  if (!ctx) throw new Error("useAvailability must be used within AvailabilityProvider");
  return ctx;
}
