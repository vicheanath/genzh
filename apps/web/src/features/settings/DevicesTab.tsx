import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { MicIcon, VideoIcon, VideoOffIcon } from '@/components/Icons'
import { Select, type SelectOption } from '@/components/Select'
import { Slider } from '@/components/Slider'
import { Meter } from '@/components/Meter'
import {
  canChooseSpeaker,
  requestDeviceLabels,
  useMediaDevices,
  type MediaDeviceOption,
} from '@/lib/media'
import { useAppStore } from '@/lib/store'

import { useMicLevel } from './useMicLevel'
import styles from './settings.module.css'

/** The value used for "whatever the system picks". */
const SYSTEM_DEFAULT = 'default:system'

export function DevicesTab() {
  const devices = useMediaDevices()

  const micDeviceId = useAppStore((s) => s.micDeviceId)
  const cameraDeviceId = useAppStore((s) => s.cameraDeviceId)
  const speakerDeviceId = useAppStore((s) => s.speakerDeviceId)
  const outputVolume = useAppStore((s) => s.outputVolume)
  const setDevicePreferences = useAppStore((s) => s.setDevicePreferences)

  const [testingMic, setTestingMic] = useState(false)
  const [previewingCamera, setPreviewingCamera] = useState(false)
  const micLevel = useMicLevel(micDeviceId, testingMic)

  // Stop both previews when the tab unmounts, so a camera light does not stay
  // on because the modal was closed mid-test.
  useEffect(
    () => () => {
      setTestingMic(false)
      setPreviewingCamera(false)
    },
    [],
  )

  return (
    <div>
      <h2 className={styles.panelTitle}>Voice &amp; video</h2>
      <p className={styles.panelDescription}>
        Choose which devices calls use. Changes apply immediately, including to a call
        you are already in.
      </p>

      {devices.error && <Callout tone="danger">{devices.error}</Callout>}

      {!devices.labelled && (
        <Callout tone="info">
          <div className={styles.permissionRow}>
            <span>
              Your browser hides device names until you allow access once.
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void requestDeviceLabels().then(devices.refresh)}
            >
              Show device names
            </Button>
          </div>
        </Callout>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Microphone</h3>
        <DevicePicker
          label="Input device"
          options={devices.microphones}
          value={micDeviceId}
          onChange={(micId) => setDevicePreferences({ micDeviceId: micId })}
        />

        <div className={styles.testRow}>
          <Button
            size="sm"
            variant={testingMic ? 'primary' : 'secondary'}
            onClick={() => setTestingMic((on) => !on)}
          >
            <MicIcon size={14} />
            {testingMic ? 'Stop test' : 'Test microphone'}
          </Button>
          <span className={styles.accountKey}>
            {testingMic ? 'Say something — the bar should move.' : 'Check it before you join.'}
          </span>
        </div>

        {/* A meter rather than a progress bar, and the segmented variant
            because a level that goes up and down reads as lamps lighting
            rather than as a task filling. The hand-rolled version had the
            right `role` but set the ARIA values on a div while the visible
            fill was a second element with an inline width — two sources for
            one number. */}
        <Meter
          value={micLevel}
          variant="segments"
          aria-label="Microphone level"
          tone={testingMic ? 'live' : 'muted'}
          className={styles.voiceTestMeter}
        />
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Camera</h3>
        <DevicePicker
          label="Video device"
          options={devices.cameras}
          value={cameraDeviceId}
          onChange={(cameraId) => setDevicePreferences({ cameraDeviceId: cameraId })}
        />

        <div className={styles.testRow}>
          <Button
            size="sm"
            variant={previewingCamera ? 'primary' : 'secondary'}
            onClick={() => setPreviewingCamera((on) => !on)}
          >
            {previewingCamera ? <VideoOffIcon size={14} /> : <VideoIcon size={14} />}
            {previewingCamera ? 'Stop preview' : 'Preview camera'}
          </Button>
        </div>

        {previewingCamera && <CameraPreview deviceId={cameraDeviceId} />}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Output</h3>

        {canChooseSpeaker ? (
          <DevicePicker
            label="Speaker"
            options={devices.speakers}
            value={speakerDeviceId}
            onChange={(speakerId) => setDevicePreferences({ speakerDeviceId: speakerId })}
          />
        ) : (
          // Rendering a picker that cannot do anything is worse than not
          // offering one: Firefox and Safari have no `setSinkId`.
          <p className={styles.accountKey}>
            This browser always plays through your system&apos;s default output. Change it
            in your operating system&apos;s sound settings.
          </p>
        )}

        <div className={styles.sliderField}>
          <div className={styles.labelRow}>
            <span className={styles.fieldLabel}>Output volume</span>
            <span className={styles.accountKey}>{outputVolume}%</span>
          </div>
          <Slider
            value={[outputVolume]}
            onValueChange={(value) =>
              setDevicePreferences({
                outputVolume: Array.isArray(value) ? (value[0] ?? 100) : value,
              })
            }
            max={100}
            step={1}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * One device dropdown.
 *
 * The stored value is '' for "system default"; the select needs a real option
 * value, so the two are mapped at this boundary rather than putting a sentinel
 * into everything downstream that reads the preference.
 */
function DevicePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: MediaDeviceOption[]
  value: string
  onChange: (deviceId: string) => void
}) {
  const items: SelectOption<string>[] = [
    { value: SYSTEM_DEFAULT, label: 'System default' },
    ...options.map((device) => ({ value: device.deviceId, label: device.label })),
  ]

  // A saved device that is no longer present — the headset it named has been
  // unplugged. Say so rather than silently showing "System default", because
  // calls really will fall back to the default until this is changed.
  const missing = value !== '' && !options.some((device) => device.deviceId === value)
  if (missing) {
    items.push({ value, label: 'Previously selected device (not connected)' })
  }

  return (
    <div className={styles.sliderField}>
      <span className={styles.fieldLabel}>{label}</span>
      <Select
        aria-label={label}
        value={value === '' ? SYSTEM_DEFAULT : value}
        options={items}
        onValueChange={(next) => onChange(next === SYSTEM_DEFAULT ? '' : next)}
        disabled={options.length === 0}
      />
      {options.length === 0 && (
        <span className={styles.accountKey}>No devices of this type were found.</span>
      )}
      {missing && (
        <span className={styles.warningNote}>
          That device isn&apos;t connected — calls will use the system default until you
          pick another.
        </span>
      )}
    </div>
  )
}

/** A self-view for the chosen camera, opened only while the preview is on. */
function CameraPreview({ deviceId }: { deviceId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        })
      } catch {
        if (!cancelled) setError('Could not open that camera')
        return
      }
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      setError(null)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      for (const track of stream?.getTracks() ?? []) track.stop()
    }
  }, [deviceId])

  if (error) return <Callout tone="danger">{error}</Callout>

  return (
    <video
      ref={videoRef}
      className={styles.cameraPreview}
      autoPlay
      playsInline
      muted
      // Mirrored, like every other self-view in the app.
      aria-label="Camera preview"
    />
  )
}
