"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { CopyButton } from "@/components/ui/CopyButton";
import { ArrowLeft, ArrowRight, Spinner, AlertTriangle } from "@/components/ui/Icon";
import { normalizeSlug } from "@/lib/slug";
import {
  backLinkCls,
  btnPrimary,
  cardCls,
  errorBoxCls,
  hintCls,
  inputCls,
} from "@/lib/ui";

type Created = {
  id: string;
  name: string;
  slug: string;
  key: { plaintext: string; key_id: string };
};

export default function NewEndpointPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");

  const effectiveSlug = slugTouched ? slug : normalizeSlug(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: effectiveSlug, description }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create endpoint");
        setSaving(false);
        return;
      }

      // Deliberately not redirecting yet: the key is stored hashed and this is
      // the only moment it can ever be shown.
      setCreated((await res.json()) as Created);
      setSaving(false);
    } catch {
      setError("Network error — check your connection and try again");
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            &ldquo;{created.name}&rdquo; created
          </h1>
          <p className="text-[#8b8b9e] text-sm mt-1">
            Copy your key now. Only a one-way hash of it is stored, so this is the only time it can be shown.
          </p>
        </div>

        <div className={cardCls}>
          <div className="flex items-start gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>You won&apos;t be able to see this key again. Save it somewhere safe.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-[#0a0a10] border border-[#2a2a38] rounded-lg px-4 py-3">
            <code className="flex-1 min-w-full sm:min-w-0 text-sm font-mono text-[#c8c8d8] break-all">
              {created.key.plaintext}
            </code>
            <CopyButton value={created.key.plaintext} ariaLabel="Copy endpoint key" />
          </div>

          <p className={hintCls}>
            Send it as an <code className="text-[#00C4B4]">x-endpoint-key</code> header, or
            as <code className="text-[#00C4B4]">Authorization: Bearer</code>. You can
            create more keys, and revoke this one, from the endpoint&apos;s settings.
          </p>
        </div>

        <button
          onClick={() => router.push(`/endpoints/${created.id}`)}
          className={`${btnPrimary} gap-1.5 self-start`}
        >
          I&apos;ve saved it — build the waterfall
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-8">
      <div>
        <a href="/endpoints" className={backLinkCls}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </a>
        <h1 className="text-2xl font-bold text-white mt-3">New endpoint</h1>
        <p className="text-[#8b8b9e] text-sm mt-1">
          You&apos;ll add the steps — which APIs to try, and in what order — next.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Name" hint="What this endpoint is for">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Email finder waterfall"
            className={inputCls}
          />
        </Field>

        <Field
          label="URL name"
          hint={
            <>
              Your endpoint will live at{" "}
              <code className="text-[#00C4B4]">
                /api/run/{effectiveSlug || "your-url-name"}
              </code>
            </>
          }
        >
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(normalizeSlug(e.target.value));
            }}
            placeholder="email-finder"
            className={`${inputCls} font-mono`}
          />
        </Field>

        <Field label="Description" hint="Optional — a note for whoever reads this later">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tries Prospeo, then BetterEnrich, then Hunter"
            className={inputCls}
          />
        </Field>

        {error && <p className={errorBoxCls}>{error}</p>}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className={`${btnPrimary} gap-2 self-start min-w-[11rem]`}
        >
          {saving && <Spinner className="w-4 h-4" />}
          {saving ? "Creating…" : "Create endpoint"}
          {!saving && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
