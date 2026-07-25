"use client";

import { useRouter } from "next/navigation";
import { Select } from "./ui/Select";
import { RUN_STATUS_LABELS } from "@/lib/runStatus";

/**
 * Filtering by outcome. Lives in the URL so a filtered view can be shared and
 * survives a reload — and so paging keeps the filter.
 */
export function RunStatusFilter({
  endpointId,
  status,
}: {
  endpointId: string;
  status: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={status}
      onChange={(next) =>
        router.push(
          `/endpoints/${endpointId}/runs${next === "all" ? "" : `?status=${next}`}`
        )
      }
      options={[
        { value: "all", label: "All runs" },
        { value: "success", label: RUN_STATUS_LABELS.success },
        { value: "partial", label: RUN_STATUS_LABELS.partial },
        { value: "miss", label: RUN_STATUS_LABELS.miss },
        { value: "error", label: RUN_STATUS_LABELS.error },
      ]}
      ariaLabel="Filter runs by result"
      className="w-44"
    />
  );
}
