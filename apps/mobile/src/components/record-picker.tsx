import * as React from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Body, EmptyState } from '@/components/ui';

export interface RecordOption {
  type: string;
  id: string;
  label: string;
}

/** Choose the record something attaches to. */
export function RecordPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: RecordOption | null;
  options: RecordOption[];
  onChange: (option: RecordOption) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <View style={{ gap: 6 }}>
      <Body size="sm" style={{ fontWeight: '600' }}>
        {label}
      </Body>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value.label}. Change` : `Choose ${label}`}
        style={{
          minHeight: theme.minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Body style={{ color: value ? theme.colors.fg : theme.colors.fgSubtle }}>
          {value ? value.label : 'Choose a record'}
        </Body>
        <Ionicons name="chevron-down" size={16} color={theme.colors.fgSubtle} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg, paddingTop: 60 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={theme.colors.fgSubtle}
              accessibilityLabel="Search records"
              autoFocus
              style={{
                flex: 1,
                minHeight: theme.minTouchTarget,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.md,
                color: theme.colors.fg,
                backgroundColor: theme.colors.surface,
              }}
            />
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
            >
              <Body style={{ color: theme.colors.accent, fontWeight: '600' }}>Close</Body>
            </Pressable>
          </View>

          <ScrollView style={{ marginTop: theme.spacing.md }}>
            {filtered.length === 0 ? <EmptyState title="Nothing matches" /> : null}
            {filtered.map((option) => (
              <Pressable
                key={`${option.type}-${option.id}`}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                style={({ pressed }) => ({
                  minHeight: theme.minTouchTarget + 6,
                  justifyContent: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Body>{option.label}</Body>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
