/**
 * Deliberately returns the wrong value on the red push, so `appName()`'s test
 * fails on its assertion rather than on a module-resolution error. The green
 * push replaces the return value.
 */
export function appName(): string {
  return "";
}
