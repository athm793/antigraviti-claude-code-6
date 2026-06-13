"use client";

import { useState, useId, cloneElement, isValidElement } from "react";
import { useRouter } from "next/navigation";

export default function NewConfigPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    target_base_url: "",
    auth_header_name: "Authorization",
    auth_header_prefix: "Bearer ",
    rate_limit_codes: "429",
    cooldown_minutes: "0",
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
      const res = await fetch("/api/configs", {
        method: "POST",
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
        setError(data.error ?? "Failed to create config");
        setSaving(false);
        return;
      }

      const config = await res.json();
      router.push(`/configs/${config.id}`);
    } catch {
      setError("Network error — check your connection and try again");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-8">
      <div>
        <a href="/" className="text-[#8b8b9e] hover:text-white text-sm transition-colors min-h-[44px] inline-flex items-center">
          ← Back
        </a>
        <h1 className="text-2xl font-bold text-white mt-3">New Proxy Config</h1>
        <p className="text-[#8b8b9e] text-sm mt-1">
          Configure a target API to proxy. You&apos;ll add API keys after creation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Config Name" hint="e.g. OpenAI Production">
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="My API Rotation"
            className={inputCls}
          />
        </Field>

        <Field label="Target Base URL" hint="The API's base URL — no trailing slash">
          <input
            required
            type="url"
            pattern="https?://.+"
            value={form.target_base_url}
            onChange={(e) => set("target_base_url", e.target.value)}
            placeholder="https://api.openai.com"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Auth Header Name" hint="Header to inject the key into">
            <input
              required
              value={form.auth_header_name}
              onChange={(e) => set("auth_header_name", e.target.value)}
              placeholder="Authorization"
              className={inputCls}
            />
          </Field>

          <Field label="Auth Header Prefix" hint='Include trailing space (e.g. "Bearer ")'>
            <input
              value={form.auth_header_prefix}
              onChange={(e) => set("auth_header_prefix", e.target.value)}
              placeholder="Bearer "
              className={`${inputCls} font-mono`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Rate Limit Status Codes"
            hint="Comma-separated codes that trigger rotation"
          >
            <input
              value={form.rate_limit_codes}
              onChange={(e) => set("rate_limit_codes", e.target.value)}
              placeholder="429, 503"
              className={inputCls}
            />
          </Field>

          <Field
            label="Cooldown Minutes"
            hint="0 = skip exhausted keys forever; >0 = retry after N minutes"
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

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-[#00C4B4] hover:bg-[#00a89a] disabled:opacity-50 text-black font-semibold text-sm px-6 py-3 rounded-lg transition-colors"
        >
          {saving ? "Creating…" : "Create Config →"}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-2.5 min-h-[44px] text-sm text-white placeholder-[#4a4a58] focus:outline-none focus:border-[#00C4B4]/40 transition-colors";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[#c8c8d8]">{label}</label>
      {child}
      {hint && <p className="text-xs text-[#8b8b9e]">{hint}</p>}
    </div>
  );
}
