"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("shell");
  return (
    <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
      <EmptyState
        icon={TriangleAlert}
        title={t("error.title")}
        text={t("error.text")}
        action={
          <Button className="h-11 rounded-[13px] px-5 text-[15px]" onClick={() => reset()}>
            {t("error.retry")}
          </Button>
        }
      />
    </section>
  );
}
