import * as React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { QuickCreateButton } from '@/components/quick-create';
import { ScopeButton } from '@/components/scope-button';

/**
 * Five destinations, and no more.
 *
 * Administration, imports, financial reporting, integration setup and
 * permissions stay on the desktop: they are dense, careful work that a phone
 * makes worse rather than better.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.fgSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          // Room for the icon, the label and the home indicator beneath it.
          // The bar's own height has to allow for the items; forcing a minimum
          // height on the items instead pushes the labels past its edge and
          // clips them.
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // Each tab is a fifth of the width and the full height of the bar,
        // which is comfortably past the 44-point minimum in both directions.
        tabBarItemStyle: { paddingVertical: 2 },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.fg,
        headerTitleStyle: { fontWeight: '600' },
        headerLeft: () => <ScopeButton />,
        headerRight: () => <QuickCreateButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'Tasks',
        }}
      />
      <Tabs.Screen
        name="crm"
        options={{
          title: 'CRM',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          tabBarAccessibilityLabel: 'CRM',
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'Calendar',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'More',
        }}
      />
    </Tabs>
  );
}
