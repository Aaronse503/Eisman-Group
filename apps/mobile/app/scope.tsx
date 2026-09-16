import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body, Card, DemoBadge, Row, Screen, SectionTitle } from '@/components/ui';

/** Switching between the consolidated view and one company. */
export default function ScopeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scope, setScope, companies } = useSession();

  const choose = (next: string) => {
    setScope(next);
    router.back();
  };

  const options = [
    { slug: 'holdings', name: 'Eisman Holdings', subtitle: 'Everything you can see', isDemo: false, color: null as string | null },
    ...companies.map((company) => ({
      slug: company.slug,
      name: company.name,
      subtitle: 'One company',
      isDemo: company.isDemo,
      color: company.brandColor,
    })),
  ];

  return (
    <Screen>
      <SectionTitle>Workspace</SectionTitle>
      <Card style={{ padding: 0 }}>
        {options.map((option, index) => {
          const selected = option.slug === scope;
          return (
            <Pressable
              key={option.slug}
              onPress={() => choose(option.slug)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.name}. ${option.subtitle}`}
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
              {option.color ? (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: option.color }} />
              ) : (
                <Ionicons name="layers-outline" size={16} color={theme.colors.gold} />
              )}
              <View style={{ flex: 1 }}>
                <Row gap={8}>
                  <Body style={{ fontWeight: '600' }}>{option.name}</Body>
                  <DemoBadge show={option.isDemo} />
                </Row>
                <Body subtle size="sm">
                  {option.subtitle}
                </Body>
              </View>
              {selected ? (
                <Ionicons name="checkmark" size={18} color={theme.colors.accent} />
              ) : null}
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
