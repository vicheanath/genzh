import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Shield } from 'lucide-react-native';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Select } from '../../components/Select';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import {
  INFO_PAGES,
  REPORT_CATEGORIES,
  type InfoPage,
  type InfoPageType,
} from '../../features/info/content';
import { Colors, Radius, Spacing } from '../../theme/tokens';

/**
 * Help and legal.
 *
 * Reachable signed out, exactly as the web routes are — somebody who cannot get
 * into their account still needs the contact address and the report form.
 */
export function InfoScreen({ route, navigation }: any) {
  const initial: InfoPageType = route?.params?.page ?? 'about';
  const [page, setPage] = useState<InfoPageType>(initial);

  const current = INFO_PAGES.find((item) => item.type === page) ?? INFO_PAGES[0];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Help & legal"
        onBack={() => navigation.goBack()}
        below={
          <View style={styles.strip}>
            <Tabs
              value={page}
              onValueChange={setPage}
              scrollable
              items={INFO_PAGES.map((item) => ({
                value: item.type,
                label: item.label,
              }))}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Badge text={current.tag} tone={current.tagTone} dot />
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.lead}>{current.lead}</Text>

        {current.sections.map((section, index) => (
          <View key={section.heading ?? index} style={styles.section}>
            {section.heading ? <Text style={styles.heading}>{section.heading}</Text> : null}

            {(section.paragraphs ?? []).map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}

            {(section.bullets ?? []).map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>•</Text>
                <Text style={styles.bullet}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}

        {current.type === 'contact' ? <ContactForm /> : null}
        {current.type === 'report' ? <ReportForm /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactForm() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  // No endpoint exists for this yet — the web form behaves the same way, which
  // is why the confirmation says the team will follow up by email rather than
  // claiming a ticket number.
  function submit() {
    setSent(true);
    toast.success('Message noted', 'Email the address above for a reply.');
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Send a message</Text>

      {sent ? (
        <Callout
          tone="info"
          text="Thanks. Until in-app support lands, please also email support@genzh.social so a person sees it."
        />
      ) : null}

      <Input label="Your name" value={name} onChangeText={setName} placeholder="e.g. Alex Walker" />
      <Input
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="alex@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input
        label="Subject"
        value={subject}
        onChangeText={setSubject}
        placeholder="What is this regarding?"
      />
      <Input
        label="Your message"
        value={message}
        onChangeText={setMessage}
        placeholder="Provide as much detail as possible…"
        multiline
        numberOfLines={4}
      />

      <Button
        title="Send message"
        onPress={submit}
        disabled={!message.trim()}
        icon={<Send size={15} color={Colors.accentContrast} />}
      />
    </View>
  );
}

function ReportForm() {
  const toast = useToast();
  const [category, setCategory] = useState('harassment');
  const [target, setTarget] = useState('');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    setSubmitted(true);
    toast.success('Report noted', 'Email safety@genzh.social with the same details.');
    setTarget('');
    setDetails('');
  }

  return (
    <View style={styles.card}>
      {submitted ? (
        <Callout
          tone="info"
          text="Thanks for helping keep genzh safe. Reports are not yet delivered in-app — please also email safety@genzh.social."
        />
      ) : null}

      <Text style={styles.fieldLabel}>Violation category</Text>
      <Select
        label="Violation category"
        value={category}
        onValueChange={setCategory}
        options={REPORT_CATEGORIES}
      />

      <Input
        label="Target user handle, room ID, or community"
        value={target}
        onChangeText={setTarget}
        placeholder="@username, or a room or community name"
        autoCapitalize="none"
      />

      <Input
        label="Details and evidence"
        value={details}
        onChangeText={setDetails}
        placeholder="What happened, timestamps, messages or channel names…"
        multiline
        numberOfLines={5}
      />

      <Callout
        tone="info"
        text="Immediate actions: you can block someone from their profile card, and server owners or moderators can remove disruptive members straight away."
      />

      <Button
        title="Submit safety report"
        variant="danger"
        onPress={submit}
        disabled={!details.trim()}
        icon={<Shield size={15} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  strip: {
    paddingBottom: Spacing.xs,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: Spacing.sm,
  },
  lead: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  heading: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  paragraph: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bulletMark: {
    color: Colors.accent,
    fontSize: 14,
    lineHeight: 20,
  },
  bullet: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  card: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  fieldLabel: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
