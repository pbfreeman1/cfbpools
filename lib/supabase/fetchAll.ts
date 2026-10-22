// PostgREST caps every response at 1,000 rows no matter what the query asks
// for, and it truncates SILENTLY — no error, just a short result. Any select
// that can legitimately grow past 1,000 rows (all picks, all games, all
// entries across a season) has to be paged, or late-season data quietly
// vanishes from the page. This runs a range-able query repeatedly until a
// short page comes back.
//
// Usage — build the query INSIDE the callback so each page gets a fresh
// builder, and give it a total ordering (e.g. a stable column + `id`) so
// pages never overlap or skip rows:
//
//   const games = await fetchAll<GameRow>((from, to) =>
//     supabase.from("games").select("...").order("id").range(from, to)
//   );

const PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}
