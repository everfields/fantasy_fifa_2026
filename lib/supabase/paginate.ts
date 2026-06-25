/**
 * Fetch ALL rows from a PostgREST query, transparently paging past the server's
 * default 1000-row ceiling.
 *
 * PostgREST caps every single response at `max-rows` (1000 on Supabase): an
 * unbounded `.select("*")` SILENTLY returns only the first 1000 rows. With the
 * pool's `predictions` table past 1000 rows this truncated every aggregate read
 * — the live meta-volante board under-counted points (a player's later
 * predictions fell in the dropped tail), and both the manual recalc and the
 * round-award settlement examined an incomplete set. See ADR-0021.
 *
 * Pass a FACTORY, not a query: a PostgREST builder is single-use once it is
 * ranged/awaited, so each page needs a fresh one. We page with `.range()` until
 * a short page (< pageSize) signals the end.
 */
type RangeableQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

export async function selectAll<T>(
  makeQuery: () => RangeableQuery<T>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
