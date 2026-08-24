import { messages as coreMessages } from '@/lib/api'
import type { Uuid } from '@/lib/api'
import type { DebateArgument, PollData } from './types'

/**
 * Backend-for-Frontend (BFF) Experiences API client.
 * Provides typed interaction adapters for interactive features (Polls, Debates, Confessions, Activities).
 */
export const experiencesApi = {
  /** Post a poll response or broadcast vote into the room. */
  votePoll(token: string, roomId: Uuid, pollId: string, optionId: string): Promise<void> {
    return coreMessages
      .post(token, roomId, JSON.stringify({ type: 'poll_vote', pollId, optionId }))
      .then(() => undefined)
  },

  /** Create a new poll in the room. */
  createPoll(token: string, roomId: Uuid, poll: Omit<PollData, 'id' | 'totalVotes'>): Promise<void> {
    return coreMessages
      .post(token, roomId, JSON.stringify({ type: 'poll_create', poll }))
      .then(() => undefined)
  },

  /** Post an anonymous confession into the room. */
  submitConfession(
    token: string,
    roomId: Uuid,
    confession: { content: string; theme: string; tag?: string },
  ): Promise<void> {
    return coreMessages
      .post(token, roomId, JSON.stringify({ type: 'confession_post', ...confession }), true)
      .then(() => undefined)
  },

  /** Submit a debate argument. */
  submitDebateArgument(
    token: string,
    roomId: Uuid,
    argument: Omit<DebateArgument, 'id' | 'upvotes' | 'timestamp'>,
  ): Promise<void> {
    return coreMessages
      .post(token, roomId, JSON.stringify({ type: 'debate_arg', ...argument }))
      .then(() => undefined)
  },
}
