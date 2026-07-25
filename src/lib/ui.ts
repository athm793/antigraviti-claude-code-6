/**
 * Shared class strings.
 *
 * These were duplicated verbatim across the app — `inputCls` alone appeared in
 * five files, which the README tracked as an open TODO. Composing with
 * template literals matches how the codebase already writes Tailwind, so this
 * stays a set of strings rather than a component wrapper.
 *
 * Palette (hardcoded here, as everywhere else in the app):
 *   page #08080f · card #111118 · inset #0a0a10 · border #2a2a38
 *   hover border #363650 · divider #1a1a28
 *   text white / #c8c8d8 / muted #8b8b9e / placeholder #4a4a58
 *   brand #00C4B4 (hover #00a89a) · danger red-400/500 · warning amber-400/500
 *
 * There is no green: success is brand teal.
 *
 * Every interactive control carries min-h-[44px]. That is a hard rule in this
 * codebase, not a preference — icon buttons take min-w-[44px] too.
 */

export const inputCls =
  "w-full bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2.5 min-h-[44px] text-sm text-white placeholder-[#4a4a58] focus:outline-none focus:border-[#00C4B4]/40 transition-colors";

export const inputInvalidCls =
  "w-full bg-[#0a0a10] border border-red-500/40 rounded-lg px-4 py-2.5 min-h-[44px] text-sm text-white placeholder-[#4a4a58] focus:outline-none focus:border-red-500/60 transition-colors";

export const textareaCls =
  "w-full bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3 text-sm font-mono text-[#c8c8d8] placeholder-[#4a4a58] focus:outline-none focus:border-[#00C4B4]/40 resize-y transition-colors";

export const cardCls =
  "bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4";

export const cardHoverCls =
  "bg-[#111118] border border-[#2a2a38] rounded-xl p-5 flex flex-col gap-4 hover:border-[#363650] transition-colors";

export const insetCls = "bg-[#0a0a10] border border-[#2a2a38] rounded-lg";

/**
 * Every button gets the same three states beyond hover: kp-press (scale on
 * :active, neutralized under reduced motion), a focus-visible outline for
 * keyboard users, and a hover background swap on the icon variants — a
 * control that only changes text colour on hover reads as maybe-disabled.
 *
 * The ring is exported because it belongs on every keyboard-reachable control,
 * not only the ones built from the button tokens below — tabs, nav links,
 * switches and sortable headers compose it directly. Without it they fall back
 * to the browser's own hairline outline, which is invisible on this page.
 */
export const focusRingCls =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C4B4]/60";

export const btnPrimary = `bg-[#00C4B4] hover:bg-[#00a89a] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm px-5 min-h-[44px] rounded-lg transition-colors inline-flex items-center justify-center kp-press ${focusRingCls}`;

export const btnSecondary = `text-sm bg-[#0a0a10] hover:bg-[#15151f] disabled:opacity-50 disabled:cursor-not-allowed text-[#c8c8d8] border border-[#2a2a38] hover:border-[#363650] px-4 min-h-[44px] rounded-lg transition-colors inline-flex items-center justify-center kp-press ${focusRingCls}`;

export const btnDanger = `text-sm bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 border border-red-500/30 px-4 min-h-[44px] rounded-lg transition-colors inline-flex items-center justify-center kp-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60`;

export const btnGhostBrand = `bg-[#00C4B4]/10 hover:bg-[#00C4B4]/20 text-[#00C4B4] border border-[#00C4B4]/25 text-sm font-medium px-4 min-h-[44px] rounded-lg transition-colors inline-flex items-center justify-center kp-press ${focusRingCls}`;

export const btnIcon = `text-[#8b8b9e] hover:text-white hover:bg-[#15151f] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg shrink-0 kp-press ${focusRingCls}`;

export const btnIconDanger = `text-[#8b8b9e] hover:text-red-400 hover:bg-red-500/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg shrink-0 kp-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60`;

export const labelCls = "text-sm font-medium text-[#c8c8d8]";
export const hintCls = "text-xs text-[#8b8b9e]";
export const metaLabelCls =
  "text-[#8b8b9e] text-xs font-medium uppercase tracking-wide";

export const errorBoxCls =
  "text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2";

export const badgeBase =
  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border";

/**
 * Solid fills, deliberately. A status pill exists to be read at a glance, and
 * a low-alpha wash over a dark page reads as "not finished loading" rather
 * than as a state. Text colours are picked for contrast on each solid:
 * black on the brand teal and amber, white on the red, light grey on the
 * neutral slate.
 */
export const badgeTones = {
  brand: "bg-[#00C4B4] text-black border-[#00C4B4] font-semibold",
  danger: "bg-[#dc2626] text-white border-[#dc2626] font-semibold",
  warning: "bg-[#d97706] text-black border-[#d97706] font-semibold",
  neutral: "bg-[#2a2a38] text-[#c8c8d8] border-[#2a2a38]",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export const backLinkCls =
  "text-[#8b8b9e] hover:text-white text-sm transition-colors shrink-0 min-h-[44px] inline-flex items-center gap-1.5";

/**
 * Numeric cells. Tabular figures keep digits the same width, so a counter
 * ticking 999 -> 1,204 doesn't shove the rest of the row sideways.
 */
export const numericCls = "tabular-nums text-right";

export const tableHeadRowCls =
  "border-b border-[#2a2a38] text-[#8b8b9e] text-left";
export const tableThCls = "pb-3 pr-4 font-medium";
export const tableRowCls =
  "border-b border-[#1a1a28] hover:bg-[#0d0d15] transition-colors";
export const tableTdCls = "py-3 pr-4";
