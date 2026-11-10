"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { openManualProblemAction } from "@/lib/assessments/actions";

/** Opens a manual problem for a warning and goes to its page. One request at a time. */
export function useOpenProblem(assessmentId: string) {
  const t = useTranslations("assessments");
  const router = useRouter();
  const [pendingRef, setPendingRef] = useState<string | null>(null);

  async function open(ref: string) {
    if (pendingRef) return;
    setPendingRef(ref);
    try {
      const r = await openManualProblemAction({ id: assessmentId, ref });
      if (r.ok) {
        router.push(`/problems/${r.data.problemId}`);
        return;
      }
      if (r.error === "problemExists" && r.problemId) {
        router.push(`/problems/${r.problemId}`);
        return;
      }
      toast.error(t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic"));
    } finally {
      setPendingRef(null);
    }
  }
  return { open, pendingRef };
}
