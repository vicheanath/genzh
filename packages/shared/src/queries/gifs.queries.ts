import { useInfiniteQuery } from '@tanstack/react-query'

import { gifs } from '../api/endpoints'
import type { GifPage } from '../api/types'
import { queryKeys } from './keys'

/** Page size the picker asks for. Two or three rows of a grid. */
const PAGE_SIZE = 24

/**
 * Results stay fresh for a while: trending GIFs are not news, and a picker
 * that refetched on every open would spend a round-trip to show the same cats.
 */
const GIF_STALE_TIME = 10 * 60 * 1000

/**
 * One page of GIFs — trending when `query` is empty, a search otherwise.
 *
 * Both cases are the same hook because they are the same list to the picker:
 * it opens on trending, and typing replaces the results in place without the
 * grid unmounting and remounting under the reader.
 *
 * Callers must gate this on `AuthConfig.features.gifs`. Where that is false the
 * endpoint answers 503, and retrying a feature the server does not have is
 * pure noise — hence `retry: false`.
 */
export function useGifSearchInfinite(query: string, enabled = true) {
  const term = query.trim()

  return useInfiniteQuery({
    queryKey: term ? queryKeys.gifs.search(term) : queryKeys.gifs.trending(),
    queryFn: ({ pageParam }) =>
      term
        ? gifs.search(null, term, PAGE_SIZE, pageParam)
        : gifs.trending(null, PAGE_SIZE, pageParam),
    initialPageParam: undefined as string | undefined,
    // Tenor sends an empty cursor at the end, which the API normalises to null.
    getNextPageParam: (lastPage: GifPage) => lastPage.next ?? undefined,
    enabled,
    staleTime: GIF_STALE_TIME,
    retry: false,
    select: (data) => ({
      ...data,
      results: data.pages.flatMap((page) => page.results),
    }),
  })
}
