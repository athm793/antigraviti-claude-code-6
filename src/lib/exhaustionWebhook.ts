import { after } from "next/server";
import type { ProxyConfig } from "./types";
import { claimExhaustionNotify, releaseExhaustionNotify, logAudit } from "./db";
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
 * Fire-and-forget from the caller's point of view, but registered with the
 * platform so the work actually finishes.
 *
 * A bare `void promise` on a serverless request path is not a background job:
 * the instance can be frozen or reclaimed once the response is flushed, and
 * everything after the first await — the claim, the DNS check, the POST —
 * simply never runs. `after()` is how Next is told there is outstanding work,
 * and the run route already uses it for exactly this reason.
 *
 * Falls back to a plain call if `after()` is unavailable (a unit test, a
 * non-request context), because a notification that runs synchronously is
 * better than one that throws.
 */
export function notifyPoolExhausted(config: ProxyConfig, info: ExhaustionInfo): void {
  if (!config.webhook_url) return;
  try {
    after(() => sendExhaustionNotice(config, info));
  } catch {
    void sendExhaustionNotice(config, info);
  }
}

async function sendExhaustionNotice(
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
      // Nothing was sent, so give the debounce window back — otherwise a
      // misconfigured URL silences the alert for 15 minutes on top of
      // blocking it.
      await releaseExhaustionNotify(config.id);
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

    // A failed delivery must not hold the window. The claim is taken before
    // the send on purpose — it is what makes a burst of concurrent requests
    // produce exactly one message — but if that one message did not land,
    // the next request should be free to try again rather than waiting out a
    // debounce for a notification nobody received.
    if (!ok) await releaseExhaustionNotify(config.id);

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
