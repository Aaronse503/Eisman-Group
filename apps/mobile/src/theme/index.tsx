import * as React from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  fontSize,
  lightColors,
  MIN_TOUCH_TARGET,
  radius,
  spacing,
  type ThemeColors,
} from '@eisman/shared/tokens';

/**
 * The same design tokens the web application uses, read straight from the
 * shared package. Light and dark both follow the device unless the person
 * chooses otherwise.
 */

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  minTouchTarget: number;
  isDark: boolean;
}

export type ThemePreference = 'system' | 'light' | 'dark';

const ThemeContext = React.createContext<{
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}>({
  theme: {
    colors: lightColors,
    spacing,
    radius,
    fontSize,
    minTouchTarget: MIN_TOUCH_TARGET,
    isDark: false,
  },
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({
  children,
  preference,
  setPreference,
}: {
  children: React.ReactNode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}) {
  const system = useColorScheme();
  const isDark = preference === 'system' ? system === 'dark' : preference === 'dark';

  const value = React.useMemo(
    () => ({
      theme: {
        colors: isDark ? darkColors : lightColors,
        spacing,
        radius,
        fontSize,
        minTouchTarget: MIN_TOUCH_TARGET,
        isDark,
      },
      preference,
      setPreference,
    }),
    [isDark, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return React.useContext(ThemeContext).theme;
}

export function useThemePreference() {
  const { preference, setPreference } = React.useContext(ThemeContext);
  return { preference, setPreference };
}
