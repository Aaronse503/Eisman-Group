import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayout, useTheme, type Theme } from '@/theme';

/**
 * The building blocks of the mobile interface.
 *
 * Every control is at least 44 points tall, which is the smallest target both
 * Apple and Google ask for, and every one carries an accessibility label.
 */

export function Screen({
  children,
  scroll = true,
  refreshControl,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const layout = useLayout();
  const base: ViewStyle = { flex: 1, backgroundColor: theme.colors.bg };
  // On a tablet the content is centred in a column rather than stretched the
  // full width, where a line of text becomes hard to follow.
  const column: ViewStyle = layout.isWide
    ? { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' }
    : {};
  if (!scroll) {
    return (
      <View style={base}>
        <View style={[{ flex: 1 }, column, style]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={base}
      contentContainerStyle={[
        { padding: theme.spacing.lg, paddingBottom: 48 },
        column,
        style,
      ]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Heading({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        { fontSize: theme.fontSize.xxl, fontWeight: '700', color: theme.colors.fg, letterSpacing: -0.5 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: theme.fontSize.xs,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: theme.colors.fgSubtle,
        marginBottom: theme.spacing.sm,
        marginTop: theme.spacing.lg,
      }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  subtle,
  size,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  subtle?: boolean;
  size?: 'sm' | 'base' | 'md';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: theme.fontSize[size ?? 'base'],
          color: subtle ? theme.colors.fgSubtle : muted ? theme.colors.fgMuted : theme.colors.fg,
          lineHeight: theme.fontSize[size ?? 'base'] * 1.45,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'gold';

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: BadgeTone }) {
  const theme = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.neutralBg, fg: theme.colors.neutral },
    success: { bg: theme.colors.successBg, fg: theme.colors.success },
    warning: { bg: theme.colors.warningBg, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerBg, fg: theme.colors.danger },
    info: { bg: theme.colors.infoBg, fg: theme.colors.info },
    accent: { bg: theme.colors.accentSoft, fg: theme.colors.accentSoftFg },
    gold: { bg: theme.colors.goldSoft, fg: theme.colors.gold },
  };
  const colors = map[tone];
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radius.pill,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: theme.fontSize.xs, fontWeight: '600', color: colors.fg }}>
        {children}
      </Text>
    </View>
  );
}

/** Marks a record that came from the demo data, everywhere it appears. */
export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <Badge tone="gold">Demo</Badge>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.colors.accent, fg: theme.colors.accentFg, border: theme.colors.accent },
    secondary: { bg: theme.colors.surface, fg: theme.colors.fg, border: theme.colors.border },
    ghost: { bg: 'transparent', fg: theme.colors.accent, border: 'transparent' },
    danger: { bg: theme.colors.danger, fg: '#ffffff', border: theme.colors.danger },
  };
  const colors = palette[variant]!;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        {
          minHeight: theme.minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          backgroundColor: colors.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          opacity: isDisabled ? 0.55 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={colors.fg} /> : null}
          <Text style={{ color: colors.fg, fontWeight: '600', fontSize: theme.fontSize.base }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  multiline,
  error,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'email-address' | 'numeric';
  multiline?: boolean;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.fg }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.fgSubtle}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType}
        multiline={multiline}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={{
          minHeight: multiline ? 120 : theme.minTouchTarget,
          textAlignVertical: multiline ? 'top' : 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: multiline ? theme.spacing.md : 0,
          fontSize: theme.fontSize.base,
          color: theme.colors.fg,
          backgroundColor: theme.colors.surface,
        }}
      />
      {error ? (
        <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.danger }}>{error}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon = 'file-tray-outline',
}: {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      <Ionicons name={icon} size={32} color={theme.colors.fgSubtle} />
      <Body style={{ fontWeight: '600' }}>{title}</Body>
      {description ? (
        <Body muted size="sm" style={{ textAlign: 'center' }}>
          {description}
        </Body>
      ) : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.dangerBg,
      }}
    >
      <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
      <Text style={{ flex: 1, color: theme.colors.danger, fontSize: theme.fontSize.sm }}>
        {message}
      </Text>
    </View>
  );
}

/** Says where a figure came from, rather than leaving it to be assumed. */
export function SourceNote({ source, stale, at }: { source: string; stale?: boolean; at?: Date | null }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.fgSubtle, marginTop: 6 }}>
      {stale
        ? `Saved on this device${at ? ` ${at.toLocaleString()}` : ''} — not refreshed.`
        : `Source: ${source}`}
    </Text>
  );
}

export function Row({
  children,
  gap,
  align = 'center',
  justify,
  wrap,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap: gap ?? 8,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={theme.colors.accent} />
      <Body muted size="sm">
        {label}
      </Body>
    </View>
  );
}

export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return React.useMemo(() => factory(theme), [theme, factory]);
}
