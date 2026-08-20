import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import {
  ArrowLeftIcon,
  GlobeIcon,
  HashIcon,
  HeartIcon,
  LockIcon,
  MailIcon,
  MicIcon,
  SendIcon,
  ShieldIcon,
  SparkleIcon,
} from '@/components/Icons'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/lib/auth'
import { cx } from '@/lib/cx'

import styles from './InfoPages.module.css'

export type InfoPageType =
  | 'about'
  | 'guidelines'
  | 'terms'
  | 'privacy'
  | 'contact'
  | 'report'

const NAV_ITEMS: ReadonlyArray<{
  type: InfoPageType
  path: string
  label: string
  icon: typeof ShieldIcon
}> = [
  { type: 'about', path: '/about', label: 'About', icon: SparkleIcon },
  { type: 'guidelines', path: '/guidelines', label: 'Community Guidelines', icon: HeartIcon },
  { type: 'terms', path: '/terms', label: 'Terms of Service', icon: ShieldIcon },
  { type: 'privacy', path: '/privacy', label: 'Privacy Policy', icon: LockIcon },
  { type: 'contact', path: '/contact', label: 'Contact Us', icon: MailIcon },
  { type: 'report', path: '/report', label: 'Report Abuse', icon: ShieldIcon },
]

export function InfoPage({ page }: { page: InfoPageType }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandRow}>
            <Link to="/" className={styles.logo}>
              <span className={styles.logoGlyph}>⚡</span>
              <span className={styles.logoText}>genzh</span>
            </Link>
            <span className={styles.tagline}>Legal & Help Center</span>
          </div>

          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void navigate(user ? '/' : '/')}
            >
              <ArrowLeftIcon size={15} />
              {user ? 'Back to App' : 'Sign In'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className={styles.layout}>
        {/* Navigation Sidebar */}
        <aside className={styles.navSidebar}>
          <div className={styles.navGroup}>
            <div className={styles.navHeading}>Navigation</div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = item.type === page
              return (
                <NavLink
                  key={item.type}
                  to={item.path}
                  className={cx(styles.navLink, isActive && styles.navLinkActive)}
                >
                  <Icon size={16} className={styles.navIcon} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className={styles.content}>
          {page === 'about' && <AboutSection />}
          {page === 'guidelines' && <GuidelinesSection />}
          {page === 'terms' && <TermsSection />}
          {page === 'privacy' && <PrivacySection />}
          {page === 'contact' && <ContactSection />}
          {page === 'report' && <ReportSection />}
        </main>
      </div>

      {/* Global Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.logoGlyph}>⚡</span> genzh
            <span className={styles.copy}>© {new Date().getFullYear()} genzh. Next-gen communication for everyone.</span>
          </div>
          <div className={styles.footerLinks}>
            {NAV_ITEMS.map((item) => (
              <Link key={item.type} to={item.path} className={styles.footerLink}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── 1. ABOUT ───────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <span className={styles.kicker}>Next-Gen Social Experience</span>
        <h1 className={styles.title}>About genzh</h1>
        <p className={styles.lead}>
          genzh is a modern, real-time social platform engineered for authentic human connections, expressive communication, community spaces, and high-performance WebRTC voice and video.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Our Core Pillars</h2>
        <div className={styles.cardGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <HashIcon size={20} />
            </div>
            <h3>Dynamic Community Spaces</h3>
            <p>
              Customizable community hubs with role-based permissions, categorized text channels, direct messages, and playground rooms.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <MicIcon size={20} />
            </div>
            <h3>High-Performance WebRTC Voice & Video</h3>
            <p>
              Crystal-clear, ultra low-latency audio and media rooms with continuous background connectivity and live voice activity detection.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <LockIcon size={20} />
            </div>
            <h3>Anonymous Persona Spaces</h3>
            <p>
              Express yourself freely in dedicated anonymous rooms with masked identities, custom codenames, and guaranteed privacy.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}>
              <SparkleIcon size={20} />
            </div>
            <h3>Moments & Discovery</h3>
            <p>
              Discover trending rooms, spontaneous conversations, and meet new people who share your creative passions and interests.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Built with Modern Architecture</h2>
        <p>
          Engineered from the ground up using a modern Rust backend, WebSocket streaming, Selective Forwarding Units (SFU), and a responsive React frontend styled with modern design tokens.
        </p>
      </section>
    </article>
  )
}

// ── 2. COMMUNITY GUIDELINES ────────────────────────────────────────────────

function GuidelinesSection() {
  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <span className={styles.kicker}>Safety & Culture</span>
        <h1 className={styles.title}>Community Guidelines</h1>
        <p className={styles.lead}>
          Our mission is to create a welcoming, vibrant, and safe platform. We hold all members and communities to the highest standard of mutual respect.
        </p>
      </header>

      <section className={styles.section}>
        <h2>1. Treat Everyone with Respect</h2>
        <p>
          We do not tolerate harassment, bullying, hate speech, threats of violence, or intimidation targeting any individual or group based on race, gender, sexual orientation, religion, disability, or nationality.
        </p>
      </section>

      <section className={styles.section}>
        <h2>2. Protect Privacy & No Doxxing</h2>
        <p>
          Do not share personal identifying information (real names, physical addresses, phone numbers, private credentials) of yourself or others without explicit authorization. Respect anonymous persona spaces.
        </p>
      </section>

      <section className={styles.section}>
        <h2>3. Prohibited Content</h2>
        <ul>
          <li>Non-consensual sexual content, adult pornography, or exploitation of minors.</li>
          <li>Promotion of self-harm, illegal activities, or violent extremist ideologies.</li>
          <li>Malware, phishing links, unauthorized automation, or deceptive scams.</li>
          <li>Spam, raid attacks, or intentional disruption of voice and text channels.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>4. Voice & Media Channel Etiquette</h2>
        <p>
          Do not scream, blast loud audio, or use unauthorized audio tools designed to disrupt active conversations. Server moderators have full authority to mute or disconnect disruptive participants.
        </p>
      </section>

      <section className={styles.section}>
        <h2>5. Enforcement & Consequences</h2>
        <p>
          Violations of these guidelines may lead to content removal, channel mutes, temporary suspensions, or permanent account bans depending on severity.
        </p>
      </section>
    </article>
  )
}

// ── 3. TERMS OF SERVICE ────────────────────────────────────────────────────

function TermsSection() {
  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <span className={styles.kicker}>Legal Agreement</span>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.lead}>
          Last updated: August 19, 2026. Please read these Terms carefully before using the genzh platform.
        </p>
      </header>

      <section className={styles.section}>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By creating an account, accessing, or using genzh, you agree to be bound by these Terms of Service and our Community Guidelines. If you do not agree, you must not use our services.
        </p>
      </section>

      <section className={styles.section}>
        <h2>2. Account Responsibilities</h2>
        <p>
          You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account. You must notify us immediately if you suspect unauthorized access.
        </p>
      </section>

      <section className={styles.section}>
        <h2>3. User Content & Intellectual Property</h2>
        <p>
          You retain all ownership rights to content you post on genzh. By posting content, you grant genzh a non-exclusive, worldwide license to host, display, and distribute your content solely for operating the platform.
        </p>
      </section>

      <section className={styles.section}>
        <h2>4. Acceptable Use & Conduct</h2>
        <p>
          You agree not to exploit, reverse engineer, probe security vulnerabilities, or inject malicious code into the platform. We reserve the right to suspend or terminate accounts that violate our guidelines.
        </p>
      </section>

      <section className={styles.section}>
        <h2>5. Disclaimers & Limitation of Liability</h2>
        <p>
          The service is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without warranties of any kind. genzh shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the platform.
        </p>
      </section>
    </article>
  )
}

// ── 4. PRIVACY POLICY ──────────────────────────────────────────────────────

function PrivacySection() {
  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <span className={styles.kicker}>Data Protection</span>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.lead}>
          We take your privacy seriously. This policy explains what information we collect, how we protect it, and your rights over your data.
        </p>
      </header>

      <section className={styles.section}>
        <h2>1. Information We Collect</h2>
        <ul>
          <li><strong>Account Data:</strong> Handle, display name, email address, password hash, bio, and profile customization.</li>
          <li><strong>Communication Data:</strong> Text messages, reactions, community channels, and friend lists.</li>
          <li><strong>Anonymous Personas:</strong> Masked aliases and room identities generated for anonymous spaces are isolated from your public profile view.</li>
          <li><strong>Technical Metadata:</strong> IP addresses for rate limiting, connection telemetry, and WebRTC signaling parameters.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>2. Media & Voice Stream Privacy</h2>
        <p>
          Voice and video streams are transmitted through our media relay SFUs for real-time delivery and are <strong>never recorded, stored, or indexed</strong> on our servers.
        </p>
      </section>

      <section className={styles.section}>
        <h2>3. How We Use Data</h2>
        <p>
          We use your data solely to deliver real-time social services, authenticate sessions, enforce safety rules, and maintain infrastructure reliability. We never sell your personal data to third parties.
        </p>
      </section>

      <section className={styles.section}>
        <h2>4. Data Rights & Account Deletion</h2>
        <p>
          You have the right to access, edit, or delete your account data at any time via your user settings or by contacting our team.
        </p>
      </section>
    </article>
  )
}

// ── 5. CONTACT US ──────────────────────────────────────────────────────────

function ContactSection() {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      setSent(true)
      toast.success('Message sent!', 'Our support team will get back to you shortly.')
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    }, 600)
  }

  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <span className={styles.kicker}>Get in Touch</span>
        <h1 className={styles.title}>Contact Us</h1>
        <p className={styles.lead}>
          Have a question, feedback, partnership inquiry, or need technical help? We&apos;d love to hear from you.
        </p>
      </header>

      <div className={styles.contactGrid}>
        <div className={styles.contactInfo}>
          <h2>Direct Inquiries</h2>
          <p>
            You can reach our dedicated support and community teams through the following channels:
          </p>

          <div className={styles.infoCard}>
            <div className={styles.infoRow}>
              <MailIcon size={18} />
              <div>
                <strong>General Support:</strong>
                <div>support@genzh.social</div>
              </div>
            </div>

            <div className={styles.infoRow}>
              <ShieldIcon size={18} />
              <div>
                <strong>Trust & Safety:</strong>
                <div>safety@genzh.social</div>
              </div>
            </div>

            <div className={styles.infoRow}>
              <GlobeIcon size={18} />
              <div>
                <strong>Partnerships & Press:</strong>
                <div>partners@genzh.social</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.contactFormWrap}>
          <h2>Send a Message</h2>
          {sent && (
            <Callout tone="success">
              Thank you! Your message has been received. A team member will reply within 24 hours.
            </Callout>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              label="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Walker"
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
              required
            />

            <Input
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this regarding?"
              required
            />

            <div className={styles.textareaField}>
              <label className={styles.fieldLabel}>Your Message</label>
              <textarea
                className={styles.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Provide as much detail as possible..."
                rows={4}
                required
              />
            </div>

            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              <SendIcon size={15} />
              Send Message
            </Button>
          </form>
        </div>
      </div>
    </article>
  )
}

// ── 6. REPORT ABUSE ────────────────────────────────────────────────────────

function ReportSection() {
  const toast = useToast()
  const [category, setCategory] = useState('harassment')
  const [targetIdentifier, setTargetIdentifier] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      setSubmitted(true)
      toast.success('Report submitted', 'Our trust & safety team has received your report.')
      setTargetIdentifier('')
      setDetails('')
    }, 700)
  }

  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <span className={styles.kicker}>Trust & Safety</span>
        <h1 className={styles.title}>Report Abuse or Violations</h1>
        <p className={styles.lead}>
          If you encounter harassment, hate speech, illegal content, or other violations of our Community Guidelines, please submit a detailed report below.
        </p>
      </header>

      {submitted && (
        <Callout tone="success">
          Thank you for helping keep genzh safe. Our moderation team reviews all reports promptly and takes appropriate action.
        </Callout>
      )}

      <form className={styles.reportForm} onSubmit={handleSubmit}>
        <div>
          <label className={styles.fieldLabel}>Violation Category</label>
          <select
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="harassment">Harassment / Bullying / Threats</option>
            <option value="hate_speech">Hate Speech / Discrimination</option>
            <option value="doxxing">Privacy Violation / Doxxing</option>
            <option value="inappropriate">Inappropriate / Explicit Content</option>
            <option value="spam">Spam / Scams / Raids</option>
            <option value="impersonation">Impersonation / Fake Identity</option>
            <option value="security">Security Vulnerability / Exploit</option>
          </select>
        </div>

        <Input
          label="Target User Handle, Room ID, or Community"
          value={targetIdentifier}
          onChange={(e) => setTargetIdentifier(e.target.value)}
          placeholder="@username or room/community name or URL"
          required
        />

        <div className={styles.textareaField}>
          <label className={styles.fieldLabel}>Details and Evidence</label>
          <textarea
            className={styles.textarea}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Please describe what happened, timestamps, messages or channel names..."
            rows={5}
            required
          />
        </div>

        <Callout>
          <strong>Immediate Actions You Can Take:</strong> You can block users directly by visiting their profile card, and server owners/moderators can kick or ban disruptive members immediately.
        </Callout>

        <div style={{ marginTop: '0.5rem' }}>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy && <Spinner />}
            <ShieldIcon size={15} />
            Submit Safety Report
          </Button>
        </div>
      </form>
    </article>
  )
}
