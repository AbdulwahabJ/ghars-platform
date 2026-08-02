import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  BaseAmountInput,
  ChargeInput,
  DiscountInput,
  FinanceFilters,
  PaymentInput,
  VoidPaymentInput,
} from "@workspace/shared";

export const getCaseFinanceQueryKey = (caseId: string) =>
  ["case-finance", caseId] as const;

export function useCaseFinance(caseId: string, enabled = true) {
  return useQuery({
    queryKey: getCaseFinanceQueryKey(caseId),
    queryFn: () => api.getCaseFinance(caseId),
    enabled: Boolean(caseId) && enabled,
  });
}

function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return (caseId: string) => {
    void queryClient.invalidateQueries({
      queryKey: getCaseFinanceQueryKey(caseId),
    });
    void queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
  };
}

export function useUpdateBaseAmount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: BaseAmountInput }) =>
      api.updateBaseAmount(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useCreateCharge() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: ChargeInput }) =>
      api.createCharge(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useDeleteCharge() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id }: { id: string; caseId: string }) => api.deleteCharge(id),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useCreateDiscount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: DiscountInput }) =>
      api.createDiscount(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useDeleteDiscount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id }: { id: string; caseId: string }) =>
      api.deleteDiscount(id),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useCreatePayment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: PaymentInput }) =>
      api.createPayment(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useVoidPayment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      caseId: string;
      data: VoidPaymentInput;
    }) => api.voidPayment(id, data),
    onSuccess: (_res, vars) => invalidate(vars.caseId),
  });
}

export function useFinanceOverview(filters: FinanceFilters, enabled = true) {
  return useQuery({
    queryKey: ["finance-overview", filters],
    queryFn: () => api.getFinanceOverview(filters),
    enabled,
    placeholderData: (prev) => prev,
  });
}
