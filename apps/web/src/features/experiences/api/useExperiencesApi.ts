import { useMutation } from '@tanstack/react-query'
import { experiencesApi } from './experiencesApi'
import type { DebateArgument, PollData } from './types'
import type { Uuid } from '@/lib/api'

export function useVotePollMutation(token: string | null, roomId: Uuid | null) {
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room')
      return experiencesApi.votePoll(token, roomId, pollId, optionId)
    },
  })
}

export function useCreatePollMutation(token: string | null, roomId: Uuid | null) {
  return useMutation({
    mutationFn: (poll: Omit<PollData, 'id' | 'totalVotes'>) => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room')
      return experiencesApi.createPoll(token, roomId, poll)
    },
  })
}

export function useSubmitConfessionMutation(token: string | null, roomId: Uuid | null) {
  return useMutation({
    mutationFn: (confession: { content: string; theme: string; tag?: string }) => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room')
      return experiencesApi.submitConfession(token, roomId, confession)
    },
  })
}

export function useSubmitDebateArgumentMutation(token: string | null, roomId: Uuid | null) {
  return useMutation({
    mutationFn: (argument: Omit<DebateArgument, 'id' | 'upvotes' | 'timestamp'>) => {
      if (!token || !roomId) throw new Error('Unauthenticated or missing room')
      return experiencesApi.submitDebateArgument(token, roomId, argument)
    },
  })
}
