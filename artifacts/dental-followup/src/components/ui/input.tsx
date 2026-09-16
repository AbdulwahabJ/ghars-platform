import * as React from 'react';
import { cn } from '@/lib/utils';
import { isNumericCompatibleField, normalizeDigits } from '@/lib/digits';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onChange, value, defaultValue, ...props }, ref) => {
    // Native date inputs render an English "mm/dd/yyyy" skeleton when empty.
    // Tag empty date inputs so CSS (see index.css) can replace that skeleton
    // with an Arabic placeholder, consistently across the whole system.
    const isDate = type === 'date';
    const isControlled = value !== undefined;
    // For uncontrolled date inputs, track emptiness from the DOM value so an
    // entered date is never hidden after blur.
    const [uncontrolledEmpty, setUncontrolledEmpty] = React.useState(
      () => defaultValue === undefined || defaultValue === '',
    );
    const isEmptyDate =
      isDate &&
      (isControlled
        ? value === '' || value === null
        : uncontrolledEmpty);
    const normalizeNumericValue = isNumericCompatibleField({
      type,
      inputMode: props.inputMode,
      name: props.name,
      id: props.id,
      ariaLabel: props['aria-label'],
    });
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      // Native capture handles third-party inputs, while shared Inputs can
      // normalize immediately before invoking the caller's React handler.
      // Do not touch free-text fields: their Arabic/Persian digits are data.
      if (normalizeNumericValue) {
        event.target.value = normalizeDigits(event.target.value);
      }
      if (isDate && !isControlled) {
        setUncontrolledEmpty(event.target.value === '');
      }
      onChange?.(event);
    };
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        data-empty-date={isDate ? (isEmptyDate ? 'true' : 'false') : undefined}
        onChange={handleChange}
        ref={ref}
        value={normalizeNumericValue && typeof value === 'string' ? normalizeDigits(value) : value}
        defaultValue={normalizeNumericValue && typeof defaultValue === 'string' ? normalizeDigits(defaultValue) : defaultValue}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
