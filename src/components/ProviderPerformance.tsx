import type { EndpointAnalytics } from "@/lib/runAnalytics";
import { formatNumber } from "@/lib/format";
import { Info } from "./ui/Icon";
import {
  cardCls,
  hintCls,
  numericCls,
  tableHeadRowCls,
  tableRowCls,
  tableTdCls,
  tableThCls,
} from "@/lib/ui";

/**
 * Which provider is earning its keep.
 *
 * Two rates, not one, plus a callout saying why. A later step in a waterfall
 * only ever sees the cases every step before it missed, so its hit rate is
 * measured against harder inputs — reporting a single "success rate" column
 * would invite someone to cancel a perfectly good vendor because the number
 * beside it looked low.
 */
export function ProviderPerformance({ analytics }: { analytics: EndpointAnalytics }) {
  const { steps } = analytics;

  function percent(value: number | null): string {
    return value === null ? "—" : `${Math.round(value * 100)}%`;
  }

  function money(cents: number | null): string {
    if (cents === null) return "—";
    return `$${(cents / 100).toFixed(2)}`;
  }

  return (
    <div className={cardCls}>
      <div>
        <h2 className="text-base font-semibold text-white">Which provider is earning its keep</h2>
        <p className={hintCls}>Last {analytics.days} days.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadRowCls}>
              <th scope="col" className={tableThCls}>Step</th>
              <th scope="col" className={`${tableThCls} w-24 text-right`}>Ran</th>
              <th scope="col" className={`${tableThCls} w-28 text-right`}>Hit rate</th>
              <th scope="col" className={`${tableThCls} w-32 text-right`}>Share of answers</th>
              <th scope="col" className={`${tableThCls} w-28 text-right`}>Avg time</th>
              <th scope="col" className={`${tableThCls} w-28 text-right`}>Spent</th>
              <th scope="col" className={`${tableThCls} w-32 text-right`}>Per answer</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.step_key} className={tableRowCls}>
                <td className={tableTdCls}>
                  <span className="text-white">{step.name}</span>
                  <span className="text-[#8b8b9e] text-xs font-mono ml-2">{step.step_key}</span>
                </td>
                <td className={`${tableTdCls} ${numericCls}`}>{formatNumber(step.times_ran)}</td>
                <td className={`${tableTdCls} ${numericCls} text-white`}>
                  {percent(step.hit_rate)}
                </td>
                <td className={`${tableTdCls} ${numericCls} text-white`}>
                  {percent(step.share_of_resolutions)}
                </td>
                <td className={`${tableTdCls} ${numericCls}`}>
                  {step.avg_latency_ms ? `${formatNumber(step.avg_latency_ms)} ms` : "—"}
                </td>
                <td className={`${tableTdCls} ${numericCls}`}>{money(step.cost_cents)}</td>
                <td className={`${tableTdCls} ${numericCls}`}>
                  {money(step.cost_per_resolution_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3">
        <Info className="w-4 h-4 text-[#8b8b9e] shrink-0 mt-0.5" />
        {/*
          Every gap next to a <span> is an explicit {" "}. JSX drops whitespace
          that falls at a line break, which silently glued "Share of answers"
          to the word after it.
        */}
        <p className="text-xs text-[#8b8b9e]">
          <span className="text-[#c8c8d8]">These two rates answer different questions.</span>
          {" "}
          <span className="text-[#c8c8d8]">Hit rate</span>
          {" is of the runs where that step actually ran, which is what to watch for one provider over time. "}
          <span className="text-[#c8c8d8]">Share of answers</span>
          {" is of every run that got an answer at all, which is what tells you what you would lose by dropping it. "}
          {"Don't compare hit rates between steps: a later step only ever sees the cases everything before it missed, so it is being marked on a harder paper."}
        </p>
      </div>
    </div>
  );
}
