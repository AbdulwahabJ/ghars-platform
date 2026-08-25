import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useClinicalTranslation } from "@/i18n/use-clinical-translation";

interface SearchableComboboxProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  placeholder: string;
  /** Allow saving a value that is not in the suggestions list. */
  allowCustom?: boolean;
  disabled?: boolean;
}

/**
 * Searchable select built from Command + Popover. Options come from the
 * Admin-manageable tables (never hard-coded); when `allowCustom` is on,
 * typing a new value offers a «استخدام» item that saves it as entered.
 */
export function SearchableCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  allowCustom = true,
  disabled,
}: SearchableComboboxProps) {
  const { t } = useClinicalTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = search.trim();
  const showCustom =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const select = (next: string | null) => {
    onChange(next);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-[46px] rounded-[10px]"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {value && !disabled && (
              <X
                className="h-4 w-4 text-muted-foreground hover:text-destructive"
                aria-label={t("implant.clearValue")}
                onClick={(e) => {
                  e.stopPropagation();
                  select(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[--radix-popover-trigger-width] min-w-[200px]"
      >
        <Command shouldFilter>
          <CommandInput
            placeholder={t("implant.searchOrEnter")}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {allowCustom ? t("implant.noResultsCustom") : t("implant.noResults")}
            </CommandEmpty>
            <CommandGroup>
              {showCustom && (
                <CommandItem
                  value={`__custom__${trimmed}`}
                  onSelect={() => select(trimmed)}
                >
                  <Check className="ms-2 h-4 w-4 opacity-0" />
                   {t("implant.useValue", { value: trimmed })}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => select(option)}
                >
                  <Check
                    className={cn(
                      "ms-2 h-4 w-4",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
