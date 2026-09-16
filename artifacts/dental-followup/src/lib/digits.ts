/**
 * Ghars stores numeric-compatible values using ASCII digits.  Keep this
 * conversion deliberately narrow: punctuation, letters, and all other
 * characters must remain untouched.
 */
export function normalizeDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (character) => {
    const codePoint = character.charCodeAt(0);
    const digit = codePoint >= 0x06f0 ? codePoint - 0x06f0 : codePoint - 0x0660;
    return String(digit);
  });
}

// Match complete semantic field names, not arbitrary substrings.  This is
// intentionally conservative: metadata such as `barcodeLabel`, `siteNote`,
// or chart `count` must remain free text.
const numericSemanticNames = new Set([
  'phone', 'mobile', 'tel', 'phonenumber', 'mobilenumber', 'countrycode',
  'filenumber', 'amount', 'discount', 'charge', 'installment', 'payment',
  'paymentamount', 'installmenttotal', 'installmentcount', 'price', 'cost',
  'quantity', 'diameter', 'length', 'width', 'height', 'depth', 'tooth',
  'toothnumber', 'implantsite', 'site', 'pros', 'trial', 'trialhours',
  'duration', 'durationhours', 'hours', 'otp', 'code', 'verificationcode',
  'date', 'time', 'datetime', 'proceduredate', 'expecteddate',
  'prostheticdate', 'appointmentdate', 'contactduedate', 'firstdate',
]);
const numericSemanticSuffixes = [
  'phonenumber', 'mobilenumber', 'filenumber', 'countrycode', 'verificationcode',
  'paymentamount', 'installmentamount', 'installmenttotal', 'installmentcount',
  'trialhours', 'durationhours', 'toothnumber', 'implantsite',
  'amount', 'quantity', 'diameter', 'length', 'width', 'height', 'depth',
  'proceduredate', 'expecteddate', 'prostheticdate', 'appointmentdate',
  'contactduedate',
] as const;

function semanticName(value: string): string {
  // Split camelCase as well as the usual HTML metadata separators.
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('');
}

type NumericInputDescriptor = {
  type?: string;
  inputMode?: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
};

/** Whether input metadata describes a numeric-compatible field. */
export function isNumericCompatibleField({
  type = '',
  inputMode = '',
  name = '',
  id = '',
  ariaLabel = '',
}: NumericInputDescriptor): boolean {
  if (['number', 'date', 'time', 'datetime-local', 'month', 'week'].includes(type.toLowerCase())) {
    return true;
  }
  if (['numeric', 'decimal', 'tel'].includes(inputMode.toLowerCase())) {
    return true;
  }
  return [name, id, ariaLabel].some((value) => {
    const semantic = semanticName(value);
    return numericSemanticNames.has(semantic)
      || numericSemanticSuffixes.some((suffix) => semantic.endsWith(suffix));
  });
}

/** Whether an input is intended to contain a numeric-compatible value. */
export function isNumericCompatibleInput(input: HTMLInputElement): boolean {
  return isNumericCompatibleField({
    type: input.type,
    inputMode: input.inputMode,
    name: input.name,
    id: input.id,
    ariaLabel: input.getAttribute('aria-label') || '',
  });
}

/** Normalize numeric-compatible properties in an object before validation/submission. */
export function normalizeNumericValues<T>(value: T): T {
  return normalizeNumericObject(value) as T;
}

function normalizeNumericObject(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    if (!key) return value;
    const semantic = semanticName(key);
    return numericSemanticNames.has(semantic)
      || numericSemanticSuffixes.some((suffix) => semantic.endsWith(suffix))
      ? normalizeDigits(value)
      : value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeNumericObject(entry));
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        normalizeNumericObject(entry, entryKey),
      ]),
    );
  }
  return value;
}