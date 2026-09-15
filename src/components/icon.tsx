'use client';
import {
  Banknote,
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  CircleCheckBig,
  Flag,
  Handshake,
  LayoutDashboard,
  Plug,
  Settings,
  TrendingUp,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Users,
  UsersRound,
  CircleCheckBig,
  CalendarDays,
  Banknote,
  Handshake,
  TrendingUp,
  BookOpen,
  ChartColumn,
  Flag,
  Plug,
  Settings,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} aria-hidden />;
}
