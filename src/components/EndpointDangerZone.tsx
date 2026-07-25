"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Endpoint } from "@/lib/endpointTypes";
import { ConfirmModal } from "./ConfirmModal";
import { Trash, Spinner } from "./ui/Icon";
import { btnDanger, errorBoxCls, hintCls } from "@/lib/ui";

export function EndpointDangerZone({ endpoint }: { endpoint: Endpoint }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setConfirmOpen(false);
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/endpoints/${endpoint.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to delete — try again");
        setDeleting(false);
        return;
      }
      router.push("/endpoints");
    } catch {
      setError("Network error — check your connection and try again");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-[#111118] border border-red-500/20 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-white">Delete endpoint</h2>
      <p className={hintCls}>
        Removes the endpoint, its keys, its saved versions and its run history. Anything
        calling this URL will start failing. Your providers and their API keys are not
        affected.
      </p>

      {error && <p className={errorBoxCls}>{error}</p>}

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={deleting}
        className={`${btnDanger} gap-2 self-start min-w-[10rem]`}
      >
        {deleting ? <Spinner className="w-4 h-4" /> : <Trash className="w-4 h-4" />}
        {deleting ? "Deleting…" : "Delete endpoint"}
      </button>

      <ConfirmModal
        open={confirmOpen}
        title="Delete endpoint"
        message={`Delete "${endpoint.name}"? Its keys, versions and run history go with it, and anything calling /api/run/${endpoint.slug} will stop working. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
