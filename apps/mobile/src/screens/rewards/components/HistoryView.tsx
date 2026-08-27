import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDown, ArrowUp, Zap } from 'lucide-react-native';
import { useBalanceQuery } from '@genzh/shared';

import { ScreenHeader } from '../../components/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

// Mock transaction history
const MOCK_TRANSACTIONS = [
  {
    id: '1',
    type: 'daily_checkin',
    description: 'Daily check-in',
    amount: 50,
    direction: 'in' as const,
    date: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: '2',
    type: 'purchase',
    description: 'Purchased: Gold Frame',
    amount: 100,
    direction: 'out' as const,
    date: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: '3',
    type: 'referral',
    description: 'Referral bonus',
    amount: 200,
    direction: 'in' as const,
    date: new Date(Date.now() - 1000 * 60 * 60 * 48),
  },
  {
    id: '4',
    type: 'purchase',
    description: 'Purchased: Blue Badge',
    amount: 50,
    direction: 'out' as const,
    date: new Date(Date.now() - 1000 * 60 * 60 * 72),
  },
  {
    id: '5',
    type: 'daily_checkin',
    description: 'Daily check-in',
    amount: 50,
    direction: 'in' as const,
    date: new Date(Date.now() - 1000 * 60 * 60 * 96),
  },
];

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export function HistoryScreen() {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();

  const balanceQuery = useBalanceQuery(token);
  const balance = balanceQuery.data;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Transaction History"
        subtitle="Lifetime earned: ${balance?.lifetime_earned || 0}"
        actions={<Zap size={20} color={c.accent} />}
      />

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <ArrowDown size={16} color={c.live} />
          <View style={styles.statContent}>
            <Text style={styles.statLabel}>Total Earned</Text>
            <Text style={styles.statValue}>{balance?.lifetime_earned || 0}</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <ArrowUp size={16} color={c.danger} />
          <View style={styles.statContent}>
            <Text style={styles.statLabel}>Lifetime Spent</Text>
            <Text style={styles.statValue}>
              {((balance?.lifetime_earned || 0) - (balance?.balance || 0))}
            </Text>
          </View>
        </View>
      </View>

      {/* Transactions */}
      <FlatList
        data={MOCK_TRANSACTIONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isIncome = item.direction === 'in';
          return (
            <View style={styles.transactionRow}>
              <View
                style={[
                  styles.icon,
                  isIncome ? styles.incomeIcon : styles.expenseIcon,
                ]}
              >
                {isIncome ? (
                  <ArrowDown size={16} color={c.live} />
                ) : (
                  <ArrowUp size={16} color={c.danger} />
                )}
              </View>

              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDesc}>{item.description}</Text>
                <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
              </View>

              <Text
                style={[
                  styles.transactionAmount,
                  isIncome ? styles.incomeAmount : styles.expenseAmount,
                ]}
              >
                {isIncome ? '+' : '-'}{item.amount}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.bg,
    },
    statsContainer: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      flexDirection: 'row',
      gap: Spacing.md,
    },
    statCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    incomeIcon: {
      backgroundColor: c.liveSubtle,
    },
    expenseIcon: {
      backgroundColor: c.dangerSubtle,
    },
    statContent: {
      flex: 1,
    },
    statLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    statValue: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 2,
    },
    list: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
    },
    transactionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: Spacing.md,
    },
    transactionInfo: {
      flex: 1,
    },
    transactionDesc: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600',
    },
    transactionDate: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    transactionAmount: {
      fontSize: 14,
      fontWeight: '700',
    },
    incomeAmount: {
      color: c.live,
    },
    expenseAmount: {
      color: c.danger,
    },
  });
