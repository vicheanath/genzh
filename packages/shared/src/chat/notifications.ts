import type { NotificationKind } from '../api/types'

/**
 * What a notification row says.
 *
 * Shared by both apps because a notification means the same thing wherever it
 * is rendered, and the two used to keep their own copies of these sentences —
 * which is fine right up until one of them learns something the other has not.
 *
 * One row can stand for several messages: the server folds everything one
 * person said in one room since you last looked into a single notification, so
 * the line has to be able to say "sent you 5 messages" as well as "sent you a
 * message". Nothing else the count could do would be honest — five rows saying
 * the same thing is what this replaced.
 */
export function describeNotification(
  kind: NotificationKind,
  actor: string,
  count = 1,
): string {
  const many = count > 1

  switch (kind) {
    case 'mention':
      return many ? `${actor} mentioned you ${count} times` : `${actor} mentioned you`
    case 'everyone':
      return many
        ? `${actor} sent ${count} messages to everyone`
        : `${actor} notified everyone`
    case 'direct_message':
      return many
        ? `${actor} sent you ${count} messages`
        : `${actor} sent you a message`
    case 'friend_request':
      return `${actor} wants to be friends`
    case 'friend_accepted':
      return `${actor} accepted your friend request`
  }
}
