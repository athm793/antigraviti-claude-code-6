"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Endpoint } from "@/lib/endpointTypes";
import { normalizeSlug } from "@/lib/slug";
import { Field } from "./ui/Field";
import { Toggle } from "./ui/Toggle";
import { Spinner } from "./ui/Icon";
import {
  btnPrimary,
  cardCls,
  errorBoxCls,
  hintCls,
  inputCls,
  labelCls,
} from "@/lib/ui";

export function EndpointSettingsForm({ endpoint }: { endpoint: Endpoint }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: endpoint.name,
    slug: endpoint.slug,
    description: endpoint.description,
    enabled: endpoint.enabled,
    cache_enabled: endpoint.cache_enabled,
    cache_ttl_seconds: String(endpoint.cache_ttl_seconds),
    log_bodies: endpoint.log_bodies,
    log_retention_days: String(endpoint.log_retention_days),
    rate_limit_per_minute: String(endpoint.rate_limit_per_minute),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch(`/api/endpoints/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cache_ttl_seconds: Number(form.cache_ttl_seconds) || 0,
          log_retention_days: Number(form.log_retention_days) || 30,
          rate_limit_per_minute: Number(form.rate_limit_per_minute) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        setSaving(false);
        return;
      }

      setSaved(true);
      setSaving(false);
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cardCls}>
      <h2 className="text-base font-semibold text-white">Settings</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field
          label="URL name"
          hint="Changing this breaks any tool already calling the old URL"
        >
          <input
            value={form.slug}
            onChange={(e) => set("slug", normalizeSlug(e.target.value))}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </div>

      <Field label="Description">
        <input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="border-t border-[#1a1a28] pt-4 flex flex-col gap-4">
        <SettingRow
          label="Accepting requests"
          hint="Turn off to make the endpoint reject calls without deleting it"
        >
          <Toggle
            checked={form.enabled}
            onChange={(v) => set("enabled", v)}
            label="Accepting requests"
          />
        </SettingRow>

        <SettingRow
          label="Cache results"
          hint="Re-running the same input returns the saved result instead of paying for it again"
        >
          <Toggle
            checked={form.cache_enabled}
            onChange={(v) => set("cache_enabled", v)}
            label="Cache results"
          />
        </SettingRow>

        {form.cache_enabled && (
          <Field
            label="Keep cached results for"
            hint="In seconds. 86400 is one day. Editing any step clears the cache automatically."
          >
            <input
              type="number"
              min={0}
              max={2592000}
              value={form.cache_ttl_seconds}
              onChange={(e) => set("cache_ttl_seconds", e.target.value)}
              className={`${inputCls} max-w-[12rem]`}
            />
          </Field>
        )}

        <Field
          label="Runs allowed per minute, per key"
          hint="Every run buys upstream API calls, so this is a spend limit as much as a traffic one. 0 turns it off."
        >
          <input
            type="number"
            min={0}
            max={10000}
            value={form.rate_limit_per_minute}
            onChange={(e) => set("rate_limit_per_minute", e.target.value)}
            className={`${inputCls} max-w-[12rem]`}
          />
        </Field>
      </div>

      <div className="border-t border-[#1a1a28] pt-4 flex flex-col gap-4">
        <SettingRow
          label="Save request and response bodies"
          hint="Useful for debugging, but these will contain the personal data you send through — names, emails, phone numbers"
        >
          <Toggle
            checked={form.log_bodies}
            onChange={(v) => set("log_bodies", v)}
            label="Save request and response bodies"
          />
        </SettingRow>

        <Field label="Delete run history after" hint="In days">
          <input
            type="number"
            min={1}
            max={365}
            value={form.log_retention_days}
            onChange={(e) => set("log_retention_days", e.target.value)}
            className={`${inputCls} max-w-[12rem]`}
          />
        </Field>
      </div>

      {error && <p className={errorBoxCls}>{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={`${btnPrimary} gap-2 min-w-[9rem]`}
        >
          {saving && <Spinner className="w-4 h-4" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
        {/* Reserved so the confirmation appearing doesn't shift the button. */}
        <span className="text-[#00C4B4] text-sm min-w-[7rem]">
          {saved && !saving ? "Saved" : ""}
        </span>
      </div>
    </form>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className={labelCls}>{label}</div>
        <p className={hintCls}>{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
