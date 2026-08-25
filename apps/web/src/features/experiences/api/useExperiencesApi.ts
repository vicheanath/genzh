import { useMutation } from '@tanstack/react-query'

import { messages } from '@/lib/api'

import type { DebateArgument, PollData, Uuid } from './types'

/**
 * The interactive experiences ride on ordinary room messages.
 *
 * Each one posts a JSON envelope the room's renderer understands, so a poll or
 * a confession is a message like any other — it pages, it persists, and it
 * arrives over the same socket rather than needing a channel of its own.
 */
function postEnvelope(roomId: Uuid, envelope: object, anonymous?: boolean) {
  return messages.post(null, roomId, JSON.stringify(envelope), anonymous).then(() => undefined)
}

export function useVotePollMutation(roomId: Uuid | null | undefined) {
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      postEnvelope(roomId!, { type: 'poll_vote', pollId, optionId }),
  })
}

export function useCreatePollMutation(roomId: Uuid | null | undefined) {
  return useMutation({
    mutationFn: (poll: Omit<PollData, 'id' | 'totalVotes'>) =>
      postEnvelope(roomId!, { type: 'poll_create', poll }),
  })
}

export function useSubmitConfessionMutation(roomId: Uuid | null | undefined) {
  return useMutation({
    mutationFn: (confession: { content: string; theme: string; tag?: string }) =>
      postEnvelope(roomId!, { type: 'confession_post', ...confession }, true),
  })
}

export function useSubmitDebateArgumentMutation(roomId: Uuid | null | undefined) {
  return useMutation({
    mutationFn: (argument: Omit<DebateArgument, 'id' | 'upvotes' | 'timestamp'>) =>
      postEnvelope(roomId!, { type: 'debate_arg', ...argument }),
  })
}
