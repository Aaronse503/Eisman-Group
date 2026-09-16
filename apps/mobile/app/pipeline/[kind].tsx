import * as React from 'react';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { fmtDate, formatCurrency } from '@eisman/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
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
  SectionTitle,
  SourceNote,
} from '@/components/ui';

/** The investor or partnership pipeline, grouped by stage. */
export default function PipelineScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const { scope } = useSession();
  const pipelineKind = kind === 'investor' ? 'investor' : 'partnership';

  React.useEffect(() => {
    navigation.setOptions({
      title: pipelineKind === 'investor' ? 'Investor pipeline' : 'Partnership pipeline',
    });
  }, [navigation, pipelineKind]);

  const pipeline = useQuery(
    `pipeline.${pipelineKind}.${scope}`,
    () => api.pipeline(pipelineKind, scope),
    [pipelineKind, scope],
  );

  const grouped = React.useMemo(() => {
    const groups = new Map<string, typeof items>();
    const items = pipeline.data?.items ?? [];
    for (const item of items) {
      groups.set(item.stage, [...(groups.get(item.stage) ?? []), item]);
    }
    return [...groups.entries()];
  }, [pipeline.data]);

  const total = (pipeline.data?.items ?? []).reduce((sum, item) => sum + item.value, 0);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={pipeline.refreshing}
          onRefresh={() => void pipeline.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      {pipeline.loading && !pipeline.data ? <Loading /> : null}
      {pipeline.error && !pipeline.data ? <ErrorNote message={pipeline.error} /> : null}

      {pipeline.data ? (
        <Card>
          <Row justify="space-between">
            <Body muted size="sm">
              Total in pipeline
            </Body>
            <Body style={{ fontWeight: '700', fontSize: theme.fontSize.lg }}>
              {formatCurrency(total, 'USD', { compact: true })}
            </Body>
          </Row>
          <Body subtle size="sm">
            {pipeline.data.items.length} open · recorded amounts, not weighted by probability
          </Body>
        </Card>
      ) : null}

      {pipeline.data?.items.length === 0 ? (
        <EmptyState title="Nothing in the pipeline" icon="trending-up-outline" />
      ) : null}

      {grouped.map(([stage, items]) => (
        <View key={stage}>
          <SectionTitle>{stage.replace(/_/g, ' ')}</SectionTitle>
          <View style={{ gap: theme.spacing.md }}>
            {items.map((item) => (
              <Card key={item.id}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, gap: 4 }}>
                    <Row gap={8}>
                      <Body style={{ fontWeight: '600' }}>{item.name}</Body>
                      <DemoBadge show={item.isDemo} />
                    </Row>
                    <Body subtle size="sm">
                      {item.ownerName ? `Owned by ${item.ownerName}` : 'Unassigned'}
                    </Body>
                    {item.nextFollowUpAt ? (
                      <Badge tone="info">Follow up {fmtDate(item.nextFollowUpAt)}</Badge>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Body style={{ fontWeight: '700' }}>
                      {formatCurrency(item.value, 'USD', { compact: true })}
                    </Body>
                    {item.probability !== null ? (
                      <Body subtle size="sm">
                        {item.probability}% likely
                      </Body>
                    ) : null}
                  </View>
                </Row>
              </Card>
            ))}
          </View>
        </View>
      ))}

      {pipeline.data ? (
        <SourceNote
          source="Pipeline records in this system"
          stale={pipeline.stale}
          at={pipeline.fetchedAt}
        />
      ) : null}
    </Screen>
  );
}
