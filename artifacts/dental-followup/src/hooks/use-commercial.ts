import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  PublicRegistrationInput,
  EmailVerificationInput,
  ResendVerificationInput,
  CreateActivationRequestInput,
} from "@workspace/shared";

export const COMMERCIAL_STATUS_KEY = ["commercial-status"];

export function useCommercialStatus() {
  return useQuery({
    queryKey: COMMERCIAL_STATUS_KEY,
    queryFn: () => api.getCommercialStatus(),
    retry: false,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: PublicRegistrationInput) => api.register(input),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (input: EmailVerificationInput) => api.verifyEmail(input),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (input: ResendVerificationInput) => api.resendVerification(input),
  });
}

export function useCreateActivationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActivationRequestInput) =>
      api.createActivationRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMERCIAL_STATUS_KEY });
    },
  });
}
