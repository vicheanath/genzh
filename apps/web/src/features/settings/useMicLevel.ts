import { useEffect, useState } from 'react'

/**
 * Live input level for one microphone, 0–100.
 *
 * Returns 0 while inactive. The previous version of the settings screen faked
 * this with `Math.random()` on an interval, which meant the meter moved
 * convincingly for a microphone that was muted, unplugged, or denied — the one
 * situation the control exists to diagnose.
 *
 * Opens its own capture rather than borrowing the call's: the point is to test
 * a device you have not committed to yet, possibly while not in a room at all.
 */
export function useMicLevel(deviceId: string, active: boolean): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active) {
      setLevel(0)
      return
    }

    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let frame: number | null = null
    let cancelled = false

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        })
      } catch {
        // Permission denied or the device vanished; the meter stays at rest and
        // the surrounding UI explains why.
        return
      }
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop()
        return
      }

      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      context.createMediaStreamSource(stream).connect(analyser)

      const samples = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteTimeDomainData(samples)

        // Root mean square around the 128 midpoint of unsigned 8-bit PCM —
        // the same measure the call's own voice detection uses, so a level that
        // reads as loud here is a level that will trip the speaking ring.
        let sum = 0
        for (const sample of samples) {
          const centred = (sample - 128) / 128
          sum += centred * centred
        }
        const rms = Math.sqrt(sum / samples.length)

        // Speech sits well below full scale, so the bar is scaled to make
        // normal talking fill most of it rather than nudging the left edge.
        setLevel(Math.min(100, Math.round(rms * 320)))
        frame = requestAnimationFrame(tick)
      }

      frame = requestAnimationFrame(tick)
    })()

    return () => {
      cancelled = true
      if (frame !== null) cancelAnimationFrame(frame)
      void context?.close().catch(() => {})
      for (const track of stream?.getTracks() ?? []) track.stop()
      setLevel(0)
    }
  }, [deviceId, active])

  return level
}
