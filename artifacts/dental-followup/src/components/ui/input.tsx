import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onChange, ...props }, ref) => {
    // Native date inputs render an English "mm/dd/yyyy" skeleton when empty.
    // Tag empty date inputs so CSS (see index.css) can replace that skeleton
    // with an Arabic placeholder, consistently across the whole system.
    const isDate = type === 'date';
    const isControlled = props.value !== undefined;
    // For uncontrolled date inputs, track emptiness from the DOM value so an
    // entered date is never hidden after blur.
    const [uncontrolledEmpty, setUncontrolledEmpty] = React.useState(
      () => props.defaultValue === undefined || props.defaultValue === '',
    );
    const isEmptyDate =
      isDate &&
      (isControlled
        ? props.value === '' || props.value === null
        : uncontrolledEmpty);
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
