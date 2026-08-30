/**
 * Voice client factory - creates either LiveKit or custom WebRTC client.
 *
 * This allows switching between implementations based on configuration.
 */

import type { SessionFactory } from './VoiceClient'

// Try to use LiveKit if available, fall back to custom WebRTC
let useLiveKit = false

// Check if we're in a LiveKit environment (can be set via window.__LIVEKIT_ENABLED)
if (typeof window !== 'undefined') {
  useLiveKit = (window as any).__LIVEKIT_ENABLED === true
}

/**
 * Create a voice client - either LiveKit or custom WebRTC based on configuration.
 */
export async function createVoiceClient(sessionFactory: SessionFactory) {
  if (useLiveKit) {
    try {
      const { LiveKitVoiceClient } = await import('./LiveKitVoiceClient')
      return new LiveKitVoiceClient(sessionFactory)
    } catch (error) {
      console.warn('LiveKit not available, falling back to custom WebRTC:', error)
      const { VoiceClient } = await import('./VoiceClient')
      return new VoiceClient(sessionFactory)
    }
  } else {
    const { VoiceClient } = await import('./VoiceClient')
    return new VoiceClient(sessionFactory)
  }
}

/**
 * Enable LiveKit mode (can be called before app startup).
 */
export function enableLiveKit() {
  useLiveKit = true
}

/**
 * Disable LiveKit mode, use custom WebRTC.
 */
export function disableLiveKit() {
  useLiveKit = false
}

/**
 * Check if LiveKit is currently enabled.
 */
export function isLiveKitEnabled(): boolean {
  return useLiveKit
}
