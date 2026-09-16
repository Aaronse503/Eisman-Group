import * as React from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatCurrency } from '@eisman/shared';
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
  SourceNote,
} from '@/components/ui';

type Tab = 'clients' | 'contacts';

export default function CrmScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scope } = useSession();
  const [tab, setTab] = React.useState<Tab>('clients');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const clients = useQuery(
    `clients.${scope}.${debounced}`,
    () => api.clients({ company: scope, q: debounced || undefined }),
    [scope, debounced],
  );
  const contacts = useQuery(
    `contacts.${scope}.${debounced}`,
    () => api.contacts({ company: scope, q: debounced || undefined }),
    [scope, debounced],
  );

  const active = tab === 'clients' ? clients : contacts;

  const healthTone = (score: number) =>
    score >= 80 ? 'success' : score >= 60 ? 'neutral' : score >= 40 ? 'warning' : 'danger';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={active.refreshing}
          onRefresh={() => void active.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={tab === 'clients' ? 'Search clients' : 'Search contacts'}
        placeholderTextColor={theme.colors.fgSubtle}
        accessibilityLabel={tab === 'clients' ? 'Search clients' : 'Search contacts'}
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: theme.spacing.md }}
      >
        {(['clients', 'contacts'] as Tab[]).map((option) => {
          const selected = option === tab;
          return (
            <Pressable
              key={option}
              onPress={() => setTab(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option === 'clients' ? 'Clients' : 'Contacts'}
              style={{
                minHeight: theme.minTouchTarget,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
              }}
            >
              <Body
                size="sm"
                style={{
                  fontWeight: '600',
                  color: selected ? theme.colors.accentSoftFg : theme.colors.fgMuted,
                }}
              >
                {option === 'clients' ? 'Clients' : 'Contacts'}
              </Body>
            </Pressable>
          );
        })}
      </ScrollView>

      {active.loading && !active.data ? <Loading /> : null}
      {active.error && !active.data ? <ErrorNote message={active.error} /> : null}

      {tab === 'clients' ? (
        <View style={{ gap: theme.spacing.md }}>
          {clients.data?.items.length === 0 ? (
            <EmptyState title="No clients" description="Nothing matches that search." icon="briefcase-outline" />
          ) : null}
          {clients.data?.items.map((client) => (
            <Card
              key={client.id}
              onPress={() => router.push(`/client/${client.id}`)}
              accessibilityLabel={`${client.name}, ${client.status}. Open client`}
            >
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, gap: 4 }}>
                  <Body style={{ fontWeight: '600' }}>{client.name}</Body>
                  <Body subtle size="sm">
                    {[client.companyName, client.ownerName].filter(Boolean).join(' · ')}
                  </Body>
                  <Row gap={6} wrap>
                    <Badge tone={healthTone(client.healthScore)}>Health {client.healthScore}</Badge>
                    <Badge tone="neutral">{client.status}</Badge>
                    {client.openTasks > 0 ? <Badge tone="info">{client.openTasks} tasks</Badge> : null}
                    <DemoBadge show={client.isDemo} />
                  </Row>
                </View>
                {client.monthlyRetainer > 0 ? (
                  <Body style={{ fontWeight: '700' }}>
                    {formatCurrency(client.monthlyRetainer)}
                    <Body subtle size="sm">
                      /mo
                    </Body>
                  </Body>
                ) : null}
              </Row>
            </Card>
          ))}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {contacts.data?.items.length === 0 ? (
            <EmptyState title="No contacts" description="Nothing matches that search." icon="people-outline" />
          ) : null}
          {contacts.data?.items.map((contact) => (
            <Card
              key={contact.id}
              onPress={() => router.push(`/contact/${contact.id}`)}
              accessibilityLabel={`${contact.fullName}. Open contact`}
            >
              <View style={{ gap: 4 }}>
                <Row gap={8} justify="space-between">
                  <Body style={{ fontWeight: '600' }}>{contact.fullName}</Body>
                  <DemoBadge show={contact.isDemo} />
                </Row>
                <Body muted size="sm">
                  {[contact.title, contact.organizationName].filter(Boolean).join(' · ')}
                </Body>
                {contact.email ? (
                  <Body subtle size="sm">
                    {contact.email}
                  </Body>
                ) : null}
                {contact.clientNames.length ? (
                  <Row gap={6} wrap>
                    {contact.clientNames.slice(0, 3).map((name) => (
                      <Badge key={name} tone="accent">
                        {name}
                      </Badge>
                    ))}
                  </Row>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}

      {active.data ? (
        <SourceNote source="CRM records in this system" stale={active.stale} at={active.fetchedAt} />
      ) : null}
    </Screen>
  );
}
