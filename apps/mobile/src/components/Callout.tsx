import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { AlertCircle, Info } from 'lucide-react-native';
import { Colors, Radius } from '../theme/tokens';

interface CalloutProps {
  type?: 'info' | 'danger';
  text: string;
  style?: ViewStyle;
}

export function Callout({ type = 'info', text, style }: CalloutProps) {
  const isDanger = type === 'danger';

  return (
    <View
      style={[
        styles.callout,
        isDanger ? styles.dangerCallout : styles.infoCallout,
        style,
      ]}
    >
      {isDanger ? (
        <AlertCircle size={18} color={Colors.danger} style={{ marginRight: 10 }} />
      ) : (
        <Info size={18} color={Colors.accent} style={{ marginRight: 10 }} />
      )}
      <Text style={[styles.text, isDanger ? styles.dangerText : styles.infoText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoCallout: {
    backgroundColor: Colors.accentSubtle,
    borderColor: 'rgba(186, 227, 16, 0.3)',
  },
  dangerCallout: {
    backgroundColor: Colors.dangerSubtle,
    borderColor: 'rgba(255, 77, 79, 0.3)',
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  infoText: {
    color: Colors.text,
  },
  dangerText: {
    color: Colors.danger,
  },
});
