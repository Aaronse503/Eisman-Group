import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body } from '@/components/ui';

/**
 * Whether what is on screen has reached the server.
 *
 * Shown only when there is something to say. Silence means everything is
 * saved, which is the honest default; a person should never have to guess
 * whether a note they wrote on a plane actually exists.
 */
export function SyncBanner() {
  const theme = useTheme();
  const router = useRouter();
  const { queuedChanges, syncing, sync } = useSession();

  if (!queuedChanges && !syncing) return null;

  return (
    <Pressable
      onPress={() => (queuedChanges ? router.push('/sync') : void sync())}
      accessibilityRole="button"
      accessibilityLabel={
        syncing
          ? 'Sending queued changes'
          : `${queuedChanges} change${queuedChanges === 1 ? '' : 's'} waiting to send. Open sync.`
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.warningBg,
        marginBottom: theme.spacing.md,
        minHeight: theme.minTouchTarget,
      }}
    >
      <Ionicons
        name={syncing ? 'sync-outline' : 'cloud-offline-outline'}
        size={18}
        color={theme.colors.warning}
      />
      <View style={{ flex: 1 }}>
        <Body size="sm" style={{ color: theme.colors.warning, fontWeight: '600' }}>
          {syncing
            ? 'Sending your changes…'
            : `${queuedChanges} change${queuedChanges === 1 ? '' : 's'} saved on this device`}
        </Body>
        {!syncing ? (
          <Body size="sm" style={{ color: theme.colors.warning }}>
            They will send when you have a connection.
          </Body>
        ) : null}
      </View>
    </Pressable>
  );
}
