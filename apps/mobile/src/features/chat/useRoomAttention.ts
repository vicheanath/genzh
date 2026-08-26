import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { Uuid } from '@genzh/shared';

import { chatSocket } from '../../lib/socket';

/**
 * Tell the server this room is being *read*, and stop saying so when it is not.
 *
 * The server suppresses notifications for the room on your screen — being told
 * about a message you are watching arrive is the most irritating thing a chat
 * app does — and that is only true while the screen is genuinely in front of
 * somebody. Two things end that on a phone, and neither of them unmounts this
 * screen:
 *
 * - **Navigating away.** A pushed screen stays mounted underneath the one on
 *   top of it, so `useIsFocused` is what says whether it is the one being
 *   looked at.
 * - **Backgrounding the app.** The socket survives it, and a claim left
 *   standing would silence every notification from this conversation until the
 *   server timed it out.
 *
 * The claim is made again on the way back from either.
 */
export function useRoomAttention(roomId: Uuid | null | undefined): void {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!roomId) return;

    if (!isFocused) {
      chatSocket.blur(roomId);
      return;
    }

    const report = () => {
      // 'inactive' is the iOS half-state — the app switcher, a notification
      // shade pulled halfway down — and is treated as gone: whatever is on
      // screen behind it is not being read.
      chatSocket.focus(AppState.currentState === 'active' ? roomId : null);
    };

    report();
    const subscription = AppState.addEventListener('change', report);

    return () => {
      subscription.remove();
      chatSocket.blur(roomId);
    };
  }, [roomId, isFocused]);
}
