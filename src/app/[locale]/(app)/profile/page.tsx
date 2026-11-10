import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProfileForm } from "@/components/auth/profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export default async function ProfilePage({
  params,
}: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations("auth.profile");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[clamp(20px,3vw,26px)] font-bold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={user.name}
            jobTitle={(user as { jobTitle?: string | null }).jobTitle ?? ""}
            email={user.email}
          />
        </CardContent>
      </Card>
    </div>
  );
}
