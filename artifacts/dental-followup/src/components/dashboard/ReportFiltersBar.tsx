import { Label } from "@/components/ui/label";
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CASE_STATUSES, IMPLANT_STATUSES } from "@workspace/shared";
import { REPORT_PERIODS, type ReportPeriodId } from "@/lib/report-periods";
import { todayIso } from "@/lib/money";
import { useTranslation } from "react-i18next";

export const ALL = "__all__";

export interface ReportFilterState {
  period: ReportPeriodId;
  customFrom: string;
  customTo: string;
  treatingDoctor: string;
  implantSystem: string;
  implantStatus: string;
  caseStatus: string;
}

/**
 * Shared filters for the statistics and the operational report sections
 * (period, doctor, implant system, case status).
 */
export function ReportFiltersBar({
  state,
  onChange,
  doctorOptions,
  systemOptions,
}: {
  state: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  doctorOptions: string[];
  systemOptions: string[];
}) {
  const { t } = useTranslation("operations");
  const set = (patch: Partial<ReportFilterState>) =>
    onChange({ ...state, ...patch });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 items-end" data-testid="card-report-filters">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("filters.period")}</Label>
          <Select
            value={state.period}
            onValueChange={(v) => {
              const period = v as ReportPeriodId;
              if (period === "specific_day") {
                const selectedDay = todayIso();
                set({ period, customFrom: selectedDay, customTo: selectedDay });
              } else {
                set({ period });
              }
            }}
          >
            <SelectTrigger data-testid="select-report-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_PERIODS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {state.period === "specific_day" && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t("filters.specificDate")}</Label>
            <OperationalDatePicker
              value={state.customFrom}
              onChange={(v) => set({ customFrom: v, customTo: v })}
              data-testid="input-report-specific-day"
            />
          </div>
        )}
        {state.period === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("filters.from")}</Label>
              <OperationalDatePicker
                value={state.customFrom}
                onChange={(v) => set({ customFrom: v })}
                data-testid="input-report-from"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("filters.to")}</Label>
              <OperationalDatePicker
                value={state.customTo}
                onChange={(v) => set({ customTo: v })}
                data-testid="input-report-to"
              />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">{t("filters.treatingDoctor")}</Label>
          <Select
            value={state.treatingDoctor}
            onValueChange={(v) => set({ treatingDoctor: v })}
          >
            <SelectTrigger data-testid="select-report-doctor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.all")}</SelectItem>
              {doctorOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  <span className="notranslate">{d}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("filters.implantSystem")}</Label>
          <Select
            value={state.implantSystem}
            onValueChange={(v) => set({ implantSystem: v })}
          >
            <SelectTrigger data-testid="select-report-system">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.all")}</SelectItem>
              {systemOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="notranslate">{s}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("filters.caseStatus")}</Label>
          <Select
            value={state.caseStatus}
            onValueChange={(v) => set({ caseStatus: v })}
          >
            <SelectTrigger data-testid="select-report-case-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.all")}</SelectItem>
              {CASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="notranslate">{s}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("filters.implantStatus")}</Label>
          <Select
            value={state.implantStatus}
            onValueChange={(v) => set({ implantStatus: v })}
          >
            <SelectTrigger data-testid="select-report-implant-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.all")}</SelectItem>
              {IMPLANT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="notranslate">{s}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
    </div>
  );
}
