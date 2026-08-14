import { redirect } from "next/navigation";

// Old bonus-pick flow, retired in favor of the redesigned
// /survivor/entries/[id]/bonus route (separate table, week-selector +
// team-select screens). Kept as a redirect so any existing bookmarks/links
// still land somewhere useful.
export default async function LegacyBonusPicksRedirect({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  redirect(`/survivor/entries/${entryId}/bonus`);
}
