import * as React from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DashboardMetric } from '@eisman/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import {
  Badge,
  Body,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  SectionTitle,
  SourceNote,
} from '@/components/ui';
import { SyncBanner } from '@/components/sync-banner';

/** The holdings dashboard: the same figures the web application shows. */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scope, user, demoMode } = useSession();

  const dashboard = useQuery(`dashboard.${scope}`, () => api.dashboard(scope), [scope]);
  const activity = useQuery(`activity.${scope}`, () => api.activity(scope, 8), [scope]);

  const toneColor = (tone: DashboardMetric['tone']) =>
    tone === 'danger'
      ? theme.colors.danger
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'success'
          ? theme.colors.success
          : theme.colors.fg;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={dashboard.refreshing}
          onRefresh={() => {
            void dashboard.refresh();
            void activity.refresh();
          }}
          tintColor={theme.colors.accent}
        />
      }
    >
      <SyncBanner />

      <View style={{ gap: 4, marginBottom: theme.spacing.md }}>
        <Heading>{dashboard.data?.scope.label ?? 'Eisman Holdings'}</Heading>
        <Body muted size="sm">
          {user ? `Signed in as ${user.name}` : ''}
          {dashboard.data ? ` · ${dashboard.data.range.label}` : ''}
        </Body>
      </View>

      {dashboard.loading && !dashboard.data ? <Loading label="Loading your figures" /> : null}
      {dashboard.error && !dashboard.data ? <ErrorNote message={dashboard.error} /> : null}

      {dashboard.data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
            {dashboard.data.headline.map((metric) => (
              <Card
                key={metric.key}
                style={{ flexGrow: 1, flexBasis: '46%', minWidth: 150 }}
                accessibilityLabel={`${metric.label}: ${metric.value}`}
              >
                <Body subtle size="sm" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>
                  {metric.label}
                </Body>
                <Body style={{ fontSize: theme.fontSize.xl, fontWeight: '700', marginTop: 2, color: toneColor(metric.tone) }}>
                  {metric.value}
                </Body>
                {typeof metric.deltaPercent === 'number' ? (
                  <Row gap={4} style={{ marginTop: 2 }}>
                    <Ionicons
                      name={metric.deltaPercent >= 0 ? 'arrow-up' : 'arrow-down'}
                      size={12}
                      color={metric.deltaPercent >= 0 ? theme.colors.success : theme.colors.danger}
                    />
                    <Body size="sm" muted>
                      {Math.abs(metric.deltaPercent).toFixed(1)}% {metric.hint ?? ''}
                    </Body>
                  </Row>
                ) : metric.hint ? (
                  <Body subtle size="sm" style={{ marginTop: 2 }}>
                    {metric.hint}
                  </Body>
                ) : null}
              </Card>
            ))}
          </View>

          <SectionTitle>Also worth knowing</SectionTitle>
          <Card style={{ padding: 0 }}>
            {dashboard.data.supporting.map((metric, index) => (
              <View
                key={metric.key}
                style={{
                  padding: theme.spacing.lg,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Row justify="space-between">
                  <Body muted size="sm">
                    {metric.label}
                  </Body>
                  <Body style={{ fontWeight: '700', color: toneColor(metric.tone) }}>{metric.value}</Body>
                </Row>
                {metric.hint ? (
                  <Body subtle size="sm">
                    {metric.hint}
                  </Body>
                ) : null}
              </View>
            ))}
          </Card>
          <SourceNote source={dashboard.data.source} stale={dashboard.stale} at={dashboard.fetchedAt} />

          {dashboard.data.parfax ? (
            <>
              <Row justify="space-between" style={{ marginTop: theme.spacing.lg }}>
                <SectionTitle>ParFax platform</SectionTitle>
                <Pressable
                  onPress={() => router.push('/parfax/metrics')}
                  accessibilityRole="button"
                  accessibilityLabel="Open all ParFax metrics"
                  style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
                >
                  <Body size="sm" style={{ color: theme.colors.accent, fontWeight: '600' }}>
                    All metrics
                  </Body>
                </Pressable>
              </Row>
              <Card style={{ padding: 0 }}>
                {dashboard.data.parfax.map((metric, index) => (
                  <View
                    key={metric.key}
                    style={{
                      padding: theme.spacing.lg,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: theme.colors.border,
                    }}
                  >
                    <Row justify="space-between">
                      <Body muted size="sm">
                        {metric.label}
                      </Body>
                      <Body style={{ fontWeight: '700' }}>{metric.value}</Body>
                    </Row>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {demoMode && dashboard.data.includesDemoData ? (
            <View style={{ marginTop: theme.spacing.md }}>
              <Badge tone="gold">These figures include demo data</Badge>
            </View>
          ) : null}
        </>
      ) : null}

      <SectionTitle>Recent activity</SectionTitle>
      {activity.data?.items.length ? (
        <Card style={{ padding: 0 }}>
          {activity.data.items.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                padding: theme.spacing.lg,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Body size="sm">{entry.summary}</Body>
              <Body subtle size="sm">
                {[entry.actorName, entry.companyName].filter(Boolean).join(' · ')}
              </Body>
            </View>
          ))}
        </Card>
      ) : activity.loading ? (
        <Loading label="Loading activity" />
      ) : (
        <EmptyState title="Nothing yet" description="Changes will appear here as they happen." />
      )}
    </Screen>
  );
}
