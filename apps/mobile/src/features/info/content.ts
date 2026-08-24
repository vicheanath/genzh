import { Heart, Lock, Mail, Shield, Sparkles } from 'lucide-react-native';

import type { BadgeTone } from '../../components/Badge';

export type InfoPageType =
  | 'about'
  | 'guidelines'
  | 'terms'
  | 'privacy'
  | 'contact'
  | 'report';

export interface InfoSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface InfoPage {
  type: InfoPageType;
  label: string;
  tag: string;
  tagTone: BadgeTone;
  title: string;
  lead: string;
  sections: InfoSection[];
  icon: typeof Shield;
}

/**
 * The help and legal pages, as data.
 *
 * The web app writes each one out as JSX. Holding the copy as data here means
 * one renderer draws all six, and the text can be compared against the web
 * originals line by line rather than by reading two different layouts.
 */
export const INFO_PAGES: ReadonlyArray<InfoPage> = [
  {
    type: 'about',
    label: 'About',
    tag: 'Next-gen social',
    tagTone: 'mint',
    icon: Sparkles,
    title: 'About genzh',
    lead: 'genzh is a real-time social platform engineered for authentic human connections, expressive communication, community spaces, and high-performance WebRTC voice and video.',
    sections: [
      {
        heading: 'Our core pillars',
        bullets: [
          'Dynamic community spaces — customisable hubs with role-based permissions, categorised text channels, direct messages, and playground rooms.',
          'High-performance WebRTC voice and video — ultra low-latency audio and media rooms with live voice activity detection.',
          'Anonymous persona spaces — masked identities, custom codenames, and guaranteed privacy in dedicated rooms.',
          'Moments and discovery — trending rooms, spontaneous conversations, and people who share your interests.',
        ],
      },
      {
        heading: 'Built with modern architecture',
        paragraphs: [
          'Engineered from the ground up using a Rust backend, WebSocket streaming, Selective Forwarding Units (SFU), and a responsive client styled with design tokens.',
        ],
      },
    ],
  },
  {
    type: 'guidelines',
    label: 'Community guidelines',
    tag: 'Safety & culture',
    tagTone: 'accent',
    icon: Heart,
    title: 'Community guidelines',
    lead: 'Our mission is to create a welcoming, vibrant, and safe platform. We hold all members and communities to the highest standard of mutual respect.',
    sections: [
      {
        heading: '1. Treat everyone with respect',
        paragraphs: [
          'We do not tolerate harassment, bullying, hate speech, threats of violence, or intimidation targeting any individual or group based on race, gender, sexual orientation, religion, disability, or nationality.',
        ],
      },
      {
        heading: '2. Protect privacy — no doxxing',
        paragraphs: [
          'Do not share personal identifying information (real names, physical addresses, phone numbers, private credentials) of yourself or others without explicit authorisation. Respect anonymous persona spaces.',
        ],
      },
      {
        heading: '3. Prohibited content',
        bullets: [
          'Non-consensual sexual content, adult pornography, or exploitation of minors.',
          'Promotion of self-harm, illegal activities, or violent extremist ideologies.',
          'Malware, phishing links, unauthorised automation, or deceptive scams.',
          'Spam, raid attacks, or intentional disruption of voice and text channels.',
        ],
      },
      {
        heading: '4. Voice and media channel etiquette',
        paragraphs: [
          'Do not scream, blast loud audio, or use unauthorised audio tools designed to disrupt active conversations. Server moderators have full authority to mute or disconnect disruptive participants.',
        ],
      },
      {
        heading: '5. Enforcement and consequences',
        paragraphs: [
          'Violations of these guidelines may lead to content removal, channel mutes, temporary suspensions, or permanent account bans depending on severity.',
        ],
      },
    ],
  },
  {
    type: 'terms',
    label: 'Terms of service',
    tag: 'Legal agreement',
    tagTone: 'neutral',
    icon: Shield,
    title: 'Terms of service',
    lead: 'Last updated: August 19, 2026. Please read these Terms carefully before using the genzh platform.',
    sections: [
      {
        heading: '1. Acceptance of terms',
        paragraphs: [
          'By creating an account, accessing, or using genzh, you agree to be bound by these Terms of Service and our Community Guidelines. If you do not agree, you must not use our services.',
        ],
      },
      {
        heading: '2. Account responsibilities',
        paragraphs: [
          'You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account. You must notify us immediately if you suspect unauthorised access.',
        ],
      },
      {
        heading: '3. User content and intellectual property',
        paragraphs: [
          'You retain all ownership rights to content you post on genzh. By posting content, you grant genzh a non-exclusive, worldwide licence to host, display, and distribute your content solely for operating the platform.',
        ],
      },
      {
        heading: '4. Acceptable use and conduct',
        paragraphs: [
          'You agree not to exploit, reverse engineer, probe security vulnerabilities, or inject malicious code into the platform. We reserve the right to suspend or terminate accounts that violate our guidelines.',
        ],
      },
      {
        heading: '5. Disclaimers and limitation of liability',
        paragraphs: [
          'The service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind. genzh shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the platform.',
        ],
      },
    ],
  },
  {
    type: 'privacy',
    label: 'Privacy policy',
    tag: 'Data protection',
    tagTone: 'success',
    icon: Lock,
    title: 'Privacy policy',
    lead: 'We take your privacy seriously. This policy explains what information we collect, how we protect it, and your rights over your data.',
    sections: [
      {
        heading: '1. Information we collect',
        bullets: [
          'Account data: handle, display name, email address, password hash, bio, and profile customisation.',
          'Communication data: text messages, reactions, community channels, and friend lists.',
          'Anonymous personas: masked aliases and room identities generated for anonymous spaces, isolated from your public profile.',
          'Technical metadata: IP addresses for rate limiting, connection telemetry, and WebRTC signalling parameters.',
        ],
      },
      {
        heading: '2. Media and voice stream privacy',
        paragraphs: [
          'Voice and video streams are transmitted through our media relay SFUs for real-time delivery and are never recorded, stored, or indexed on our servers.',
        ],
      },
      {
        heading: '3. How we use data',
        paragraphs: [
          'We use your data solely to deliver real-time social services, authenticate sessions, enforce safety rules, and maintain infrastructure reliability. We never sell your personal data to third parties.',
        ],
      },
      {
        heading: '4. Data rights and account deletion',
        paragraphs: [
          'You have the right to access, edit, or delete your account data at any time via your user settings or by contacting our team.',
        ],
      },
    ],
  },
  {
    type: 'contact',
    label: 'Contact us',
    tag: 'Get in touch',
    tagTone: 'mint',
    icon: Mail,
    title: 'Contact us',
    lead: 'Have a question, feedback, partnership inquiry, or need technical help? We’d love to hear from you.',
    sections: [
      {
        heading: 'Direct inquiries',
        bullets: [
          'General support — support@genzh.social',
          'Trust & safety — safety@genzh.social',
          'Partnerships & press — partners@genzh.social',
        ],
      },
    ],
  },
  {
    type: 'report',
    label: 'Report abuse',
    tag: 'Trust & safety',
    tagTone: 'danger',
    icon: Shield,
    title: 'Report abuse or violations',
    lead: 'If you encounter harassment, hate speech, illegal content, or other violations of our Community Guidelines, please submit a detailed report below.',
    sections: [],
  },
];

export const REPORT_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'harassment', label: 'Harassment / bullying / threats' },
  { value: 'hate_speech', label: 'Hate speech / discrimination' },
  { value: 'doxxing', label: 'Privacy violation / doxxing' },
  { value: 'inappropriate', label: 'Inappropriate / explicit content' },
  { value: 'spam', label: 'Spam / scams / raids' },
  { value: 'impersonation', label: 'Impersonation / fake identity' },
  { value: 'security', label: 'Security vulnerability / exploit' },
];
