/**
 * Key formatting shared by the server and the browser.
 *
 * Kept separate from endpointKeys.ts, which imports node:crypto and therefore
 * can't be pulled into a client bundle — while the dashboard still needs to
 * render a key hint.
 */

export const ENDPOINT_KEY_PREFIX = "kp_ep";

/** Display form for a key whose secret we can no longer reveal. */
export function keyHint(keyId: string): string {
  return `${ENDPOINT_KEY_PREFIX}_${keyId}_••••`;
}
