import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  LandingMediaUploadInput,
  CreateLandingMediaInput,
  UpdateLandingMediaInput,
  ReplaceLandingMediaInput,
  LandingMediaStatusInput,
  ReorderLandingMediaInput,
} from "@workspace/shared";

export const PUBLIC_LANDING_MEDIA_KEY = ["landing-media", "public"];
export const ADMIN_LANDING_MEDIA_KEY = ["landing-media", "admin"];

export function usePublicLandingMedia() {
  return useQuery({
    queryKey: PUBLIC_LANDING_MEDIA_KEY,
    queryFn: () => api.getLandingMedia(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminLandingMedia() {
  return useQuery({
    queryKey: ADMIN_LANDING_MEDIA_KEY,
    queryFn: () => api.platformListLandingMedia(),
  });
}

export function useRequestLandingMediaUploadUrl() {
  return useMutation({
    mutationFn: (input: LandingMediaUploadInput) =>
      api.platformRequestLandingMediaUploadUrl(input),
  });
}

export function useCreateLandingMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLandingMediaInput) => api.platformCreateLandingMedia(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_LANDING_MEDIA_KEY });
      queryClient.invalidateQueries({ queryKey: PUBLIC_LANDING_MEDIA_KEY });
    },
  });
}

export function useUpdateLandingMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLandingMediaInput }) =>
      api.platformUpdateLandingMedia(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_LANDING_MEDIA_KEY });
      queryClient.invalidateQueries({ queryKey: PUBLIC_LANDING_MEDIA_KEY });
    },
  });
}

export function useReplaceLandingMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReplaceLandingMediaInput }) =>
      api.platformReplaceLandingMedia(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_LANDING_MEDIA_KEY });
      queryClient.invalidateQueries({ queryKey: PUBLIC_LANDING_MEDIA_KEY });
    },
  });
}

export function useSetLandingMediaStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LandingMediaStatusInput }) =>
      api.platformSetLandingMediaStatus(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_LANDING_MEDIA_KEY });
      queryClient.invalidateQueries({ queryKey: PUBLIC_LANDING_MEDIA_KEY });
    },
  });
}

export function useReorderLandingMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderLandingMediaInput) => api.platformReorderLandingMedia(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_LANDING_MEDIA_KEY });
      queryClient.invalidateQueries({ queryKey: PUBLIC_LANDING_MEDIA_KEY });
    },
  });
}

export function useDeleteLandingMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.platformDeleteLandingMedia(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_LANDING_MEDIA_KEY });
      queryClient.invalidateQueries({ queryKey: PUBLIC_LANDING_MEDIA_KEY });
    },
  });
}
