import type { Instrumentation } from "next";
import { logEvent } from "./lib/log";

/**
 * Error monitoring without the SDK.
 *
 * Next.js calls `onRequestError` for every unhandled server error. When
 * SENTRY_DSN is set, the error is POSTed to that DSN's envelope endpoint —
 * the same wire format the Sentry SDK uses, minus the SDK: no dependency, no
 * build plugin, no bundle weight, and completely inert when the variable is
 * unset. Works with sentry.io or anything speaking the Sentry protocol
 * (GlitchTip, Bugsink, self-hosted).
 *
 * What is sent: error type, message, stack, route, method, status. What is
 * never sent: headers, cookies, bodies, query strings — the request context
 * here routinely contains master keys, endpoint keys and lookup subjects.
 */

export function register(): void {
  // Nothing to initialize — reporting is per-error in onRequestError.
}

type ParsedDsn = { envelopeUrl: string; publicKey: string; dsn: string };

function parseDsn(raw: string): ParsedDsn | null {
  try {
    const url = new URL(raw);
    const projectId = url.pathname.replace(/\/$/, "").split("/").pop();
    if (!url.username || !projectId) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
      dsn: raw,
    };
  } catch {
    return null;
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const raw = process.env.SENTRY_DSN;
  if (!raw) return;
  const dsn = parseDsn(raw);
  if (!dsn) {
    logEvent("warn", "sentry_dsn_invalid", {});
    return;
  }

  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const now = new Date().toISOString();

    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: now,
      platform: "javascript",
      level: "error",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      exception: {
        values: [
          {
            type: error.name || "Error",
            value: error.message,
          },
        ],
      },
      // Path only, never the query string (lookup subjects live there).
      request: {
        url: request.path.split("?")[0],
        method: request.method,
      },
      tags: {
        router: context.routerKind,
        route: context.routePath,
        route_type: context.routeType,
      },
      extra: {
        stack: error.stack ?? null,
      },
    };

    const envelope =
      JSON.stringify({ event_id: event.event_id, sent_at: now, dsn: dsn.dsn }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      await fetch(dsn.envelopeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=keyproxy/1.0`,
        },
        body: envelope,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Monitoring must never take down the thing it monitors.
  }
};
