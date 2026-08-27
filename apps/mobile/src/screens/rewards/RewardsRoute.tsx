import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Gift, Palette, Shirt, Zap } from 'lucide-react-native';

import { useColors } from '../../theme/ThemeContext';
import { StoreScreen } from './StoreScreen';
import { StudioScreen } from './StudioScreen';
import { InventoryScreen } from './InventoryScreen';
import { HistoryScreen } from './HistoryScreen';

const Tab = createBottomTabNavigator();

export function RewardsRoute() {
  const c = useColors();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tab.Screen
        name="Store"
        component={StoreScreen}
        options={{
          tabBarLabel: 'Store',
          tabBarIcon: ({ color }) => <Gift size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Studio"
        component={StudioScreen}
        options={{
          tabBarLabel: 'Studio',
          tabBarIcon: ({ color }) => <Palette size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{
          tabBarLabel: 'Owned',
          tabBarIcon: ({ color }) => <Shirt size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => <Zap size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
