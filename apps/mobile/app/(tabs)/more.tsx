import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { API_URL } from '@/lib/api';
import { Badge, Body, Card, Row, Screen, SectionTitle } from '@/components/ui';
import type { Permission } from '@eisman/shared';

interface Destination {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  permission?: Permission;
}

const DESTINATIONS: Destination[] = [
  {
    label: 'Search everything',
    description: 'Clients, contacts, tasks, documents, notes and more',
    icon: 'search-outline',
    route: '/search',
  },
  {
    label: 'Investor pipeline',
    description: 'Stages, values and who is following up',
    icon: 'trending-up-outline',
    route: '/pipeline/investor',
    permission: 'investor:read',
  },
  {
    label: 'Partnership pipeline',
    description: 'Partnerships from first contact to launched',
    icon: 'git-merge-outline',
    route: '/pipeline/partnership',
    permission: 'partnership:read',
  },
  {
    label: 'ParFax metrics',
    description: 'Users, subscriptions, scans and churn',
    icon: 'stats-chart-outline',
    route: '/parfax/metrics',
    permission: 'parfax:read',
  },
  {
    label: 'ParFax user lookup',
    description: 'Find a platform user to answer a question',
    icon: 'person-circle-outline',
    route: '/parfax/users',
    permission: 'parfax:read',
  },
  {
    label: 'Sync',
    description: 'What is waiting to send, and what failed',
    icon: 'sync-outline',
    route: '/sync',
  },
  {
    label: 'Settings',
    description: 'Unlocking, notifications, appearance and your account',
    icon: 'settings-outline',
    route: '/settings',
  },
];

/**
 * Everything that does not deserve a tab.
 *
 * Administration, imports, financial reporting, integration setup, permissions
 * and the organization chart are deliberately absent: they are on the desktop,
 * where there is room to do them carefully.
 */
export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, can, queuedChanges, demoMode } = useSession();

  const available = DESTINATIONS.filter((d) => !d.permission || can(d.permission));

  return (
    <Screen>
      <Card>
        <Row gap={theme.spacing.md}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Body style={{ fontWeight: '700', color: theme.colors.accentSoftFg }}>
              {(user?.name ?? '?')
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('')}
            </Body>
          </View>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>{user?.name}</Body>
            <Body subtle size="sm">
              {user?.email}
            </Body>
          </View>
        </Row>
        {demoMode ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Badge tone="gold">This workspace contains demo data</Badge>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Go to</SectionTitle>
      <Card style={{ padding: 0 }}>
        {available.map((destination, index) => (
          <Pressable
            key={destination.route}
            onPress={() => router.push(destination.route as never)}
            accessibilityRole="button"
            accessibilityLabel={`${destination.label}. ${destination.description}`}
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget + 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name={destination.icon} size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '600' }}>{destination.label}</Body>
              <Body subtle size="sm">
                {destination.description}
              </Body>
            </View>
            {destination.route === '/sync' && queuedChanges > 0 ? (
              <Badge tone="warning">{queuedChanges}</Badge>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={theme.colors.fgSubtle} />
          </Pressable>
        ))}
      </Card>

      <SectionTitle>On the desktop</SectionTitle>
      <Card>
        <Body muted size="sm">
          Imports, financial reporting, integration setup, permissions, the organization chart and
          the audit log live in the web application. They need room to be done carefully, so they
          are not squeezed onto a phone.
        </Body>
        <Body subtle size="sm" style={{ marginTop: theme.spacing.sm }}>
          {API_URL}
        </Body>
      </Card>
    </Screen>
  );
}
