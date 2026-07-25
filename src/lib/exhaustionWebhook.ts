import type { ProxyConfig } from "./types";
import { claimExhaustionNotify, logAudit } from "./db";
import { assertResolvesPublic } from "./validation";
import { logEvent } from "./log";

/**
 * "Every key in this pool is exhausted" is the one condition an operator wants
 * to hear about the moment it happens — it means live traffic is now failing
 * with 503s until keys recover or more are added.
 *
 * Design constraints:
 *  - Fire-and-forget. A slow or dead webhook receiver must never add latency
 *    to (or fail) the request that discovered the exhaustion.
 *  - Debounced through an atomic claim in the database, because the moment a
 *    pool dies EVERY in-flight request discovers it at once — one message per
 *    re-arm window, not one per request.
 *  - The URL is SSRF-checked at save time AND immediately before the POST.
 *    The gap matters: DNS can change between save and send, and this request
 *    originates from inside the deployment.
 *  - The payload carries no secrets — ids, a name, counts and a timestamp.
 */

/** Minutes before another notification may fire for the same provider. */
const DEBOUNCE_MINUTES = 15;

const SEND_TIMEOUT_MS = 5_000;

export interface ExhaustionInfo {
  attempts: number;
  keysExhausted: number;
}

/**
 * Call sites `void` this — it never throws and never blocks the caller.
 */
export async function notifyPoolExhausted(
  config: ProxyConfig,
  info: ExhaustionInfo
): Promise<void> {
  if (!config.webhook_url) return;

  try {
    // Atomic: of all the concurrent requests that just hit the dead pool,
    // exactly one wins this claim and sends.
    const won = await claimExhaustionNotify(config.id, DEBOUNCE_MINUTES);
    if (!won) return;

    const check = await assertResolvesPublic(config.webhook_url);
    if (!check.ok) {
      await logAudit(
        config.id,
        "webhook_blocked",
        `Exhaustion webhook not sent: ${check.message}`
      );
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let ok = false;
    let detail = "";
    try {
      const res = await fetch(config.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "pool_exhausted",
          provider_id: config.id,
          provider_name: config.name,
          attempts: info.attempts,
          keys_exhausted: info.keysExhausted,
          at: new Date().toISOString(),
        }),
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
      ok = res.ok;
      detail = ok
        ? `Exhaustion webhook delivered (HTTP ${res.status})`
        : `Exhaustion webhook got HTTP ${res.status}`;
      void res.body?.cancel().catch(() => {});
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      detail = aborted
        ? `Exhaustion webhook timed out after ${SEND_TIMEOUT_MS}ms`
        : "Exhaustion webhook could not be delivered";
    } finally {
      clearTimeout(timer);
    }

    await logAudit(config.id, ok ? "webhook_sent" : "webhook_failed", detail);
    logEvent(ok ? "info" : "warn", "exhaustion_webhook", {
      config_id: config.id,
      delivered: ok,
      detail,
    });
  } catch {
    // Nothing here may ever propagate into the request that triggered it.
  }
}
