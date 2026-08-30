import { useEffect, useRef } from 'react'

import type { Track } from 'livekit-client'

import { useAppStore } from '@/lib/store'

import { useVoiceRoom } from './useVoiceRoom'

/**
 * Plays every remote participant's microphone.
 *
 * This is the only place in the web app that produces sound, and it lives at
 * the app root rather than in `VoicePanel` for two reasons: playback has to
 * survive navigating away from the room, and a second `<audio>` for the same
 * track would play that person twice.
 *
 * There is no element for the local participant. LiveKit's `room.participants`
 * holds only remote peers, so nothing here can echo your own microphone back
 * at you — which is the bug this component's absence used to hide behind.
 */
export function GlobalAudioOutputs() {
  const { participants } = useVoiceRoom()
  const outputVolume = useAppStore((s) => s.outputVolume)

  return (
    <>
      {participants.map((participant) =>
        participant.audioTrack ? (
          <ParticipantAudio
            // Keyed by identity, not track id: a participant who unmutes gets
            // a new publication, and re-keying would tear the element down and
            // rebuild it mid-sentence.
            key={participant.id}
            track={participant.audioTrack}
            volume={outputVolume}
          />
        ) : null,
      )}
    </>
  )
}

/** One remote microphone, wired to one `<audio>` element. */
function ParticipantAudio({ track, volume }: { track: Track; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // `attach` rather than `srcObject = track.mediaStream`: it is what
    // registers the element with the SDK, which is how
    // `switchActiveDevice('audiooutput')` is able to re-route playback later.
    track.attach(element)
    return () => {
      track.detach(element)
    }
  }, [track])

  // Separate from attachment so dragging the volume slider does not detach and
  // re-attach the track on every pixel.
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.volume = Math.min(Math.max(volume, 0), 100) / 100
  }, [volume])

  // `autoPlay` is required — an attached element starts paused otherwise, and
  // this component renders no controls for anyone to press. Never add `muted`:
  // it is the default for video tiles precisely because sound belongs here.
  return <audio ref={ref} autoPlay playsInline />
}
