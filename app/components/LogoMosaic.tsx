import { createClient } from "@/lib/supabase/server";

// Fixed placement presets (left%, top%, rotate deg, size rem) hand-tuned to
// bleed off every edge and overlap like a jumbotron collage rather than a
// tidy grid. Two layers cycle through this list at different offsets so
// repeated logos (there are more slots than SEC teams) don't line up.
const PRESETS = [
  { left: -4, top: 4, rotate: -12, size: 8.5 },
  { left: 10, top: 42, rotate: 8, size: 7 },
  { left: 6, top: 78, rotate: -6, size: 9 },
  { left: 22, top: 14, rotate: 15, size: 6 },
  { left: 26, top: 60, rotate: -18, size: 7.5 },
  { left: 38, top: 88, rotate: 10, size: 8 },
  { left: 42, top: 2, rotate: -9, size: 7 },
  { left: 48, top: 34, rotate: 20, size: 9.5 },
  { left: 56, top: 68, rotate: -14, size: 6.5 },
  { left: 64, top: 10, rotate: 6, size: 8 },
  { left: 68, top: 48, rotate: -22, size: 7 },
  { left: 74, top: 84, rotate: 12, size: 9 },
  { left: 82, top: 24, rotate: -8, size: 7.5 },
  { left: 88, top: 58, rotate: 16, size: 8.5 },
  { left: 94, top: 6, rotate: -15, size: 7 },
  { left: 96, top: 76, rotate: 9, size: 8 },
  { left: 14, top: -2, rotate: 22, size: 6.5 },
  { left: 58, top: -4, rotate: -11, size: 7 },
];

function Layer({
  teams,
  offset,
  opacityClass,
  animationClass,
}: {
  teams: { id: string; logo_url: string | null }[];
  offset: number;
  opacityClass: string;
  animationClass: string;
}) {
  return (
    <div className={`absolute inset-y-0 left-0 w-[130%] ${animationClass}`}>
      {teams.map((t, i) => {
        const preset = PRESETS[(i + offset) % PRESETS.length];
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.id}-${offset}-${i}`}
            src={t.logo_url!}
            alt=""
            style={{
              left: `${preset.left}%`,
              top: `${preset.top}%`,
              width: `${preset.size}rem`,
              height: `${preset.size}rem`,
              transform: `rotate(${preset.rotate}deg)`,
            }}
            className={`absolute object-contain ${opacityClass}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Full-bleed collage of real team logos used as the continuous background
 * layer behind the homepage hero (masthead + pool cards). Two layers drift
 * slowly and independently for an ambient "weather moving across a map"
 * effect — disabled entirely under prefers-reduced-motion via Tailwind's
 * motion-safe: variant, no JS required.
 */
export default async function LogoMosaic({ conference }: { conference?: string }) {
  const supabase = await createClient();

  let query = supabase.from("master_teams").select("id, logo_url").not("logo_url", "is", null);
  if (conference) query = query.eq("conference", conference);
  const { data: teams } = await query;

  if (!teams || teams.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <Layer
        teams={teams}
        offset={0}
        opacityClass="opacity-[0.22]"
        animationClass="motion-safe:animate-drift"
      />
      <Layer
        teams={teams}
        offset={Math.ceil(PRESETS.length / 2)}
        opacityClass="opacity-[0.12]"
        animationClass="motion-safe:animate-drift-reverse"
      />
    </div>
  );
}
