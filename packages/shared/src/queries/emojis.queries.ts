import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { emojis } from '../api/endpoints'
import type { CreateEmojiInput, Uuid } from '../api/types'
import { indexEmoji, type EmojiIndex } from '../chat/customEmoji'
import { queryKeys } from './keys'

/**
 * No token is threaded through these hooks.
 *
 * The API client attaches one from its own interceptor, so a caller only has
 * to decide *whether* to fire — never what to send. Both apps then read the
 * same hook: the web has no token to hand it, and the mobile app should not
 * have to.
 */

/**
 * A community's emoji set changes when somebody edits it, and at no other
 * time — nobody is adding glyphs while you read a room. Refetching on every
 * window focus would be a request per tab switch for an answer that is almost
 * always identical, so it is held until a mutation says otherwise.
 */
const EMOJI_STALE_TIME = 5 * 60 * 1000

/**
 * What may be drawn in this room.
 *
 * The call a chat client makes on open. Rooms outside a community answer with
 * an empty list, so this is safe to call for a direct conversation.
 */
export function useRoomEmojisQuery(roomId: Uuid | null | undefined, enabled = true) {
  return useQuery({
    queryKey: roomId ? queryKeys.emojis.forRoom(roomId) : [...queryKeys.emojis.all, 'idle'],
    queryFn: () => emojis.forRoom(null, roomId!),
    enabled: enabled && Boolean(roomId),
    staleTime: EMOJI_STALE_TIME,
  })
}

/**
 * The same set, as the lookup a renderer needs.
 *
 * Built here rather than in each message row: every row in a transcript needs
 * the same index, and rebuilding a `Map` per row per render is the difference
 * between scrolling smoothly and not.
 */
export function useRoomEmojiIndex(
  roomId: Uuid | null | undefined,
  enabled = true,
): EmojiIndex {
  const { data } = useRoomEmojisQuery(roomId, enabled)
  return useMemo(() => indexEmoji(data ?? []), [data])
}

/** The set a community settings screen manages. */
export function useCommunityEmojisQuery(communityId: Uuid | null | undefined, enabled = true) {
  return useQuery({
    queryKey: communityId
      ? queryKeys.emojis.forCommunity(communityId)
      : [...queryKeys.emojis.all, 'idle'],
    queryFn: () => emojis.list(null, communityId!),
    enabled: enabled && Boolean(communityId),
    staleTime: EMOJI_STALE_TIME,
  })
}

/**
 * Every mutation below invalidates the whole `emojis` tree rather than one key.
 *
 * Deliberate: a room's set is cached per room, and a community has many rooms,
 * so a precise invalidation would have to know which rooms belong to the
 * community that just changed. The tree is a handful of small lists, and this
 * runs when an administrator edits a settings screen — not on a hot path.
 */
function useEmojiInvalidation() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.emojis.all })
}

export function useCreateEmojiMutation(communityId: Uuid | null | undefined) {
  const invalidate = useEmojiInvalidation()

  return useMutation({
    mutationFn: (input: CreateEmojiInput) => {
      if (!communityId) throw new Error('Missing communityId')
      return emojis.create(null, communityId, input)
    },
    onSuccess: invalidate,
  })
}

export function useRenameEmojiMutation(communityId: Uuid | null | undefined) {
  const invalidate = useEmojiInvalidation()

  return useMutation({
    mutationFn: ({ emojiId, name }: { emojiId: Uuid; name: string }) => {
      if (!communityId) throw new Error('Missing communityId')
      return emojis.rename(null, communityId, emojiId, name)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEmojiMutation(communityId: Uuid | null | undefined) {
  const invalidate = useEmojiInvalidation()

  return useMutation({
    mutationFn: (emojiId: Uuid) => {
      if (!communityId) throw new Error('Missing communityId')
      return emojis.remove(null, communityId, emojiId)
    },
    onSuccess: invalidate,
  })
}
