import * as React from 'react';
import { RefreshControl, View } from 'react-native';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import { Badge, Body, Card, ErrorNote, Loading, Row, Screen, SourceNote } from '@/components/ui';

/**
 * ParFax platform metrics.
 *
 * The connection state is shown alongside: these figures come from platform
 * records in this system, and the card says so rather than implying a live
 * feed from a service that may not be connected.
 */
export default function ParfaxMetricsScreen() {
  const theme = useTheme();
  const metrics = useQuery('parfax.metrics', () => api.parfaxMetrics(), []);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={metrics.refreshing}
          onRefresh={() => void metrics.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      {metrics.loading && !metrics.data ? <Loading /> : null}
      {metrics.error && !metrics.data ? <ErrorNote message={metrics.error} /> : null}

      {metrics.data ? (
        <>
          <Row justify="space-between" style={{ marginBottom: theme.spacing.md }}>
            <Body muted size="sm">
              {metrics.data.range.label}
            </Body>
            <Badge tone={metrics.data.connection.status === 'connected' ? 'success' : 'neutral'}>
              ParFax CRM: {metrics.data.connection.status}
            </Badge>
          </Row>

          <View style={{ gap: theme.spacing.md }}>
            {metrics.data.metrics.map((metric) => (
              <Card key={metric.key}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1 }}>
                    <Body muted size="sm">
                      {metric.label}
                    </Body>
                    {metric.hint ? (
                      <Body subtle size="sm">
                        {metric.hint}
                      </Body>
                    ) : null}
                  </View>
                  <Body
                    style={{
                      fontSize: theme.fontSize.lg,
                      fontWeight: '700',
                      color:
                        metric.tone === 'warning'
                          ? theme.colors.warning
                          : metric.tone === 'danger'
                            ? theme.colors.danger
                            : theme.colors.fg,
                    }}
                  >
                    {metric.value}
                  </Body>
                </Row>
              </Card>
            ))}
          </View>

          <SourceNote source={metrics.data.source} stale={metrics.stale} at={metrics.fetchedAt} />
        </>
      ) : null}
    </Screen>
  );
}
