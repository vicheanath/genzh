import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AtSign, Lock, Mail, Server, Sparkles, User } from 'lucide-react-native';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';
import { getApiUrl, saveApiUrl } from '../../api/config';

export function SignInScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { login, register, error, clearError } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const [identifier, setIdentifier] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(getApiUrl());

  const handleTabSwitch = (t: 'login' | 'register') => {
    setTab(t);
    clearError();
  };

  const handleSaveServer = async () => {
    if (!serverUrlInput.trim()) return;
    await saveApiUrl(serverUrlInput.trim());
    toast.success('Server endpoint updated');
    setShowServerConfig(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (tab === 'login') {
        if (!identifier || !password) {
          toast.error('Enter your handle or email, and your password.');
          setLoading(false);
          return;
        }
        await login(identifier.trim(), password);
      } else {
        if (!handle || !email || !password) {
          toast.error('A handle, an email and a password are all required.');
          setLoading(false);
          return;
        }
        await register({
          handle: handle.trim().toLowerCase(),
          email: email.trim(),
          password,
          display_name: displayName.trim() || undefined,
        });
      }
    } catch {
      // Error handled by AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.brandIconWrapper}>
              <Sparkles size={28} color={c.accent} />
            </View>
            <Text style={styles.brandTitle}>genzh</Text>
            <Text style={styles.brandSubtitle}>REAL-TIME VOICE & COMMUNITY CHAT</Text>
          </View>

          {/* Main Auth Card */}
          <View style={styles.card}>
            {/* Segmented Switcher */}
            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segmentBtn, tab === 'login' && styles.segmentBtnActive]}
                onPress={() => handleTabSwitch('login')}
              >
                <Text style={[styles.segmentText, tab === 'login' && styles.segmentTextActive]}>
                  Sign In
                </Text>
              </Pressable>

              <Pressable
                style={[styles.segmentBtn, tab === 'register' && styles.segmentBtnActive]}
                onPress={() => handleTabSwitch('register')}
              >
                <Text style={[styles.segmentText, tab === 'register' && styles.segmentTextActive]}>
                  Create Account
                </Text>
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorWrapper}>
                <Callout type="danger" text={error} />
              </View>
            ) : null}

            {/* Form Fields */}
            <View style={styles.formFields}>
              {tab === 'login' ? (
                <>
                  <Input
                    label="Handle or Email"
                    placeholder="e.g. alex or alex@domain.com"
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<User size={18} color={c.textDim} />}
                  />
                  <Input
                    label="Password"
                    placeholder="Enter your password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    leftIcon={<Lock size={18} color={c.textDim} />}
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Handle"
                    placeholder="choose_handle (letters, numbers, _)"
                    value={handle}
                    onChangeText={setHandle}
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<AtSign size={18} color={c.textDim} />}
                  />
                  <Input
                    label="Email"
                    placeholder="you@domain.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<Mail size={18} color={c.textDim} />}
                  />
                  <Input
                    label="Display Name (Optional)"
                    placeholder="What should friends call you?"
                    value={displayName}
                    onChangeText={setDisplayName}
                    leftIcon={<User size={18} color={c.textDim} />}
                  />
                  <Input
                    label="Password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    leftIcon={<Lock size={18} color={c.textDim} />}
                  />
                </>
              )}

              <Button
                title={tab === 'login' ? 'Sign In' : 'Create Account'}
                onPress={handleSubmit}
                loading={loading}
                variant="primary"
                size="lg"
                style={styles.submitBtn}
              />
            </View>

            {/* Server Endpoint Override Accordion */}
            <View style={styles.serverSection}>
              <Pressable
                onPress={() => setShowServerConfig((v) => !v)}
                style={styles.serverToggle}
              >
                <Server size={14} color={c.textDim} />
                <Text style={styles.serverToggleText}>
                  {showServerConfig ? 'Hide Server Configuration' : 'Configure Server Endpoint'}
                </Text>
              </Pressable>

              {showServerConfig ? (
                <View style={styles.serverConfigBox}>
                  <Input
                    label="Backend API Endpoint"
                    value={serverUrlInput}
                    onChangeText={setServerUrlInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="http://192.168.1.x:8080"
                  />
                  <Button
                    title="Save Endpoint"
                    onPress={handleSaveServer}
                    variant="secondary"
                    size="sm"
                    style={{ marginTop: Spacing.sm }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  brandIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: Radius.xxl,
    backgroundColor: c.surfaceRaised,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  brandTitle: {
    color: c.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: c.sunken,
    borderRadius: Radius.pill,
    padding: 4,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: c.surfaceRaised,
    borderWidth: 1,
    borderColor: c.border,
  },
  segmentText: {
    color: c.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: c.text,
  },
  errorWrapper: {
    marginBottom: Spacing.md,
  },
  formFields: {
    gap: Spacing.sm,
  },
  submitBtn: {
    marginTop: Spacing.md,
  },
  serverSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
    alignItems: 'center',
  },
  serverToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  serverToggleText: {
    color: c.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  serverConfigBox: {
    width: '100%',
    marginTop: Spacing.md,
    backgroundColor: c.sunken,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
});
