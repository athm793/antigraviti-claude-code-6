import { v4 as uuidv4 } from "uuid";
import { getConfig, listKeys } from "./db";
import { executeWithRotation, recoverCooldownKeys } from "./rotation";
import { runEndpoint, type ProviderInfo, type RunResult } from "./engine/execute";
import { createScrubber, scrubValue } from "./redact";
import type { EndpointDefinition, StepDef } from "./endpointTypes";
import type { ProxyConfig } from "./types";

/**
 * The server side of a run: everything the executor deliberately doesn't do.
 *
 * Loads the providers a definition names, hands the executor a `call` that goes
 * through the real key-rotation engine, and scrubs every key out of the result
 * before it can reach a response body or the run log.
 */

/**
 * 50s against Vercel's 60s ceiling. The 10s margin is the point: a deadline we
 * enforce ourselves produces a complete result and a complete log, whereas a
 * platform hard-kill produces neither — precisely when you most want to know
 * what happened.
 */
export const HARD_DEADLINE_MS = 50_000;

/** Cap on a single upstream response we're willing to read into memory. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface RunEndpointOptions {
  definition: EndpointDefinition;
  input: Record<string, unknown>;
  deadlineMs: number;
  includeBodies?: boolean;
  runId?: string;
}

function parseBody(text: string, contentType: string | null): unknown {
  const looksJson =
    (contentType ?? "").includes("json") ||
    /^\s*[[{]/.test(text);
  if (!looksJson) return text;
  try {
    return JSON.parse(text);
  } catch {
    // A provider that promised JSON and sent something else shouldn't kill the
    // run — the text is still usable by conditions and mapping.
    return text;
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of headers.entries()) out[name.toLowerCase()] = value;
  return out;
}

/**
 * Loads every provider a definition references, once.
 *
 * Doing this up front rather than per step means a five-step waterfall costs
 * one round trip per distinct provider, not one per step.
 */
export async function loadProviders(
  definition: EndpointDefinition
): Promise<Map<string, ProxyConfig>> {
  const ids = [
    ...new Set(
      (definition.steps ?? [])
        .filter((s) => s.enabled !== false && s.config_id)
        .map((s) => s.config_id)
    ),
  ];

  const configs = await Promise.all(ids.map((id) => getConfig(id)));
  const map = new Map<string, ProxyConfig>();
  for (const config of configs) {
    if (config) map.set(config.id, config);
  }
  return map;
}

/**
 * Collects every key value in play so the scrubber can catch one echoed back.
 *
 * These never leave this module — they exist only to be *removed* from output.
 */
async function collectSecrets(configs: Iterable<ProxyConfig>): Promise<string[]> {
  const secrets: string[] = [];
  for (const config of configs) {
    secrets.push(config.master_key);
    const keys = await listKeys(config.id);
    for (const key of keys) secrets.push(key.key_value);
  }
  return secrets;
}

export async function executeEndpointRun(
  options: RunEndpointOptions
): Promise<RunResult> {
  const runId = options.runId ?? uuidv4();
  const providers = await loadProviders(options.definition);

  // Cooldown recovery once per provider per run, not once per attempt.
  await Promise.all([...providers.values()].map((config) => recoverCooldownKeys(config)));

  // Keys burned during this run, shared across steps that use the same pool, so
  // a second step can't reselect a key the first one just exhausted.
  const burned = new Map<string, Set<number>>();

  const deadlineAt = Date.now() + Math.min(options.deadlineMs, HARD_DEADLINE_MS);

  const result = await runEndpoint({
    runId,
    definition: options.definition,
    input: options.input,
    deadlineAt,
    includeBodies: options.includeBodies,
    deps: {
      now: () => Date.now(),

      getProvider: (configId): ProviderInfo | null => {
        const config = providers.get(configId);
        if (!config) return null;
        return {
          id: config.id,
          name: config.name,
          auth_header_name: config.auth_header_name,
        };
      },

      call: async (step: StepDef, provider, request, callOptions) => {
        const config = providers.get(provider.id)!;
        if (!burned.has(config.id)) burned.set(config.id, new Set());

        const rotation = await executeWithRotation(config, {
          path: request.path,
          queryString: request.queryString,
          method: step.request.method,
          headers: request.headers,
          body: request.body,
          timeoutMs: callOptions.timeoutMs,
          deadlineAt: callOptions.deadlineAt,
          maxAttempts: callOptions.maxAttempts,
          excludeKeyIds: burned.get(config.id),
          // On for waterfall steps: the target is re-resolved immediately
          // before the fetch, because DNS can be repointed after the provider
          // was saved and this request carries a live key.
          verifyTarget: true,
        });

        if (!rotation.ok || !rotation.response) {
          return {
            ok: false,
            status: null,
            headers: {},
            body: null,
            bodyText: "",
            url: rotation.url,
            attempts: rotation.attempts,
            keysExhausted: rotation.keysExhausted,
            latencyMs: rotation.latencyMs,
            error: rotation.error ?? { kind: "unknown" },
          };
        }

        const response = rotation.response;

        // A redirect is treated as a failure rather than followed: rotation
        // sets redirect:"manual", and chasing a Location the provider chose
        // would send this key somewhere nobody configured.
        if (response.status >= 300 && response.status < 400) {
          void response.body?.cancel().catch(() => {});
          return {
            ok: false,
            status: response.status,
            headers: headersToObject(response.headers),
            body: null,
            bodyText: "",
            url: rotation.url,
            attempts: rotation.attempts,
            keysExhausted: rotation.keysExhausted,
            latencyMs: rotation.latencyMs,
            error: { kind: "redirect", detail: "Provider redirected the request" },
          };
        }

        let text = "";
        try {
          text = await readCapped(response);
        } catch {
          return {
            ok: false,
            status: response.status,
            headers: headersToObject(response.headers),
            body: null,
            bodyText: "",
            url: rotation.url,
            attempts: rotation.attempts,
            keysExhausted: rotation.keysExhausted,
            latencyMs: rotation.latencyMs,
            error: { kind: "body_read_failed", detail: "Could not read the response" },
          };
        }

        return {
          ok: true,
          status: response.status,
          headers: headersToObject(response.headers),
          body: parseBody(text, response.headers.get("content-type")),
          bodyText: text,
          url: rotation.url,
          attempts: rotation.attempts,
          keysExhausted: rotation.keysExhausted,
          latencyMs: rotation.latencyMs,
          error: null,
        };
      },
    },
  });

  // Last line of defence. An upstream that echoes the request headers back, or
  // names the key in an error message, would otherwise put it in the response
  // body and the run log.
  const secrets = await collectSecrets(providers.values());
  const scrub = createScrubber(secrets);
  return scrubValue(result, scrub);
}

/** Reads a response body, refusing to buffer more than the cap. */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Response too large");
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        // A provider streaming an unbounded body must not be able to exhaust
        // the function's memory.
        void reader.cancel().catch(() => {});
        throw new Error("Response too large");
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
