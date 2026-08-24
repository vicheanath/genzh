import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { communities } from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Colors, Radius } from '../../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateCommunityModal({ visible, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a community name.');
      return;
    }
    if (!token) return;

    setLoading(true);
    try {
      await communities.create(token, {
        name: name.trim(),
        description: description.trim() || undefined,
        icon_url: iconUrl.trim() || undefined,
      });
      setName('');
      setDescription('');
      setIconUrl('');
      onCreated();
    } catch (err: any) {
      Alert.alert('Creation Failed', err?.message || 'Could not create community');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Create Community</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Input
            label="Community Name"
            placeholder="e.g. Pixel Art Club"
            value={name}
            onChangeText={setName}
          />
          <Input
            label="Description (Optional)"
            placeholder="What is your community about?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
          <Input
            label="Icon URL (Optional)"
            placeholder="https://..."
            value={iconUrl}
            onChangeText={setIconUrl}
            autoCapitalize="none"
          />

          <View style={styles.actions}>
            <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title="Create"
              onPress={handleCreate}
              loading={loading}
              style={{ flex: 1, marginLeft: 12 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
