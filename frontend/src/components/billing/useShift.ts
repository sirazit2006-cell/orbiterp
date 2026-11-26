import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Shift } from "../../api/types";

/** The signed-in user's open cash shift, or null when none is open. */
export function useShift() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(
    () =>
      api
        .get<Shift | null>("/shifts/current/")
        .then((r) => setShift(r.data || null))
        .finally(() => setLoaded(true)),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  return { shift, loaded, reload };
}
