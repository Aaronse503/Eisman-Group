import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/** The company switcher, in the header where the web application puts it. */
export function ScopeButton() {
  const theme = useTheme();
  const router = useRouter();
  const { scope, companies } = useSession();
  const active = companies.find((c) => c.slug === scope);
  const label = active ? active.name : 'Holdings';

  return (
    <Pressable
      onPress={() => router.push('/scope')}
      accessibilityRole="button"
      accessibilityLabel={`Workspace: ${label}. Change workspace`}
      style={({ pressed }) => ({
        minHeight: theme.minTouchTarget,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {active ? (
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: active.brandColor || theme.colors.accent,
            }}
          />
        ) : (
          <Ionicons name="layers-outline" size={15} color={theme.colors.gold} />
        )}
        <Text
          numberOfLines={1}
          style={{ maxWidth: 120, fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.fg }}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={13} color={theme.colors.fgSubtle} />
      </View>
    </Pressable>
  );
}
