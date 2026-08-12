import { createClient } from "@/lib/supabase/server";

/**
 * Faint tiled background of real team logos — used behind homepage pool
 * sections instead of stock photography, since it's the site's own
 * legitimately-displayed data rather than licensed/copyrighted imagery.
 */
export default async function LogoMosaic({ conference }: { conference?: string }) {
  const supabase = await createClient();

  let query = supabase.from("master_teams").select("id, logo_url").not("logo_url", "is", null);
  if (conference) query = query.eq("conference", conference);
  const { data: teams } = await query;

  if (!teams || teams.length === 0) return null;

  // Repeat the set so the tile comfortably fills the section regardless of
  // its size, without needing to know the container's dimensions up front.
  const tiled = [...teams, ...teams, ...teams];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <div className="flex flex-wrap gap-4 p-3 opacity-[0.08]">
        {tiled.map((t, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.id}-${i}`}
            src={t.logo_url!}
            alt=""
            className="h-10 w-10 flex-shrink-0 object-contain"
          />
        ))}
      </div>
    </div>
  );
}
