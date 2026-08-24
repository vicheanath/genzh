import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Mic, MicOff, PhoneOff, Radio } from 'lucide-react-native';
import { useVoice } from '../context/VoiceContext';
import { Colors, Radius } from '../theme/tokens';

export function VoiceOverlay() {
  const { status, activeRoomName, muted, toggleMute, leaveRoom } = useVoice();

  if (status === 'idle') return null;

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <View style={styles.indicatorRow}>
          <Radio size={14} color={status === 'connected' ? Colors.live : Colors.idle} />
          <Text style={styles.statusText}>
            {status === 'connected' ? 'VOICE CONNECTED' : 'CONNECTING...'}
          </Text>
        </View>
        <Text style={styles.roomName} numberOfLines={1}>
          {activeRoomName || 'Voice Room'}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, muted && styles.actionBtnActive]}
          onPress={toggleMute}
          activeOpacity={0.8}
        >
          {muted ? <MicOff size={18} color={Colors.danger} /> : <Mic size={18} color={Colors.text} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.leaveBtn} onPress={leaveRoom} activeOpacity={0.8}>
          <PhoneOff size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 68,
    left: 12,
    right: 12,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.pill, // Rule 4: Pill floating control
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.live,
    letterSpacing: 0.8,
  },
  roomName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnActive: {
    backgroundColor: Colors.dangerSubtle,
    borderColor: 'rgba(255, 77, 79, 0.4)',
  },
  leaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
