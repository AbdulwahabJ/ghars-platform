/**
 * Clinical dates must always be chosen explicitly. Defaulting to the entry
 * timestamp can turn historical work documented today into current activity.
 */
export function initialProstheticEventDate(): string {
  return "";
}