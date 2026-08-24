import { ChatSocket, type Uuid } from '@genzh/shared';

import { getApiUrl } from '../api/config';

/**
 * The app's one chat socket.
 *
 * A module singleton rather than a value on a context, matching the web app.
 * Presence, notifications and the transcript all need the same connection, and
 * a singleton lets each of them attach a listener without every provider having
 * to be nested inside the chat one.
 */
export const chatSocket = new ChatSocket(getApiUrl());

/** Point the socket at the currently configured API host. */
export function syncSocketBaseUrl(): void {
  chatSocket.setBaseUrl(getApiUrl());
}

/* Typed wrappers for the outbound frames the app sends. The socket exposes a
   generic `send`; naming the frames here keeps the shapes in one place instead
   of spelled out at every call site. */

export function sendMessage(roomId: Uuid, content: string, isAnonymous?: boolean): void {
  chatSocket.send({
    type: 'send_message',
    room_id: roomId,
    content,
    is_anonymous: isAnonymous,
  });
}

export function reactToMessage(roomId: Uuid, messageId: Uuid, reaction: string): void {
  chatSocket.send({ type: 'react', room_id: roomId, message_id: messageId, reaction });
}

export function unreactToMessage(roomId: Uuid, messageId: Uuid, reaction: string): void {
  chatSocket.send({ type: 'unreact', room_id: roomId, message_id: messageId, reaction });
}
