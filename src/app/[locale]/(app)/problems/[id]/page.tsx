import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { withUser } from "@/db/with-user";
import { ProblemView } from "@/components/problems/page/problem-view";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/problems/schemas";
import { getProblem, getReferenceCatalog } from "@/lib/problems/service";

/**
 * One page per problem: the facts, the obstacles, the corrective actions (the three stages
 * of the method as separate sections) and the change log. An unknown or foreign id is a 404.
 */
export default async function Page({ params }: PageProps<"/[locale]/problems/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) notFound();

  const loaded = await withUser(user.id, async (tx) => {
    const problem = await getProblem(tx, user.id, id);
    if (!problem.ok) return null;
    return { problem: problem.data, catalog: await getReferenceCatalog(tx) };
  });
  if (!loaded) notFound();

  return <ProblemView initial={loaded.problem} catalog={loaded.catalog} />;
}
