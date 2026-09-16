import * as React from 'react';
import { Linking, Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MeetingSummary } from '@eisman/shared';
import { fmtDate, fmtTime } from '@eisman/shared';
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

/** Upcoming meetings, grouped by day. */
export default function CalendarScreen() {
  const theme = useTheme();
  const { scope } = useSession();

  const meetings = useQuery(`meetings.${scope}`, () => api.meetings({ company: scope }), [scope]);

  const byDay = React.useMemo(() => {
    const groups = new Map<string, MeetingSummary[]>();
    for (const meeting of meetings.data?.items ?? []) {
      const key = meeting.startsAt.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), meeting]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [meetings.data]);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={meetings.refreshing}
          onRefresh={() => void meetings.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      {meetings.loading && !meetings.data ? <Loading label="Loading your calendar" /> : null}
      {meetings.error && !meetings.data ? <ErrorNote message={meetings.error} /> : null}

      {meetings.data?.items.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description="No meetings in the next fortnight."
          icon="calendar-outline"
        />
      ) : null}

      {byDay.map(([day, items]) => (
        <View key={day}>
          <SectionTitle>{fmtDate(day, 'EEEE, MMM d')}</SectionTitle>
          <View style={{ gap: theme.spacing.md }}>
            {items.map((meeting) => (
              <Card key={meeting.id}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, gap: 4 }}>
                    <Body style={{ fontWeight: '600' }}>{meeting.title}</Body>
                    <Body muted size="sm">
                      {fmtTime(meeting.startsAt)}
                      {meeting.endsAt ? ` – ${fmtTime(meeting.endsAt)}` : ''}
                    </Body>
                    <Body subtle size="sm">
                      {[meeting.clientName, meeting.companyName].filter(Boolean).join(' · ')}
                    </Body>
                    <Row gap={6} wrap>
                      {meeting.participantCount > 0 ? (
                        <Badge tone="neutral">{meeting.participantCount} attending</Badge>
                      ) : null}
                      {meeting.location ? <Badge tone="neutral">{meeting.location}</Badge> : null}
                      <DemoBadge show={meeting.isDemo} />
                    </Row>
                  </View>

                  {meeting.conferenceUrl ? (
                    <Pressable
                      onPress={() => void Linking.openURL(meeting.conferenceUrl!)}
                      accessibilityRole="button"
                      accessibilityLabel={`Join ${meeting.title}`}
                      style={{
                        minHeight: theme.minTouchTarget,
                        minWidth: theme.minTouchTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="videocam-outline" size={22} color={theme.colors.accent} />
                    </Pressable>
                  ) : null}
                </Row>
              </Card>
            ))}
          </View>
        </View>
      ))}

      {meetings.data ? (
        <SourceNote
          source="Meetings in this system. Connect Google Calendar on the desktop to include external events."
          stale={meetings.stale}
          at={meetings.fetchedAt}
        />
      ) : null}
    </Screen>
  );
}
