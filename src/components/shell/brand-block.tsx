import { useTranslations } from "next-intl";
import { SystemLogo } from "@/components/brand/system-logo";

export function BrandBlock() {
  const t = useTranslations("shell");
  return (
    <div className="flex items-center gap-2.5 px-2 pb-4 pt-0.5">
      <SystemLogo size={38} />
      <div className="min-w-0">
        <p className="text-[14.5px] font-bold leading-snug">{t("brand.name")}</p>
        <p className="text-xs text-muted-foreground">{t("brand.sub")}</p>
      </div>
    </div>
  );
}
