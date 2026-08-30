import React, { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { Link2, Plus, Share2, Trash2 } from 'lucide-react-native';
import {
  formatClock,
  formatDayDivider,
  useCommunityInvitesQuery,
  useCreateInviteMutation,
  useRevokeInviteMutation,
  type CommunityWithPermissions,
  type Invite,
} from '@genzh/shared';

import { inviteUrl } from '../../api/config';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { Spacing } from '../../theme/tokens';
import { useColors } from '../../theme/ThemeContext';

import { PanelList, PanelSkeleton } from './PanelList';
import { usePanel } from './styles';
import type { CommunityAbilities } from './tabs';

const EXPIRY_OPTIONS = [
  { value: '0', label: 'Never expires' },
  { value: '1', label: '1 hour' },
  { value: '6', label: '6 hours' },
  { value: '24', label: '1 day' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
] as const;

const USES_OPTIONS = [
  { value: '0', label: 'Unlimited uses' },
  { value: '1', label: '1 use' },
  { value: '5', label: '5 uses' },
  { value: '10', label: '10 uses' },
  { value: '25', label: '25 uses' },
  { value: '50', label: '50 uses' },
  { value: '100', label: '100 uses' },
] as const;

/**
 * How an invite leaves the phone.
 *
 * The web app copies the link to the clipboard, which is the only thing a
 * browser can do with it. A phone has a better answer: the share sheet already
 * knows every app the sender might want to put the link in, and it is one tap
 * rather than copy-then-switch-then-paste. Copying is not offered alongside it
 * because reading the clipboard needs a native module this app does not carry —
 * the share sheet is `Share` from React Native itself, no dependency at all.
 */
async function shareInvite(name: string, code: string): Promise<boolean> {
  const url = inviteUrl(code);
  const result = await Share.share({
    // iOS reads `url` as a first-class link and offers link-shaped targets for
    // it; Android has only `message`, so the URL has to be in the text too.
    message: `Join ${name} on GenZH: ${url}`,
    url,
    title: `Join ${name}`,
  });
  return result.action === Share.sharedAction;
}

/** Whether a link is still worth showing as live. */
function inviteState(invite: Invite): 'expired' | 'used-up' | 'active' {
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return 'expired';
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return 'used-up';
  return 'active';
}

/**
 * Invite links: making them, sharing them, revoking them.
 *
 * The panel the phone was missing entirely — a community created on mobile had
 * no way to let anybody else in, short of finding a desktop. It is the sending
 * half of the pair; `screens/invite/InviteScreen` is the receiving half.
 */
export function InvitesTab({
  community,
  abilities,
}: {
  community: CommunityWithPermissions;
  abilities: CommunityAbilities;
}) {
  const panel = usePanel();
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const invitesQuery = useCommunityInvitesQuery(token, community.id);
  const createInvite = useCreateInviteMutation(token, community.id);
  const revokeInvite = useRevokeInviteMutation(token, community.id);

  const [expiresInHours, setExpiresInHours] = useState('168');
  const [maxUses, setMaxUses] = useState('0');

  const canManage = abilities.isOwner || abilities.community;

  async function create() {
    const hours = parseInt(expiresInHours, 10);
    const uses = parseInt(maxUses, 10);

    try {
      const invite = await createInvite.mutateAsync({
        // Zero is this form's word for "no limit", and the server's word for it
        // is the absent field — not a zero, which it would read as a limit.
        expires_in_hours: hours > 0 ? hours : undefined,
        max_uses: uses > 0 ? uses : undefined,
      });
      // Straight into the share sheet: nobody makes an invite link in order to
      // look at it, and the extra tap is the one place this flow used to lose
      // people on the web.
      await shareInvite(community.name, invite.code);
    } catch {
      toast.error('Could not create an invite link');
    }
  }

  async function revoke(code: string) {
    const ok = await confirm({
      title: 'Revoke invite link?',
      description: 'Anyone holding this link will no longer be able to join.',
      confirmLabel: 'Revoke link',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await revokeInvite.mutateAsync(code);
      toast.success('Invite link revoked');
    } catch {
      toast.error('Could not revoke the invite link');
    }
  }

  async function share(code: string) {
    try {
      await shareInvite(community.name, code);
    } catch {
      toast.error('Could not open the share sheet');
    }
  }

  // A revoked link is gone rather than historical: there is nothing to do with
  // one, and leaving it in the list only makes the live links harder to find.
  const invites = (invitesQuery.data ?? []).filter((invite) => !invite.revoked_at);

  return (
    <ScrollView contentContainerStyle={panel.content} keyboardShouldPersistTaps="handled">
      <Text style={panel.title}>Invite links</Text>
      <Text style={panel.description}>
        A link lets someone join without being added by hand. Anyone who has it can join until it
        expires, runs out of uses, or you revoke it.
      </Text>

      {canManage ? (
        <View style={panel.card}>
          <Text style={panel.cardTitle}>New invite link</Text>

          <Select
            label="Expires after"
            value={expiresInHours}
            onValueChange={setExpiresInHours}
            options={EXPIRY_OPTIONS}
          />
          <Select
            label="Max uses"
            value={maxUses}
            onValueChange={setMaxUses}
            options={USES_OPTIONS}
          />

          <Button
            title="Create and share"
            onPress={() => void create()}
            loading={createInvite.isPending}
            icon={<Plus size={15} />}
          />
        </View>
      ) : null}

      <Text style={panel.listHeading}>
        {invites.length > 0
          ? `${invites.length} active link${invites.length === 1 ? '' : 's'}`
          : 'Active links'}
      </Text>

      {invitesQuery.error ? (
        <Callout tone="danger" text="Could not load invite links." />
      ) : null}

      {invitesQuery.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : (
        <PanelList
          empty={invites.length === 0}
          emptyText={
            canManage
              ? 'No active invite links. Create one above to let people in.'
              : 'No active invite links.'
          }
        >
          {invites.map((invite) => {
            const state = inviteState(invite);
            return (
              <View key={invite.code} style={panel.listItem}>
                <View style={panel.roomIcon}>
                  <Link2 size={16} color={c.textSubtle} />
                </View>

                <View style={panel.listText}>
                  <View style={panel.listLabelRow}>
                    <Text style={panel.listLabel} numberOfLines={1}>
                      {invite.code}
                    </Text>
                    <Badge
                      tone={state === 'active' ? 'accent' : 'danger'}
                      text={
                        state === 'expired'
                          ? 'Expired'
                          : state === 'used-up'
                            ? 'Used up'
                            : `${invite.uses}${invite.max_uses ? ` / ${invite.max_uses}` : ''} used`
                      }
                    />
                  </View>
                  <Text style={panel.listHint} numberOfLines={1}>
                    {invite.expires_at
                      ? `Expires ${formatDayDivider(invite.expires_at)} at ${formatClock(invite.expires_at)}`
                      : 'Never expires'}
                  </Text>
                </View>

                <View style={panel.listActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    icon={<Share2 size={15} />}
                    accessibilityLabel={`Share invite ${invite.code}`}
                    onPress={() => void share(invite.code)}
                  />
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={<Trash2 size={15} color={c.danger} />}
                      accessibilityLabel={`Revoke invite ${invite.code}`}
                      onPress={() => void revoke(invite.code)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </PanelList>
      )}

      <Text style={[panel.listHint, { marginTop: Spacing.md }]}>
        Links open the app for anyone who has it installed, and the website for everyone else.
      </Text>
    </ScrollView>
  );
}
