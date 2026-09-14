import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, IMPERSONATION_TERMINATED_EVENT } from "@/lib/api";
import { IMPERSONATION_RETURN_PATH_KEY, ME_QUERY_KEY } from "@/hooks/use-auth";

type ImpersonationTerminatedDetail = {
  restoredOriginalAdmin?: boolean;
};

function clearStoredReturnPath() {
  try {
    sessionStorage.removeItem(IMPERSONATION_RETURN_PATH_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}

export function ImpersonationLifecycleHandler() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const handlingRef = useRef(false);

  useEffect(() => {
    const handleTermination = (event: Event) => {
      if (handlingRef.current) return;
      handlingRef.current = true;

      const detail = (event as CustomEvent<ImpersonationTerminatedDetail>).detail;
      const restoredOriginalAdmin = detail?.restoredOriginalAdmin === true;
      clearStoredReturnPath();
      queryClient.clear();

      if (!restoredOriginalAdmin) {
        // Set an explicit unauthenticated identity after clearing the cache so
        // active auth guards cannot render stale private data during navigation.
        queryClient.setQueryData(ME_QUERY_KEY, null);
        setLocation("/login", { replace: true });
        window.setTimeout(() => {
          handlingRef.current = false;
        }, 0);
        return;
      }

      void queryClient
        .fetchQuery({
          queryKey: ME_QUERY_KEY,
          queryFn: () => api.me(),
          retry: false,
        })
        .then(() => {
          setLocation("/platform-admin/customers", { replace: true });
          window.setTimeout(() => {
            handlingRef.current = false;
          }, 0);
        })
        .catch(() => {
          queryClient.setQueryData(ME_QUERY_KEY, null);
          setLocation("/login", { replace: true });
          window.setTimeout(() => {
            handlingRef.current = false;
          }, 0);
        });
    };

    window.addEventListener(IMPERSONATION_TERMINATED_EVENT, handleTermination);
    return () => window.removeEventListener(IMPERSONATION_TERMINATED_EVENT, handleTermination);
  }, [queryClient, setLocation]);

  return null;
}