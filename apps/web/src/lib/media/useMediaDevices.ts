import { useCallback, useEffect, useState } from 'react'

export type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput'

export interface MediaDeviceOption {
  deviceId: string
  label: string
}

export interface MediaDeviceList {
  microphones: MediaDeviceOption[]
  cameras: MediaDeviceOption[]
  speakers: MediaDeviceOption[]
  /** False until the user has granted capture permission at least once. */
  labelled: boolean
  /** The browser refused to enumerate, or has no support for it. */
  error: string | null
  refresh: () => void
}

/**
 * Can the page choose which speaker to play through?
 *
 * `setSinkId` is Chromium-only at the time of writing; Firefox and Safari play
 * through the system default and offer no way to change it. Callers use this to
 * hide the control rather than showing one that silently does nothing.
 */
export const canChooseSpeaker =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

const EMPTY: MediaDeviceOption[] = []

/**
 * The capture and playback devices this browser can see.
 *
 * Two things make this less trivial than calling `enumerateDevices`:
 *
 * 1. **Labels are permission-gated.** Before the user has granted microphone or
 *    camera access, every device comes back with an empty `label` — the list is
 *    the right length but unusable as a menu. `labelled` reports that state so
 *    the UI can offer to ask for permission instead of rendering "Device 1".
 * 2. **The list changes.** Plugging in a headset or unplugging a webcam fires
 *    `devicechange`, and a settings screen that enumerated once would go stale
 *    while the user is looking at it.
 */
export function useMediaDevices(): MediaDeviceList {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('This browser cannot list audio and video devices')
      return
    }
    void navigator.mediaDevices
      .enumerateDevices()
      .then((found) => {
        setDevices(found)
        setError(null)
      })
      .catch(() => setError('Could not read your device list'))
  }, [])

  useEffect(() => {
    refresh()

    const target = navigator.mediaDevices
    if (!target?.addEventListener) return

    target.addEventListener('devicechange', refresh)
    return () => target.removeEventListener('devicechange', refresh)
  }, [refresh])

  const of = (kind: DeviceKind): MediaDeviceOption[] =>
    devices
      .filter((device) => device.kind === kind && device.deviceId)
      .map((device, index) => ({
        deviceId: device.deviceId,
        // A blank label means permission has not been granted yet. The index
        // keeps the options distinguishable rather than a row of empties.
        label: device.label || `${labelFor(kind)} ${index + 1}`,
      }))

  const real = devices.filter((device) => device.deviceId)

  return {
    microphones: devices.length ? of('audioinput') : EMPTY,
    cameras: devices.length ? of('videoinput') : EMPTY,
    speakers: devices.length ? of('audiooutput') : EMPTY,
    labelled: real.length > 0 && real.every((device) => device.label !== ''),
    error,
    refresh,
  }
}

function labelFor(kind: DeviceKind): string {
  switch (kind) {
    case 'audioinput':
      return 'Microphone'
    case 'audiooutput':
      return 'Speaker'
    case 'videoinput':
      return 'Camera'
  }
}

/**
 * Ask for capture permission so device labels become readable.
 *
 * The stream is opened and immediately stopped: the only thing wanted here is
 * the permission grant that unlocks the labels in `enumerateDevices`.
 */
export async function requestDeviceLabels(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return true
  } catch {
    return false
  }
}
