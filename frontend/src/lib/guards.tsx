/**
 * Small runtime type guards.
 *
 * @module
 */

/**
 * Whether a value is a string.
 *
 * @param value - Any value.
 * @returns `true` for strings.
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Whether a value is a non-null object.
 *
 * @param value - Any value.
 * @returns `true` for objects.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
