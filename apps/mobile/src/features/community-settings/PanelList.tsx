import React from 'react';
import { Text, View } from 'react-native';

import { SkeletonRows } from '../../components/Skeleton';

import { panel } from './styles';

/**
 * The list every panel ends in — roles, members, channels.
 *
 * Three panels drew the same stack of cards with three different answers to
 * "what if there is nothing here" (all of them: draw nothing). One list, one
 * empty state.
 */
export function PanelList({
  children,
  empty,
  emptyText,
}: {
  children: React.ReactNode;
  empty: boolean;
  emptyText: string;
}) {
  if (empty) return <Text style={panel.empty}>{emptyText}</Text>;
  return <View style={{ gap: 8 }}>{children}</View>;
}

/** Placeholder rows, so a slow fetch does not read as an empty server. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return <SkeletonRows rows={rows} />;
}
