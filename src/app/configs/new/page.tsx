"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { ArrowLeft, ArrowRight, Spinner } from "@/components/ui/Icon";
import { backLinkCls, btnPrimary, errorBoxCls, inputCls } from "@/lib/ui";

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
        <a href="/" className={backLinkCls}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </a>
        <h1 className="text-2xl font-bold text-white mt-3">New provider</h1>
        <p className="text-[#8b8b9e] text-sm mt-1">
          Configure a target API to proxy. You&apos;ll add API keys after creation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Provider name" hint="e.g. OpenAI production">
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="OpenAI personalisation"
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
            placeholder="https://api.openai.com"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Auth header name" hint="Header to inject the key into">
            <input
              required
              value={form.auth_header_name}
              onChange={(e) => set("auth_header_name", e.target.value)}
              placeholder="Authorization"
              className={inputCls}
            />
          </Field>

          <Field label="Auth header prefix" hint='Include trailing space (e.g. "Bearer ")'>
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

        <button
          type="submit"
          disabled={saving}
          className={`${btnPrimary} gap-2 self-start min-w-[11rem]`}
        >
          {saving && <Spinner className="w-4 h-4" />}
          {saving ? "Creating…" : "Create provider"}
          {!saving && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
