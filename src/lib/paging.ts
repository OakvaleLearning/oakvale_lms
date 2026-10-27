/** Page sizes offered by the "Show N per page" selector on admin tables. */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

type Param = string | string[] | undefined;

/** The requested page and page size from `?page=` and `?limit=`; anything unexpected falls back to the defaults. */
export function readPaging(params: { page?: Param; limit?: Param }) {
  const limit = PAGE_SIZES.find((s) => String(s) === params.limit) ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  return { page, limit };
}

/** A page past the end (e.g. after a search narrows the list) becomes the last page. */
export function clampPage(page: number, total: number, limit: number) {
  return Math.min(page, Math.max(1, Math.ceil(total / limit)));
}

/** Link to a list page, leaving defaults (page 1, the default size, an empty search) out of the URL. */
export function listHref(path: string, { q, page, limit }: { q?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  if (limit && limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(limit));
  return params.size ? `${path}?${params}` : path;
}
