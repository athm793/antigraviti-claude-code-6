"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProxyConfig } from "@/lib/types";
import { Field } from "./ui/Field";
import { Spinner } from "./ui/Icon";
import {
  btnGhostBrand,
  btnPrimary,
  cardCls,
  errorBoxCls,
  inputCls,
  metaLabelCls,
} from "@/lib/ui";

export function EditConfigForm({ config }: { config: ProxyConfig }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: config.name,
    target_base_url: config.target_base_url,
    auth_header_name: config.auth_header_name,
    auth_header_prefix: config.auth_header_prefix,
    rate_limit_codes: config.rate_limit_codes.join(", "),
    cooldown_minutes: String(config.cooldown_minutes),
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const rateLimitCodes = form.rate_limit_codes
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    try {
      const res = await fetch(`/api/configs/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          target_base_url: form.target_base_url,
          auth_header_name: form.auth_header_name,
          auth_header_prefix: form.auth_header_prefix,
          rate_limit_codes: rateLimitCodes,
          cooldown_minutes: parseInt(form.cooldown_minutes, 10) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        setSaving(false);
        return;
      }

      setSaving(false);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
      setSaving(false);
    }
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Settings</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className={btnGhostBrand}>
            Edit settings
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <div className={metaLabelCls}>Auth header</div>
            <code className="text-[#c8c8d8] text-sm">
              {config.auth_header_name}:{" "}
              <span className="text-[#00C4B4]">{config.auth_header_prefix}</span>
              <span className="text-[#8b8b9e]">&lt;key&gt;</span>
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <div className={metaLabelCls}>Rate limit codes</div>
            <div className="flex gap-1.5 flex-wrap">
              {config.rate_limit_codes.map((code) => (
                <span
                  key={code}
                  className="bg-[#dc2626] text-white text-xs px-2 py-0.5 rounded font-mono font-semibold"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className={metaLabelCls}>Cooldown</div>
            <div className="text-[#c8c8d8] text-sm">
              {config.cooldown_minutes === 0
                ? "Skip forever (no retry)"
                : `${config.cooldown_minutes} min cooldown then retry`}
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Provider name" hint="A name to help you recognise this provider">
              <input
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Target base URL" hint="The API's base URL — no trailing slash">
              <input
                required
                type="url"
                pattern="https?://.+"
                value={form.target_base_url}
                onChange={(e) => set("target_base_url", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Auth header name" hint="Header to inject the key into">
              <input
                required
                value={form.auth_header_name}
                onChange={(e) => set("auth_header_name", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Auth header prefix" hint='Include trailing space (e.g. "Bearer ")'>
              <input
                value={form.auth_header_prefix}
                onChange={(e) => set("auth_header_prefix", e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <Field
              label="Rate limit status codes"
              hint="Comma-separated 4xx/5xx codes that trigger rotation"
            >
              <input
                value={form.rate_limit_codes}
                onChange={(e) => set("rate_limit_codes", e.target.value)}
                placeholder="429, 503"
                className={inputCls}
              />
            </Field>
            <Field
              label="Cooldown minutes"
              hint="0 = skip exhausted keys forever; above 0 = retry after N minutes"
            >
              <input
                type="number"
                min="0"
                value={form.cooldown_minutes}
                onChange={(e) => set("cooldown_minutes", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {error && <p className={errorBoxCls}>{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className={`${btnPrimary} gap-2 min-w-[9rem]`}
            >
              {saving && <Spinner className="w-4 h-4" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-[#8b8b9e] hover:text-white transition-colors px-5 min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
