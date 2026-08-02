import { useQuery } from "@tanstack/react-query";
import { APP_SETTINGS_DEFAULTS, type AppSettings } from "@workspace/shared";
import { api } from "@/lib/api";
import { useAuth } from "./use-auth";

export const APP_SETTINGS_QUERY_KEY = ["app-settings"];

/**
 * Application settings for any authenticated user (clinic branding and
 * form defaults). Falls back to the spec defaults while loading.
 */
export function useAppSettings(): {
  settings: AppSettings;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: () => api.getAppSettings(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  return {
    settings: query.data?.settings ?? (APP_SETTINGS_DEFAULTS as AppSettings),
    isLoading: query.isLoading,
  };
}
