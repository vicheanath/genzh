import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Gift, Palette, Shirt, Zap } from 'lucide-react-native';

import { ToggleGroup } from '../../components/ToggleGroup';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useBalanceQuery } from '@genzh/shared';
import { Radius, Spacing, type Palette as PaletteType } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { StoreView } from './components/StoreView';
import { StudioView } from './components/StudioView';
import { InventoryView } from './components/InventoryView';
import { HistoryView } from './components/HistoryView';

type Section = 'store' | 'studio' | 'inventory' | 'history';

export function RewardsScreen() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();

  const [section, setSection] = useState<Section>('store');
  const balanceQuery = useBalanceQuery(token);
  const balance = balanceQuery.data;

  const sections = [
    { value: 'store', label: 'Store', icon: '🛍️' },
    { value: 'studio', label: 'Studio', icon: '🎨' },
    { value: 'inventory', label: 'Owned', icon: '👜' },
    { value: 'history', label: 'History', icon: '⚡' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Rewards & Cosmetics"
        subtitle={`${balance?.balance || 0} points`}
        actions={<Gift size={20} color={c.accent} />}
      />

      {/* Section Tabs */}
      <View style={styles.tabsContainer}>
        <ToggleGroup
          mode="single"
          value={[section]}
          onValueChange={(next) => setSection((next[0] || 'store') as Section)}
          items={sections.map((s) => ({
            value: s.value,
            label: s.label,
          }))}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {section === 'store' && <StoreView />}
        {section === 'studio' && <StudioView />}
        {section === 'inventory' && <InventoryView />}
        {section === 'history' && <HistoryView />}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: PaletteType) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.bg,
    },
    tabsContainer: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    content: {
      flex: 1,
    },
  });
