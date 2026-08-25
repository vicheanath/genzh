import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import {
  ApiError,
  useCommunityDetailVM,
  ACCENT_COLORS,
  DEFAULT_ACCENT,
  type CommunityWithPermissions,
  type Permission,
} from '@genzh/shared';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Input } from '../../components/Input';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import {
  ALL_PERMISSIONS,
  DEFAULT_NEW_ROLE_PERMISSIONS,
  summarisePermissions,
} from './permissions';
import { PanelList, PanelSkeleton } from './PanelList';
import type { CommunityAbilities } from './tabs';
import { usePanel } from './styles';

export function RolesTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions;
  abilities: CommunityAbilities;
}) {
  const styles = useThemedStyles(makeStyles);
  const panel = usePanel();
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();

  const vm = useCommunityDetailVM(token, community.id);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_ACCENT);
  const [granted, setGranted] = useState<Set<Permission>>(
    () => new Set(DEFAULT_NEW_ROLE_PERMISSIONS),
  );

  async function create() {
    if (!name.trim()) return;

    try {
      await vm.createRole({
        name: name.trim(),
        color,
        permissions: [...granted],
      });
      setName('');
      setGranted(new Set(DEFAULT_NEW_ROLE_PERMISSIONS));
      toast.success('Role created');
    } catch (cause) {
      toast.error('Could not create role', cause instanceof ApiError ? cause.message : undefined);
    }
  }


  function toggle(permission: Permission, on: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Roles & permissions</Text>
      <Text style={panel.description}>
        A role is a bundle of permissions you hand to people. Everyone gets the default role;
        anything beyond it is a role you make here.
      </Text>

      {abilities.roles ? (
        <View style={panel.card}>
          <Text style={panel.cardTitle}>New role</Text>

          <Input
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Moderator"
            maxLength={48}
          />

          <Text style={panel.fieldLabel}>Colour</Text>
          {/* A swatch row rather than a hex field: the value is a hex string
              either way, and typing one blind is not a design tool. */}
          <View style={styles.swatchRow}>
            {ACCENT_COLORS.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Role colour ${value}`}
                onPress={() => setColor(value)}
                style={[
                  styles.swatch,
                  { backgroundColor: value },
                  color.toLowerCase() === value.toLowerCase() && styles.swatchActive,
                ]}
              >
                {color.toLowerCase() === value.toLowerCase() ? (
                  <Check size={14} color="#000" strokeWidth={3} />
                ) : null}
              </Pressable>
            ))}
          </View>

          <Text style={panel.fieldLabel}>Permissions to grant</Text>
          <View>
            {ALL_PERMISSIONS.map((permission) => (
              <View key={permission.id} style={panel.permission}>
                <View style={panel.permissionText}>
                  <Text style={panel.permissionLabel}>{permission.label}</Text>
                  <Text style={panel.permissionHint}>{permission.description}</Text>
                </View>
                <Switch
                  checked={granted.has(permission.id)}
                  onCheckedChange={(checked) => toggle(permission.id, checked)}
                  accessibilityLabel={permission.label}
                />
              </View>
            ))}
          </View>

          <Button
            title="Create role"
            onPress={() => void create()}
            loading={vm.isCreatingRole}
            disabled={!name.trim()}
            icon={<Plus size={15} color={c.accentContrast} />}
          />
        </View>
      ) : null}

      <Text style={panel.listHeading}>Server roles</Text>

      {vm.error ? <Callout tone="danger" text="Could not load roles." /> : null}
      {vm.isLoading ? <PanelSkeleton rows={3} /> : null}

      <PanelList
        empty={!vm.isLoading && vm.roles.length === 0}
        emptyText="No roles yet. The default role covers everyone until you add one."
      >
        {vm.roles.map((role) => (
          <View key={role.id} style={panel.listItem}>
            <View style={[panel.roleDot, { backgroundColor: role.color ?? DEFAULT_ACCENT }]} />

            <View style={panel.listText}>
              <View style={panel.listLabelRow}>
                <Text style={panel.listLabel}>{role.name}</Text>
                {role.is_default ? <Badge text="Default" /> : null}
              </View>
              <Text style={panel.listHint}>{summarisePermissions(role.permissions)}</Text>
            </View>
          </View>
        ))}
      </PanelList>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  ({
  swatchRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: Spacing.sm,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: c.text,
  },
});
