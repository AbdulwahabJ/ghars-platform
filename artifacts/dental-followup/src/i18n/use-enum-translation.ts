import { useTranslation } from "react-i18next";

export type EnumCategory =
  | "caseStatus"
  | "implantStatus"
  | "paymentLabel"
  | "paymentMethod"
  | "paymentStatus"
  | "installmentStatus"
  | "followupType"
  | "followupStatus"
  | "communicationResult"
  | "communicationReason"
  | "chargeType"
  | "adjunctProcedureCategory"
  | "procedureSide"
  | "sinusLiftType"
  | "prostheticEventType"
  | "procedureStatus";

export function useEnumTranslation() {
  const { t } = useTranslation("enums");
  const label = (category: EnumCategory, value: string | null | undefined) =>
    value ? t(`${category}.${value}`, { defaultValue: value }) : "";

  return { enumLabel: label };
}