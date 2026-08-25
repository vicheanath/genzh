import type { InfiniteData, QueryClient } from '@tanstack/react-query'

import { chatKeys } from './useChatApi'
import type { Message, MessagePage, ReactionSummary, RoomAnonymousIdentity, Uuid } from './types'

type Transcript = InfiniteData<MessagePage, unknown>

/**
 * Combine two message lists, newest state winning, ordered by time.
 *
 * Pages overlap and realtime events re-deliver, so a naive concatenation would
 * duplicate. Keying by id makes the merge idempotent; ties on `created_at` fall
 * back to the id so the order matches the server's `(created_at, id)` sort
 * rather than depending on which page happened to arrive first.
 */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map(existing.map((message) => [message.id, message]))

  for (const message of incoming) {
    const previous = byId.get(message.id)
    byId.set(message.id, {
      ...message,
      // An API older than inline reaction tallies omits the field entirely.
      // Defaulting keeps a stale server from blanking the transcript on `.length`.
      reactions: message.reactions ?? previous?.reactions ?? [],
    })
  }

  return [...byId.values()].sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at)
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
  })
}

/**
 * Write into a room's transcript without disturbing its paging.
 *
 * Every realtime edit lands on page 0 — the newest page — because that is the
 * one the cursor chain hangs off. Rewriting a middle page would be correct for
 * the data and wrong for `next_before`.
 */
function editTranscript(
  queryClient: QueryClient,
  roomId: Uuid,
  edit: (messages: Message[]) => Message[],
): void {
  queryClient.setQueryData<Transcript>(chatKeys.messages(roomId), (cached) => {
    const newest = cached?.pages[0]
    if (!cached || !newest) return cached
    return {
      ...cached,
      pages: [{ ...newest, messages: edit(newest.messages) }, ...cached.pages.slice(1)],
    }
  })
}

/** A message arrived. Idempotent: the sender's own echo is not a duplicate. */
export function applyMessageCreated(
  queryClient: QueryClient,
  roomId: Uuid,
  message: Message,
  reactions: ReactionSummary[] = [],
  anonymousAuthor?: RoomAnonymousIdentity,
): void {
  editTranscript(queryClient, roomId, (messages) => {
    const withoutIt = messages.filter((existing) => existing.id !== message.id)
    // Pages are newest-first on the wire, so the new one goes at the front.
    return [
      {
        ...message,
        reactions: message.reactions ?? reactions,
        anonymous_author: message.anonymous_author ?? anonymousAuthor,
      },
      ...withoutIt,
    ]
  })
}

/** A message was edited. Ignored when the room is not in cache. */
export function applyMessageUpdated(
  queryClient: QueryClient,
  roomId: Uuid,
  message: Message,
  reactions: ReactionSummary[] = [],
  anonymousAuthor?: RoomAnonymousIdentity,
): void {
  editTranscript(queryClient, roomId, (messages) =>
    messages.map((existing) =>
      existing.id === message.id
        ? {
            ...message,
            reactions: message.reactions ?? reactions ?? existing.reactions,
            anonymous_author:
              message.anonymous_author ?? anonymousAuthor ?? existing.anonymous_author,
          }
        : existing,
    ),
  )
}

/**
 * A message was deleted — dropped from every page, not just the newest.
 *
 * Returns what it removed, so a caller deleting optimistically has the row in
 * hand to put back if the request fails, without having to hold the whole
 * transcript in its dependencies to find it.
 */
export function applyMessageDeleted(
  queryClient: QueryClient,
  roomId: Uuid,
  messageId: Uuid,
): Message | undefined {
  let removed: Message | undefined

  queryClient.setQueryData<Transcript>(chatKeys.messages(roomId), (cached) => {
    if (!cached) return cached
    return {
      ...cached,
      pages: cached.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((message) => {
          if (message.id !== messageId) return true
          removed = message
          return false
        }),
      })),
    }
  })

  return removed
}

/**
 * A reaction tally changed. Applies across pages: the message may be old.
 *
 * The broadcast is the same for everyone in the room, so it carries counts but
 * no `me` — whether *you* reacted is not a property of the room's state. That
 * flag is preserved from what is already cached; taking the frame at face value
 * would un-highlight your own reaction every time somebody else added theirs.
 */
export function applyReactionsUpdated(
  queryClient: QueryClient,
  roomId: Uuid,
  messageId: Uuid,
  reactions: ReactionSummary[],
): void {
  queryClient.setQueryData<Transcript>(chatKeys.messages(roomId), (cached) => {
    if (!cached) return cached
    return {
      ...cached,
      pages: cached.pages.map((page) => ({
        ...page,
        messages: page.messages.map((message) => {
          if (message.id !== messageId) return message
          const mine = new Set(
            message.reactions.filter((entry) => entry.me).map((entry) => entry.reaction),
          )
          return {
            ...message,
            reactions: (reactions ?? []).map((entry) => ({
              ...entry,
              me: mine.has(entry.reaction),
            })),
          }
        }),
      })),
    }
  })
}

/**
 * Toggle your own reaction before the server has answered.
 *
 * A reaction that waits for a round trip feels broken, and the server's tally
 * overwrites this a moment later either way. Kept here rather than in the view
 * so the optimistic write and the broadcast that replaces it agree about the
 * shape they are both editing.
 */
export function applyLocalReaction(
  queryClient: QueryClient,
  roomId: Uuid,
  messageId: Uuid,
  emoji: string,
  add: boolean,
): void {
  queryClient.setQueryData<Transcript>(chatKeys.messages(roomId), (cached) => {
    if (!cached) return cached
    return {
      ...cached,
      pages: cached.pages.map((page) => ({
        ...page,
        messages: page.messages.map((message) =>
          message.id === messageId
            ? { ...message, reactions: toggleReaction(message.reactions, emoji, add) }
            : message,
        ),
      })),
    }
  })
}

function toggleReaction(
  reactions: ReactionSummary[],
  emoji: string,
  add: boolean,
): ReactionSummary[] {
  const existing = reactions.find((reaction) => reaction.reaction === emoji)

  if (!existing) {
    return add ? [...reactions, { reaction: emoji, count: 1, me: true }] : reactions
  }

  const count = existing.count + (add ? 1 : -1)
  if (count <= 0) return reactions.filter((reaction) => reaction.reaction !== emoji)

  return reactions.map((reaction) =>
    reaction.reaction === emoji ? { ...reaction, count, me: add } : reaction,
  )
}
