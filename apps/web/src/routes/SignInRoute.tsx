import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { DiscordIcon, GoogleIcon, HashIcon, MicIcon, UsersIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { ApiError, auth as authApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'

import styles from './SignInRoute.module.css'

type Mode = 'signin' | 'register'

const PITCH = [
  { icon: HashIcon, text: 'Rooms for every conversation, with permissions that actually mean something.' },
  { icon: MicIcon, text: 'Voice and video that connect straight between you — no server in the middle of the audio.' },
  { icon: UsersIcon, text: 'Communities you own, invites you control, friends who follow you across all of them.' },
]

export function SignInRoute() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: authConfig } = useQuery({
    queryKey: ['authConfig'],
    queryFn: () => authApi.config(),
    staleTime: 5 * 60 * 1000,
  })

  // Detect error from OAuth redirect if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      setError(err)
    }
  }, [])

  function startOAuth(provider: 'google' | 'discord') {
    window.location.href = `/api/v1/auth/oauth/${provider}/authorize`
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        await login(identifier, password)
      } else {
        await register({
          handle: identifier,
          email,
          password,
          displayName: displayName || undefined,
        })
      }
      // On success the router swaps this screen out; no navigation needed here.
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // If password signup is disabled (e.g. in production), password registration is not allowed
  const allowPasswordSignup = authConfig?.allow_password_signup ?? true
  const showPasswordForm = mode === 'signin' || allowPasswordSignup

  return (
    <main className={styles.page}>
      <aside className={styles.pitch}>
        <span className={styles.pitchBrand}>genzh</span>
        <h1 className={styles.pitchTitle}>Somewhere to hang out with your people.</h1>
        <ul className={styles.pitchList}>
          {PITCH.map(({ icon: Icon, text }) => (
            <li key={text} className={styles.pitchItem}>
              <span className={styles.pitchMark} aria-hidden>
                <Icon size={15} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>

      <div className={styles.formPane}>
        <div className={styles.card}>
          <h1 className={styles.brand}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className={styles.tagline}>
            {mode === 'signin'
              ? 'Sign in to pick up where you left off.'
              : allowPasswordSignup
                ? 'It takes about twenty seconds.'
                : 'Sign up securely with Discord or Google.'}
          </p>

          {error && <Callout tone="danger">{error}</Callout>}

          <div className={styles.socialGroup}>
            <button
              type="button"
              className={`${styles.socialButton} ${styles.discordButton}`}
              onClick={() => startOAuth('discord')}
            >
              <DiscordIcon size={20} />
              <span>{mode === 'signin' ? 'Sign in with Discord' : 'Sign up with Discord'}</span>
            </button>

            <button
              type="button"
              className={`${styles.socialButton} ${styles.googleButton}`}
              onClick={() => startOAuth('google')}
            >
              <GoogleIcon size={18} />
              <span>{mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}</span>
            </button>
          </div>

          {showPasswordForm && (
            <>
              <div className={styles.divider}>
                <span>or {mode === 'signin' ? 'with password' : 'with password (dev)'}</span>
              </div>

              <form className={styles.form} onSubmit={submit} noValidate>
                <Input
                  label={mode === 'signin' ? 'Handle or e-mail' : 'Handle'}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete={mode === 'signin' ? 'username' : 'off'}
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  description={
                    mode === 'register' ? '3–32 characters: letters, digits, _ and .' : undefined
                  }
                />

                {mode === 'register' && (
                  <>
                    <Input
                      label="E-mail"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                    />
                    <Input
                      label="Display name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Optional — defaults to your handle"
                    />
                  </>
                )}

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  description={mode === 'register' ? 'At least 10 characters' : undefined}
                />

                <Button type="submit" size="lg" disabled={busy}>
                  {busy && <Spinner />}
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </form>
            </>
          )}

          {!allowPasswordSignup && mode === 'register' && (
            <p className={styles.prodInfo}>
              To protect community security and prevent bot registrations, account creation in production requires Discord or Google authentication.
            </p>
          )}

          <p className={styles.switcher}>
            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setMode(mode === 'signin' ? 'register' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>

          <nav className={styles.footerNav} aria-label="Legal and help links">
            <a href="/about" className={styles.footerLink}>About</a>
            <span>•</span>
            <a href="/guidelines" className={styles.footerLink}>Guidelines</a>
            <span>•</span>
            <a href="/terms" className={styles.footerLink}>Terms</a>
            <span>•</span>
            <a href="/privacy" className={styles.footerLink}>Privacy</a>
            <span>•</span>
            <a href="/contact" className={styles.footerLink}>Contact</a>
            <span>•</span>
            <a href="/report" className={styles.footerLink}>Report</a>
          </nav>
        </div>
      </div>
    </main>
  )
}
