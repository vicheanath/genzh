import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { ApiError, communities } from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { Radius, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateCommunityModal({ visible, onClose, onCreated }: Props) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { getToken } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('A community needs a name');
      return;
    }

    setLoading(true);
    try {
      await communities.create(await getToken(), {
        name: name.trim(),
        description: description.trim() || undefined,
        icon_url: iconUrl.trim() || undefined,
      });
      setName('');
      setDescription('');
      setIconUrl('');
      toast.success('Community created');
      onCreated();
    } catch (cause) {
      toast.error(
        'Could not create community',
        cause instanceof ApiError ? cause.message : undefined,
      );
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
              <X size={20} color={c.textMuted} />
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: 24,
    borderTopWidth: 1,
    borderColor: c.border,
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
    color: c.text,
  },
  closeBtn: {
    padding: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
