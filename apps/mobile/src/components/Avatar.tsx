import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { hueFor } from '@genzh/shared';
import { Colors, Radius } from '../theme/tokens';

export interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  speaking?: boolean;
  online?: boolean;
  accent?: string | null;
}

export function Avatar({ name, url, size = 42, speaking = false, online, accent }: AvatarProps) {
  const hue = hueFor(name || 'User');
  const bgColor = accent || `hsl(${hue}, 60%, 35%)`;
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          speaking && styles.speakingRing,
        ]}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
            ]}
          >
            <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
          </View>
        )}
      </View>

      {online !== undefined && (
        <View
          style={[
            styles.presenceDot,
            {
              width: Math.max(10, size * 0.28),
              height: Math.max(10, size * 0.28),
              borderRadius: size * 0.14,
              backgroundColor: online ? Colors.online : Colors.offline,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  circle: {
    overflow: 'hidden',
  },
  speakingRing: {
    borderWidth: 2.5,
    borderColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  image: {
    backgroundColor: Colors.surfaceRaised,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
});
