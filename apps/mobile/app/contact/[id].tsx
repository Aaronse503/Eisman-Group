import * as React from 'react';
import { Linking, RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import {
  Badge,
  Body,
  Button,
  Card,
  DemoBadge,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  SectionTitle,
} from '@/components/ui';

export default function ContactScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery(`contact.${id}`, () => api.contact(id!), [id]);
  const contact = detail.data?.contact;

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

      {contact ? (
        <>
          <Row gap={8} wrap>
            <Heading>{String(contact.fullName)}</Heading>
            <DemoBadge show={contact.isDemo} />
          </Row>
          <Body muted>
            {[contact.title, contact.organizationName].filter(Boolean).map(String).join(' · ')}
          </Body>

          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
            {contact.phone ? (
              <Button
                label={String(contact.phone)}
                icon="call-outline"
                variant="secondary"
                onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
              />
            ) : null}
            {contact.email ? (
              <Button
                label={String(contact.email)}
                icon="mail-outline"
                variant="secondary"
                onPress={() => void Linking.openURL(`mailto:${contact.email}`)}
              />
            ) : null}
          </View>

          <Card style={{ marginTop: theme.spacing.lg }}>
            <Row justify="space-between">
              <Body muted size="sm">
                Company
              </Body>
              <Body>{String(contact.companyName)}</Body>
            </Row>
            {contact.city || contact.country ? (
              <Row justify="space-between" style={{ marginTop: theme.spacing.sm }}>
                <Body muted size="sm">
                  Location
                </Body>
                <Body>{[contact.city, contact.country].filter(Boolean).map(String).join(', ')}</Body>
              </Row>
            ) : null}
          </Card>

          {detail.data?.clients.length ? (
            <>
              <SectionTitle>Clients</SectionTitle>
              <Row gap={6} wrap>
                {detail.data.clients.map((client) => (
                  <Badge key={client.id} tone="accent">
                    {client.name}
                  </Badge>
                ))}
              </Row>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
