import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Colors, Radius } from '../../theme/tokens';

export function SignInScreen() {
  const { login, register, error, clearError } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const [identifier, setIdentifier] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTabSwitch = (t: 'login' | 'register') => {
    setTab(t);
    clearError();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (tab === 'login') {
        if (!identifier || !password) {
          Alert.alert('Validation Error', 'Please enter your handle/email and password.');
          setLoading(false);
          return;
        }
        await login(identifier.trim(), password);
      } else {
        if (!handle || !email || !password) {
          Alert.alert('Validation Error', 'Please fill in handle, email, and password.');
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>genzh</Text>
            <Text style={styles.tagline}>CITRINE VOICE & CHAT</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabBtn, tab === 'login' && styles.tabBtnActive]}
                onPress={() => handleTabSwitch('login')}
              >
                <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, tab === 'register' && styles.tabBtnActive]}
                onPress={() => handleTabSwitch('register')}
              >
                <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            {error && <Callout type="danger" text={error} />}

            {tab === 'login' ? (
              <View style={styles.form}>
                <Input
                  label="Handle or Email"
                  placeholder="username or user@example.com"
                  autoCapitalize="none"
                  value={identifier}
                  onChangeText={setIdentifier}
                />
                <Input
                  label="Password"
                  placeholder="••••••••"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <Button
                  title="Sign In"
                  size="lg"
                  onPress={handleSubmit}
                  loading={loading}
                  style={styles.submitBtn}
                />
              </View>
            ) : (
              <View style={styles.form}>
                <Input
                  label="Handle"
                  placeholder="alex_smith"
                  autoCapitalize="none"
                  value={handle}
                  onChangeText={setHandle}
                />
                <Input
                  label="Email"
                  placeholder="alex@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
                <Input
                  label="Display Name (Optional)"
                  placeholder="Alex Smith"
                  value={displayName}
                  onChangeText={setDisplayName}
                />
                <Input
                  label="Password"
                  placeholder="••••••••"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <Button
                  title="Create Account"
                  size="lg"
                  onPress={handleSubmit}
                  loading={loading}
                  style={styles.submitBtn}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -1.5,
  },
  tagline: {
    fontSize: 12,
    color: Colors.accent,
    marginTop: 6,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl, // Rule 4: Slab container
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.sunken,
    borderRadius: Radius.pill, // Rule 4: Pill controls
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  tabBtnActive: {
    backgroundColor: Colors.surfaceRaised,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.text,
  },
  form: {
    width: '100%',
  },
  submitBtn: {
    marginTop: 8,
  },
});
