import { useState } from "react";
import { CalendarDays, Clock3, X } from "lucide-react";
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

const SAUDI_TIMEZONE = "Asia/Riyadh";
const ARABIC_DATE_LOCALE = "ar-SA-u-nu-latn-ca-gregory";

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

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SAUDI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatPlainDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(ARABIC_DATE_LOCALE, {
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
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          dir="rtl"
          aria-invalid={ariaInvalid}
          className={cn(
            "h-8 w-full justify-between gap-2 px-2.5 text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value ? formatPlainDate(value) : placeholder}</span>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-auto p-0"
        dir="rtl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={dateFromIso(value)}
          defaultMonth={dateFromIso(value) ?? new Date()}
          onSelect={(date) => {
            if (!date) return;
            onChange(isoFromDate(date));
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full gap-1 text-xs text-muted-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="h-3 w-3" />
              مسح التاريخ
            </Button>
          </div>
        )}
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
          dir="rtl"
          aria-invalid={ariaInvalid}
          className={cn(
            "h-8 w-full justify-between gap-2 px-2.5 text-sm font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {value ? `${pad(hour12(current.hour))}:${pad(current.minute)} ${current.period}` : placeholder}
          </span>
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[17rem] p-3"
        dir="rtl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          اختر الوقت
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Select dir="rtl" value={String(hour12(current.hour))} onValueChange={(next) => emit(Number(next))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                <SelectItem key={hour} value={String(hour)}>{pad(hour)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select dir="rtl" value={pad(current.minute)} onValueChange={(next) => emit(hour12(current.hour), Number(next))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 60 }, (_, minute) => (
                <SelectItem key={minute} value={pad(minute)}>{pad(minute)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select dir="rtl" value={current.period} onValueChange={(next) => emit(hour12(current.hour), current.minute, next as "ص" | "م")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ص">ص</SelectItem>
              <SelectItem value="م">م</SelectItem>
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
            مسح الوقت
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
}

export function OperationalDateTimeFields({
  value,
  onChange,
  required = false,
  "aria-invalid": ariaInvalid,
  className,
  id,
}: DateTimeFieldsProps) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const fallbackTime = (() => {
    const current = timeParts("");
    return `${pad(current.hour)}:${pad(current.minute)}`;
  })();

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">
          التاريخ {required && <span className="text-destructive">*</span>}
        </Label>
        <OperationalDatePicker
          id={id}
          value={date}
          aria-invalid={ariaInvalid}
          onChange={(nextDate) => onChange(nextDate ? `${nextDate}T${time || fallbackTime}` : "")}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          الوقت {required && <span className="text-destructive">*</span>}
        </Label>
        <OperationalTimePicker
          value={time}
          aria-invalid={ariaInvalid}
          onChange={(nextTime) => onChange(nextTime ? `${date || todayInRiyadh()}T${nextTime}` : "")}
        />
      </div>
    </div>
  );
}