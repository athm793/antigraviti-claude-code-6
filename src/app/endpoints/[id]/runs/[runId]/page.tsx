import { notFound } from "next/navigation";
import { authorizeEndpoint } from "@/lib/auth";
import { getRun } from "@/lib/runLog";
import { summariseTrace } from "@/lib/engine/rules";
import {
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  STEP_STATUS_LABELS,
  STEP_STATUS_TONES,
  toneClass,
} from "@/lib/runStatus";
import { formatDateTime, formatNumber } from "@/lib/format";
import { JsonBlock, CodeBlock } from "@/components/ui/CodeBlock";
import { ArrowLeft } from "@/components/ui/Icon";
import {
  backLinkCls,
  badgeBase,
  cardCls,
  hintCls,
  labelCls,
  numericCls,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * One run, step by step.
 *
 * This is where "why did this row come back empty?" gets answered — the
 * condition that failed, the placeholder that had no value, and which provider
 * was asked in what order.
 */
export default async function RunDetail({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const auth = await authorizeEndpoint(id);
  if (!auth.ok) notFound();

  const record = await getRun(id, runId);
  if (!record) notFound();

  const { run, steps } = record;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/endpoints/${id}/runs`} className={backLinkCls}>
          <ArrowLeft className="w-4 h-4" />
          All runs
        </a>
        <span className={`${badgeBase} ${toneClass(RUN_STATUS_TONES[run.status])} w-[7.5rem] justify-center`}>
          {RUN_STATUS_LABELS[run.status]}
        </span>
        <span className="text-[#8b8b9e] text-xs tabular-nums">
          {formatDateTime(run.created_at)} · {formatNumber(run.duration_ms)} ms ·{" "}
          {formatNumber(run.upstream_calls)} upstream call
          {run.upstream_calls === 1 ? "" : "s"}
          {run.cache_hit && " · served from cache"}
        </span>
      </div>

      {run.error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {run.error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <JsonBlock title="Input" value={run.input ?? {}} maxHeight="14rem" />
        {run.output ? (
          <JsonBlock title="Result" value={run.output} maxHeight="14rem" />
        ) : (
          <div className={cardCls}>
            <span className={labelCls}>Result</span>
            <p className={hintCls}>
              Results aren&apos;t stored for this endpoint. They contain the personal data the
              waterfall found — names, emails, phone numbers — so keeping them is opt-in under
              Settings.
            </p>
          </div>
        )}
      </div>

      <div className={cardCls}>
        <div>
          <h2 className="text-base font-semibold text-white">What each step did</h2>
          {run.cache_hit && (
            <p className={hintCls}>
              This run was served from the cache, so no provider was called.
            </p>
          )}
        </div>

        {steps.length === 0 && !run.cache_hit && (
          <p className={hintCls}>No steps were recorded for this run.</p>
        )}

        <div className="flex flex-col gap-3">
          {steps.map((step) => (
            <div
              key={`${step.step_index}-${step.step_key}`}
              className="bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#00C4B4]/15 text-[#00C4B4] text-xs font-bold flex items-center justify-center shrink-0">
                  {step.step_index + 1}
                </span>
                <span className="text-sm text-white truncate min-w-0">
                  {step.config_name ?? step.step_key}
                </span>
                <span className="text-xs text-[#8b8b9e] font-mono">{step.step_key}</span>
                <div className="flex-1" />
                <span className={`text-xs text-[#8b8b9e] w-14 ${numericCls}`}>
                  {step.http_status ?? "—"}
                </span>
                <span className={`text-xs text-[#8b8b9e] w-20 ${numericCls}`}>
                  {step.latency_ms ? `${formatNumber(step.latency_ms)} ms` : "—"}
                </span>
                <span
                  className={`${badgeBase} ${toneClass(STEP_STATUS_TONES[step.status])} w-[7.5rem] justify-center`}
                >
                  {STEP_STATUS_LABELS[step.status]}
                </span>
              </div>

              {step.skip_reason && (
                <p className={hintCls}>{step.skip_reason}</p>
              )}

              {step.attempts > 1 && (
                <p className={hintCls}>
                  Took {step.attempts} attempts
                  {step.keys_exhausted > 0 &&
                    ` — ${step.keys_exhausted} key${step.keys_exhausted === 1 ? "" : "s"} hit their rate limit`}
                </p>
              )}

              {step.trace?.unresolved && step.trace.unresolved.length > 0 && (
                <p className="text-amber-400 text-xs">
                  No value for {step.trace.unresolved.join(", ")} — usually why a field comes back
                  empty.
                </p>
              )}

              {step.trace?.output_fields && step.trace.output_fields.length > 0 && (
                <p className={hintCls}>Kept: {step.trace.output_fields.join(", ")}</p>
              )}

              {step.trace?.error && (
                <p className="text-red-400 text-xs">
                  {step.trace.error.detail ?? step.trace.error.kind}
                </p>
              )}

              {step.trace?.run_condition && (
                <Trace title="Should it run?" lines={summariseTrace(step.trace.run_condition)} />
              )}
              {step.trace?.success_condition && (
                <Trace
                  title="Did it answer?"
                  lines={summariseTrace(step.trace.success_condition)}
                />
              )}

              {step.trace?.request && (
                <p className="text-xs font-mono text-[#8b8b9e] break-all">
                  {step.trace.request.method} {step.trace.request.url}
                </p>
              )}
              {step.trace?.response_preview && (
                <CodeBlock title="Response" code={step.trace.response_preview} maxHeight="14rem" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Trace({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>{title}</span>
      <pre className="text-xs font-mono text-[#c8c8d8] bg-[#111118] border border-[#2a2a38] rounded-lg p-3 overflow-x-auto whitespace-pre">
        {lines.join("\n")}
      </pre>
    </div>
  );
}
