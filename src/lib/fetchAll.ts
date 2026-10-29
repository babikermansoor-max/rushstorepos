const PAGE = 1000;

/** Fetches every row past the 1000-row API cap by paging with .range(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
