import * as React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body, SectionTitle } from '@/components/ui';
import type { Permission } from '@eisman/shared';

/**
 * Quick Create.
 *
 * Only the things a person may actually create are listed — the list is built
 * from their permissions, so nothing appears that would be refused.
 */

interface CreateOption {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  permission: Permission;
}

const OPTIONS: CreateOption[] = [
  { label: 'Task', icon: 'checkmark-circle-outline', route: '/create/task', permission: 'task:write' },
  { label: 'Note', icon: 'document-text-outline', route: '/create/note', permission: 'knowledge:write' },
  { label: 'Contact', icon: 'person-add-outline', route: '/create/contact', permission: 'crm:write' },
  { label: 'Meeting', icon: 'calendar-outline', route: '/create/meeting', permission: 'calendar:write' },
  { label: 'Investor', icon: 'trending-up-outline', route: '/create/investor', permission: 'investor:write' },
  { label: 'Partnership', icon: 'git-merge-outline', route: '/create/partnership', permission: 'partnership:write' },
  { label: 'Document upload', icon: 'cloud-upload-outline', route: '/create/document', permission: 'knowledge:write' },
];

export function QuickCreateButton() {
  const theme = useTheme();
  const router = useRouter();
  const { can } = useSession();
  const [open, setOpen] = React.useState(false);

  const available = OPTIONS.filter((option) => can(option.permission));
  if (!available.length) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Create something new"
        style={({ pressed }) => ({
          minHeight: theme.minTouchTarget,
          minWidth: theme.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="add" size={20} color={theme.colors.accentFg} />
        </View>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close"
        />
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: 36,
          }}
        >
          <SectionTitle>Create</SectionTitle>
          {available.map((option) => (
            <Pressable
              key={option.route}
              accessibilityRole="button"
              accessibilityLabel={`New ${option.label}`}
              onPress={() => {
                setOpen(false);
                router.push(option.route as never);
              }}
              style={({ pressed }) => ({
                minHeight: theme.minTouchTarget + 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name={option.icon} size={20} color={theme.colors.accent} />
              <Body>{option.label}</Body>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}
