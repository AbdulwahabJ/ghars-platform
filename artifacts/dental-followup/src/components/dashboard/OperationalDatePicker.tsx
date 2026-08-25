import { useState } from "react";
import { CalendarClock, CalendarDays, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const SAUDI_TIMEZONE = "Asia/Riyadh";
const ARABIC_DATE_LOCALE = "ar-SA-u-nu-latn-ca-gregory";

/** Arabic weekday abbreviations — Sunday(0) … Saturday(6) */
const ARABIC_WEEKDAYS = ["ح", "ن", "ث", "ر", "خ", "ج", "س"] as const;
/** Arabic month names */
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/** Shared DayPicker formatters (Arabic weekdays + months). */
const ARABIC_FORMATTERS = {
  formatWeekdayName: (day: Date) => ARABIC_WEEKDAYS[day.getDay()],
  formatMonthDropdown: (date: Date) => ARABIC_MONTHS[date.getMonth()],
};

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-invalid"?: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateFromIso(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function isoFromDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function todayInRiyadh(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SAUDI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatPlainDate(value: string, language: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(language === "ar" ? ARABIC_DATE_LOCALE : "en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function OperationalDatePicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  className,
  id,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const { t, i18n } = useTranslation("guidance");
  const direction = i18n.dir();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          dir={direction}
          aria-invalid={ariaInvalid}
          className={cn(
            "h-8 w-full justify-between gap-2 px-2.5 text-sm font-normal",
            !value && "text-muted-foreground",
            ariaInvalid && "border-destructive text-destructive focus-visible:ring-destructive",
            className,
          )}
        >
          <span className="truncate">{value ? formatPlainDate(value, i18n.language) : placeholder}</span>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-auto p-0"
        dir={direction}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={dateFromIso(value)}
          defaultMonth={dateFromIso(value) ?? new Date()}
          formatters={i18n.language === "ar" ? ARABIC_FORMATTERS : undefined}
          onSelect={(date) => {
            if (!date) return;
            onChange(isoFromDate(date));
            setOpen(false);
          }}
          initialFocus
        />
        <div className="border-t p-2 flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs text-primary hover:text-primary"
            onClick={() => {
              onChange(todayInRiyadh());
              setOpen(false);
            }}
          >
            {t("dashboard.today")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 gap-1 text-xs text-muted-foreground"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <X className="h-3 w-3" />
            {t("dashboard.clear")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function timeParts(value: string): { hour: number; minute: number; period: "ص" | "م" } {
  const match = /(?:T)?(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: SAUDI_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 9);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return { hour, minute, period: hour >= 12 ? "م" : "ص" };
  }
  const hour = Number(match[1]);
  return {
    hour,
    minute: Number(match[2]),
    period: hour >= 12 ? "م" : "ص",
  };
}

function hour12(value: number): number {
  const hour = value % 12;
  return hour === 0 ? 12 : hour;
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-invalid"?: boolean;
}

export function OperationalTimePicker({
  value,
  onChange,
  placeholder = "اختر الوقت",
  className,
  id,
  "aria-invalid": ariaInvalid,
}: TimePickerProps) {
  const { t, i18n } = useTranslation("guidance");
  const direction = i18n.dir();
  const [open, setOpen] = useState(false);
  const current = timeParts(value);
  const emit = (
    nextHour = hour12(current.hour),
    nextMinute = current.minute,
    nextPeriod = current.period,
  ) => {
    const hour24 = nextPeriod === "م" ? (nextHour % 12) + 12 : nextHour % 12;
    onChange(`${pad(hour24)}:${pad(nextMinute)}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          dir={direction}
          aria-invalid={ariaInvalid}
          className={cn(
            "h-8 w-full justify-between gap-2 px-2.5 text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {value ? `${pad(hour12(current.hour))}:${pad(current.minute)} ${current.period === "ص" ? t("dashboard.am") : t("dashboard.pm")}` : placeholder}
          </span>
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[17rem] p-3"
        dir={direction}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Clock3 className="h-3 w-3" />
           {t("dashboard.chooseTime")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Select dir={direction} value={String(hour12(current.hour))} onValueChange={(next) => emit(Number(next))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                <SelectItem key={hour} value={String(hour)}>{pad(hour)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select dir={direction} value={pad(current.minute)} onValueChange={(next) => emit(hour12(current.hour), Number(next))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 60 }, (_, minute) => (
                <SelectItem key={minute} value={pad(minute)}>{pad(minute)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select dir={direction} value={current.period} onValueChange={(next) => emit(hour12(current.hour), current.minute, next as "ص" | "م")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ص">{t("dashboard.am")}</SelectItem>
              <SelectItem value="م">{t("dashboard.pm")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-7 w-full gap-1 text-xs text-muted-foreground"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <X className="h-3 w-3" />
            {t("dashboard.clearTime")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface DateTimeFieldsProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  "aria-invalid"?: boolean;
  className?: string;
  id?: string;
  label?: string;
}

export function OperationalDateTimeFields({
  value,
  onChange,
  required = false,
  "aria-invalid": ariaInvalid,
  className,
  id,
  label,
}: DateTimeFieldsProps) {
  const { t, i18n } = useTranslation("guidance");
  const direction = i18n.dir();
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const [open, setOpen] = useState(false);
  const fallbackTime = (() => {
    const current = timeParts("");
    return `${pad(current.hour)}:${pad(current.minute)}`;
  })();
  const current = timeParts(time);

  const updateTime = (
    nextHour = hour12(current.hour),
    nextMinute = current.minute,
    nextPeriod = current.period,
  ) => {
    const hour24 = nextPeriod === "م" ? (nextHour % 12) + 12 : nextHour % 12;
    const nextDate = date || todayInRiyadh();
    onChange(`${nextDate}T${pad(hour24)}:${pad(nextMinute)}`);
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs">
        {label ?? t("dashboard.dateTime")} {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            dir={direction}
            aria-invalid={ariaInvalid}
            className={cn(
              "h-8 w-full justify-between gap-2 px-2.5 text-sm font-normal",
              !date && "text-muted-foreground",
              ariaInvalid && "border-destructive text-destructive focus-visible:ring-destructive",
            )}
          >
            <span className="truncate">
              {date ? formatPlainDate(date, i18n.language) : t("dashboard.chooseDate")}
              {time && ` — ${pad(hour12(current.hour))}:${pad(current.minute)} ${current.period === "ص" ? t("dashboard.am") : t("dashboard.pm")}`}
            </span>
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-[19rem] p-0"
          dir={direction}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={dateFromIso(date)}
            defaultMonth={dateFromIso(date) ?? new Date()}
            formatters={i18n.language === "ar" ? ARABIC_FORMATTERS : undefined}
            onSelect={(nextDate) => {
              if (!nextDate) return;
              onChange(`${isoFromDate(nextDate)}T${time || fallbackTime}`);
            }}
            initialFocus
          />

          {/* اليوم shortcut */}
          <div className="border-t p-2 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-xs text-primary hover:text-primary"
              onClick={() => {
                const today = todayInRiyadh();
                onChange(`${today}T${time || fallbackTime}`);
                setOpen(false);
              }}
            >
              {t("dashboard.today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 gap-1 text-xs text-muted-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="h-3 w-3" />
              {t("dashboard.clear")}
            </Button>
          </div>

          <div className="border-t p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              {t("dashboard.time")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Select
                dir={direction}
                value={String(hour12(current.hour))}
                onValueChange={(next) => updateTime(Number(next))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>{pad(hour)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                dir={direction}
                value={pad(current.minute)}
                onValueChange={(next) => updateTime(hour12(current.hour), Number(next))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, minute) => (
                    <SelectItem key={minute} value={pad(minute)}>{pad(minute)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                dir={direction}
                value={current.period}
                onValueChange={(next) => updateTime(hour12(current.hour), current.minute, next as "ص" | "م")}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ص">{t("dashboard.am")}</SelectItem>
                  <SelectItem value="م">{t("dashboard.pm")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
