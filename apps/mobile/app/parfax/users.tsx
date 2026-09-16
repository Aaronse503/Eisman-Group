import * as React from 'react';
import { RefreshControl, TextInput, View } from 'react-native';
import { fmtDate } from '@eisman/shared';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import {
  Badge,
  Body,
  Card,
  DemoBadge,
  EmptyState,
  ErrorNote,
  Loading,
  Row,
  Screen,
  SourceNote,
} from '@/components/ui';

/** ParFax user lookup — enough to answer a support question from a phone. */
export default function ParfaxUsersScreen() {
  const theme = useTheme();
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const users = useQuery(
    `parfax.users.${debounced}`,
    () => api.parfaxUsers({ q: debounced || undefined, limit: 40 }),
    [debounced],
  );

  const statusTone = (status: string) =>
    status === 'active' ? 'success' : status === 'suspended' ? 'danger' : 'neutral';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={users.refreshing}
          onRefresh={() => void users.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Email, name or handle"
        placeholderTextColor={theme.colors.fgSubtle}
        accessibilityLabel="Search ParFax users"
        autoCapitalize="none"
        style={{
          minHeight: theme.minTouchTarget,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          fontSize: theme.fontSize.base,
          color: theme.colors.fg,
          backgroundColor: theme.colors.surface,
          marginBottom: theme.spacing.md,
        }}
      />

      {users.loading && !users.data ? <Loading /> : null}
      {users.error && !users.data ? <ErrorNote message={users.error} /> : null}
      {users.data?.items.length === 0 ? (
        <EmptyState title="No users found" icon="person-outline" />
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        {users.data?.items.map((user) => (
          <Card key={user.id}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 4 }}>
                <Body style={{ fontWeight: '600' }}>{user.name ?? user.email}</Body>
                {user.name ? (
                  <Body subtle size="sm">
                    {user.email}
                  </Body>
                ) : null}
                <Row gap={6} wrap>
                  <Badge tone={statusTone(user.status)}>{user.status}</Badge>
                  <Badge tone={user.plan === 'free' ? 'neutral' : 'accent'}>{user.plan}</Badge>
                  <DemoBadge show={user.isDemo} />
                </Row>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Body style={{ fontWeight: '700' }}>{user.scanCount}</Body>
                <Body subtle size="sm">
                  scans
                </Body>
              </View>
            </Row>
            <Body subtle size="sm" style={{ marginTop: theme.spacing.sm }}>
              Joined {fmtDate(user.signupAt)}
              {user.lastActiveAt ? ` · last active ${fmtDate(user.lastActiveAt)}` : ' · never active'}
            </Body>
          </Card>
        ))}
      </View>

      {users.data ? (
        <SourceNote
          source="ParFax platform records in this system. Suspending or changing an account is done on the desktop."
          stale={users.stale}
          at={users.fetchedAt}
        />
      ) : null}
    </Screen>
  );
}
