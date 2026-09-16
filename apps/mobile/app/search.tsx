import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SearchHit } from '@eisman/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Badge, Body, DemoBadge, EmptyState, ErrorNote, Loading, Row, Screen } from '@/components/ui';

/** Global search across everything the person can reach. */
export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scope } = useSession();

  const [term, setTerm] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.search(trimmed, scope, 6);
        if (!cancelled) {
          setHits(result.items);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Search needs a connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, scope]);

  /** Where a hit opens. Types without a mobile screen go to the list. */
  const open = (hit: SearchHit) => {
    if (hit.type === 'client') router.push(`/client/${hit.id}`);
    else if (hit.type === 'contact') router.push(`/contact/${hit.id}`);
    else if (hit.type === 'task') router.push(`/task/${hit.id}`);
    else if (hit.type === 'investor') router.push('/pipeline/investor');
    else if (hit.type === 'partnership') router.push('/pipeline/partnership');
    else if (hit.type === 'parfax_user') router.push('/parfax/users');
  };

  return (
    <Screen>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder="Clients, contacts, tasks, documents…"
        placeholderTextColor={theme.colors.fgSubtle}
        accessibilityLabel="Search everything"
        autoFocus
        autoCapitalize="none"
        style={{
          minHeight: theme.minTouchTarget,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          fontSize: theme.fontSize.md,
          color: theme.colors.fg,
          backgroundColor: theme.colors.surface,
        }}
      />

      {loading ? <Loading label="Searching" /> : null}
      {error ? <ErrorNote message={error} /> : null}
      {!loading && term.trim().length >= 2 && hits.length === 0 && !error ? (
        <EmptyState title="Nothing found" description={`No records match “${term.trim()}”.`} icon="search-outline" />
      ) : null}

      <View style={{ marginTop: theme.spacing.md }}>
        {hits.map((hit) => (
          <Pressable
            key={`${hit.type}-${hit.id}`}
            onPress={() => open(hit)}
            accessibilityRole="button"
            accessibilityLabel={`${hit.title}, ${hit.type.replace('_', ' ')}`}
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget + 10,
              justifyContent: 'center',
              paddingVertical: theme.spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }} numberOfLines={1}>
                  {hit.title}
                </Body>
                {hit.subtitle ? (
                  <Body subtle size="sm" numberOfLines={1}>
                    {hit.subtitle}
                  </Body>
                ) : null}
                <Row gap={6} style={{ marginTop: 4 }}>
                  <Badge tone="accent">{hit.type.replace('_', ' ')}</Badge>
                  {hit.companyName ? <Badge tone="neutral">{hit.companyName}</Badge> : null}
                  <DemoBadge show={hit.isDemo} />
                </Row>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.fgSubtle} />
            </Row>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
