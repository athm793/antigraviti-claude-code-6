import { badgeTones, type BadgeTone } from "./ui";
import type { RunStatus, StepStatus } from "./engine/execute";

/**
 * How a run and its steps are labelled and coloured.
 *
 * One module so the test panel, the run log and the runs list can't drift into
 * calling the same outcome three different things — the words here are what
 * someone uses to decide whether a vendor is worth paying for.
 */

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  success: "Answered",
  partial: "Partly answered",
  miss: "Nobody had it",
  error: "Failed",
};

export const RUN_STATUS_TONES: Record<RunStatus, BadgeTone> = {
  success: "brand",
  partial: "warning",
  // Not an error tone: every provider replied and none of them had the data.
  // That is a normal, expected outcome, and colouring it red trains people to
  // ignore red.
  miss: "neutral",
  error: "danger",
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  success: "Answered",
  miss: "No answer",
  skipped: "Skipped",
  error: "Failed",
  config_missing: "Provider gone",
};

export const STEP_STATUS_TONES: Record<StepStatus, BadgeTone> = {
  success: "brand",
  miss: "neutral",
  skipped: "neutral",
  error: "danger",
  config_missing: "danger",
};

export function toneClass(tone: BadgeTone): string {
  return badgeTones[tone];
}
