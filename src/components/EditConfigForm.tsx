"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProxyConfig } from "@/lib/types";

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
  }

  return (
    <div className="bg-[#111118] border border-[#2a2a38] rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Settings</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="bg-[#00C4B4]/10 hover:bg-[#00C4B4]/20 text-[#00C4B4] border border-[#00C4B4]/25 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            Edit Settings
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-[#8b8b9e] text-xs font-medium uppercase tracking-wide">Auth Header</div>
            <code className="text-[#c8c8d8] text-sm">
              {config.auth_header_name}:{" "}
              <span className="text-[#00C4B4]">{config.auth_header_prefix}</span>
              <span className="text-[#8b8b9e]">&lt;key&gt;</span>
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[#8b8b9e] text-xs font-medium uppercase tracking-wide">Rate Limit Codes</div>
            <div className="flex gap-1.5 flex-wrap">
              {config.rate_limit_codes.map((code) => (
                <span
                  key={code}
                  className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2 py-0.5 rounded font-mono"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[#8b8b9e] text-xs font-medium uppercase tracking-wide">Cooldown</div>
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
            <Field label="Config Name">
              <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Target Base URL">
              <input required value={form.target_base_url} onChange={(e) => set("target_base_url", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Auth Header Name">
              <input required value={form.auth_header_name} onChange={(e) => set("auth_header_name", e.target.value)} className={inputCls} />
            </Field>
            <Field label='Auth Header Prefix (e.g. "Bearer ")'>
              <input value={form.auth_header_prefix} onChange={(e) => set("auth_header_prefix", e.target.value)} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Rate Limit Codes (comma-separated)">
              <input value={form.rate_limit_codes} onChange={(e) => set("rate_limit_codes", e.target.value)} placeholder="429, 503" className={inputCls} />
            </Field>
            <Field label="Cooldown Minutes (0 = skip forever)">
              <input type="number" min="0" value={form.cooldown_minutes} onChange={(e) => set("cooldown_minutes", e.target.value)} className={inputCls} />
            </Field>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#00C4B4] hover:bg-[#00a89a] disabled:opacity-50 text-black font-semibold text-sm px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-[#8b8b9e] hover:text-white transition-colors px-5 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#4a4a58] focus:outline-none focus:border-[#00C4B4]/40 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[#c8c8d8]">{label}</label>
      {children}
    </div>
  );
}
