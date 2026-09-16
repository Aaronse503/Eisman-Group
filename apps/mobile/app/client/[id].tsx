import * as React from 'react';
import { Linking, Pressable, RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fmtDate, fmtDateTime, formatCurrency } from '@eisman/shared';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import {
  Badge,
  Body,
  Button,
  Card,
  DemoBadge,
  EmptyState,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  SectionTitle,
  SourceNote,
} from '@/components/ui';

/** One client: the figures, who to call, what is open, and recent notes. */
export default function ClientScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const detail = useQuery(`client.${id}`, () => api.client(id!), [id]);
  const client = detail.data?.client;

  const healthTone = (score: number) =>
    score >= 80 ? 'success' : score >= 60 ? 'neutral' : score >= 40 ? 'warning' : 'danger';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={detail.refreshing}
          onRefresh={() => void detail.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      {detail.loading && !detail.data ? <Loading /> : null}
      {detail.error && !detail.data ? <ErrorNote message={detail.error} /> : null}

      {client ? (
        <>
          <Row gap={8} wrap>
            <Heading>{String(client.name)}</Heading>
            <DemoBadge show={client.isDemo} />
          </Row>
          <Body muted>
            {[client.companyName, client.ownerName].filter(Boolean).join(' · ')}
          </Body>

          <Row gap={6} wrap style={{ marginTop: theme.spacing.md }}>
            <Badge tone={healthTone(Number(client.healthScore))}>
              Health {String(client.healthScore)}
            </Badge>
            <Badge tone="neutral">{String(client.status)}</Badge>
            <Badge tone="neutral">{String(client.stage)}</Badge>
          </Row>

          <Card style={{ marginTop: theme.spacing.lg }}>
            <Row justify="space-between">
              <Body muted size="sm">
                Monthly retainer
              </Body>
              <Body style={{ fontWeight: '700' }}>
                {formatCurrency(Number(client.monthlyRetainer ?? 0))}
              </Body>
            </Row>
            <Row justify="space-between" style={{ marginTop: theme.spacing.sm }}>
              <Body muted size="sm">
                Outstanding
              </Body>
              <Body style={{ fontWeight: '700' }}>
                {formatCurrency(Number(client.outstanding ?? 0))}
              </Body>
            </Row>
            {client.renewalDate ? (
              <Row justify="space-between" style={{ marginTop: theme.spacing.sm }}>
                <Body muted size="sm">
                  Renewal
                </Body>
                <Body style={{ fontWeight: '600' }}>{fmtDate(String(client.renewalDate))}</Body>
              </Row>
            ) : null}
          </Card>

          {client.nextAction ? (
            <Card style={{ marginTop: theme.spacing.md }}>
              <Body size="sm" muted>
                Next action
              </Body>
              <Body>{String(client.nextAction)}</Body>
            </Card>
          ) : null}

          {client.risks ? (
            <Card style={{ marginTop: theme.spacing.md }}>
              <Body size="sm" style={{ color: theme.colors.warning, fontWeight: '600' }}>
                Risks
              </Body>
              <Body>{String(client.risks)}</Body>
            </Card>
          ) : null}

          <Button
            label="Add a note"
            icon="create-outline"
            variant="secondary"
            style={{ marginTop: theme.spacing.lg }}
            onPress={() =>
              router.push({
                pathname: '/create/note',
                params: { entityType: 'client', entityId: String(client.id), label: String(client.name) },
              })
            }
          />

          <SectionTitle>Contacts</SectionTitle>
          {detail.data?.contacts.length ? (
            <Card style={{ padding: 0 }}>
              {detail.data.contacts.map((contact, index) => (
                <View
                  key={contact.id}
                  style={{
                    padding: theme.spacing.lg,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.border,
                  }}
                >
                  <Row justify="space-between">
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontWeight: '600' }}>{contact.fullName}</Body>
                      <Body subtle size="sm">
                        {contact.title ?? ''}
                      </Body>
                    </View>
                    <Row gap={4}>
                      {contact.phone ? (
                        <Pressable
                          onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${contact.fullName}`}
                          style={{ minWidth: theme.minTouchTarget, minHeight: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name="call-outline" size={20} color={theme.colors.accent} />
                        </Pressable>
                      ) : null}
                      {contact.email ? (
                        <Pressable
                          onPress={() => void Linking.openURL(`mailto:${contact.email}`)}
                          accessibilityRole="button"
                          accessibilityLabel={`Email ${contact.fullName}`}
                          style={{ minWidth: theme.minTouchTarget, minHeight: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name="mail-outline" size={20} color={theme.colors.accent} />
                        </Pressable>
                      ) : null}
                    </Row>
                  </Row>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState title="No contacts yet" icon="people-outline" />
          )}

          <SectionTitle>Open tasks</SectionTitle>
          {detail.data?.tasks.length ? (
            <Card style={{ padding: 0 }}>
              {detail.data.tasks.map((task, index) => (
                <Pressable
                  key={task.id}
                  onPress={() => router.push(`/task/${task.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${task.title}`}
                  style={({ pressed }) => ({
                    padding: theme.spacing.lg,
                    minHeight: theme.minTouchTarget,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.border,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Body>{task.title}</Body>
                  {task.dueAt ? (
                    <Body subtle size="sm">
                      Due {fmtDate(task.dueAt)}
                    </Body>
                  ) : null}
                </Pressable>
              ))}
            </Card>
          ) : (
            <EmptyState title="Nothing open" icon="checkmark-done-outline" />
          )}

          <SectionTitle>Recent notes</SectionTitle>
          {detail.data?.notes.length ? (
            <View style={{ gap: theme.spacing.md }}>
              {detail.data.notes.map((note) => (
                <Card key={note.id}>
                  <Row gap={8} justify="space-between">
                    <Body style={{ fontWeight: '600', flex: 1 }}>{note.title}</Body>
                    <DemoBadge show={note.isDemo} />
                  </Row>
                  <Body size="sm" muted numberOfLines={4}>
                    {note.body}
                  </Body>
                  <Body subtle size="sm" style={{ marginTop: 4 }}>
                    {[note.authorName, fmtDateTime(note.createdAt)].filter(Boolean).join(' · ')}
                  </Body>
                </Card>
              ))}
            </View>
          ) : (
            <EmptyState title="No notes yet" description="Write one, or dictate it." icon="document-text-outline" />
          )}

          <SourceNote source="CRM records in this system" stale={detail.stale} at={detail.fetchedAt} />
        </>
      ) : null}
    </Screen>
  );
}
