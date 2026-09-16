import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class merging. Web only: the mobile app has no class names. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Everything else lives in @eisman/shared so the mobile application formats
// figures identically.
export * from '@eisman/shared';
