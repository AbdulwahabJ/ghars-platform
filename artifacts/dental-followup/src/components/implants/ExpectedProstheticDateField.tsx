import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OperationalDatePicker } from "@/components/dashboard/OperationalDatePicker";
import { addMonthsToIsoDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export const EXPECTED_DATE_CUSTOM = "CUSTOM";

const DURATION_OPTIONS = [
  { value: "2M", label: "بعد شهرين", months: 2 },
  { value: "3M", label: "بعد 3 أشهر", months: 3 },
  { value: "4M", label: "بعد 4 أشهر", months: 4 },
  { value: "6M", label: "بعد 6 أشهر", months: 6 },
] as const;

type DurationValue = (typeof DURATION_OPTIONS)[number]["value"] | typeof EXPECTED_DATE_CUSTOM;

function durationForDates(procedureDate: string, expectedDate: string): DurationValue {
  if (!procedureDate || !expectedDate) return EXPECTED_DATE_CUSTOM;
  const matchingOption = DURATION_OPTIONS.find(
    (option) => addMonthsToIsoDate(procedureDate, option.months) === expectedDate,
  );
  return matchingOption?.value ?? EXPECTED_DATE_CUSTOM;
}

function monthsForDuration(duration: DurationValue): number | undefined {
  return DURATION_OPTIONS.find((option) => option.value === duration)?.months;
}

interface ExpectedProstheticDateFieldProps {
  procedureDate: string;
  expectedDate: string;
  onExpectedDateChange: (value: string) => void;
  className?: string;
  compact?: boolean;
  idPrefix?: string;
}

export function ExpectedProstheticDateField({
  procedureDate,
  expectedDate,
  onExpectedDateChange,
  className,
  compact = false,
  idPrefix = "expected-prosthetic",
}: ExpectedProstheticDateFieldProps) {
  const [duration, setDuration] = useState<DurationValue>(() =>
    durationForDates(procedureDate, expectedDate),
  );
  const changeRef = useRef(onExpectedDateChange);

  useEffect(() => {
    changeRef.current = onExpectedDateChange;
  }, [onExpectedDateChange]);

  useEffect(() => {
    const months = monthsForDuration(duration);
    if (!months || !procedureDate) return;

    const calculatedDate = addMonthsToIsoDate(procedureDate, months);
    if (calculatedDate !== expectedDate) {
      changeRef.current(calculatedDate);
    }
  }, [duration, expectedDate, procedureDate]);

  const missingProcedureDate = duration !== EXPECTED_DATE_CUSTOM && !procedureDate;

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 sm:col-span-2", className)}>
      <div className="space-y-1.5">
        <Label>المدة</Label>
        <div
          className={cn(
            "grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-input bg-background p-3",
            compact ? "min-h-8 p-2" : "min-h-[46px] rounded-[10px]",
          )}
          role="group"
          aria-label="مدة التركيب المتوقعة"
          data-testid={`${idPrefix}-duration-options`}
        >
          {DURATION_OPTIONS.map((option) => (
            <label
              key={option.value}
              htmlFor={`${idPrefix}-duration-${option.value}`}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id={`${idPrefix}-duration-${option.value}`}
                checked={duration === option.value}
                onCheckedChange={(checked) => {
                  if (checked) setDuration(option.value);
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
          <label
            htmlFor={`${idPrefix}-duration-custom`}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id={`${idPrefix}-duration-custom`}
              checked={duration === EXPECTED_DATE_CUSTOM}
              onCheckedChange={(checked) => {
                if (checked) setDuration(EXPECTED_DATE_CUSTOM);
              }}
            />
            <span>مخصص</span>
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-date`}>تاريخ التركيب المتوقع</Label>
        <OperationalDatePicker
          id={`${idPrefix}-date`}
          value={expectedDate}
          onChange={(value) => {
            setDuration(EXPECTED_DATE_CUSTOM);
            onExpectedDateChange(value);
          }}
          className={compact ? "h-8" : undefined}
        />
      </div>

      {missingProcedureDate && (
        <p className="sm:col-span-2 text-xs text-destructive" role="alert">
          حدد تاريخ العملية أولًا لحساب تاريخ التركيب المتوقع.
        </p>
      )}
    </div>
  );
}