import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body } from '@/components/ui';

/**
 * Which company a new record belongs to.
 *
 * Only companies the person may write to are offered, so a choice that would
 * be refused never appears. With one company it picks itself.
 */
export function CompanyPicker({
  value,
  onChange,
  permission = 'crm:write',
}: {
  value: string | null;
  onChange: (companyId: string) => void;
  permission?: Parameters<ReturnType<typeof useSession>['can']>[0];
}) {
  const theme = useTheme();
  const { companies, can } = useSession();
  const allowed = companies.filter((company) => can(permission, company.id));

  React.useEffect(() => {
    if (!value && allowed.length === 1) onChange(allowed[0]!.id);
  }, [value, allowed, onChange]);

  if (allowed.length <= 1) return null;

  return (
    <View style={{ gap: 6 }}>
      <Body size="sm" style={{ fontWeight: '600' }}>
        Company
      </Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {allowed.map((company) => {
          const selected = company.id === value;
          return (
            <Pressable
              key={company.id}
              onPress={() => onChange(company.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={company.name}
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
                {company.name}
              </Body>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
