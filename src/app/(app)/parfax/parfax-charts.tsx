'use client';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SourceNote } from '@/components/ui/page';
import { formatNumber } from '@/lib/utils';

const BRAND_COLORS = [
  'var(--color-emerald-600)', 'var(--color-gold-600)', 'var(--color-emerald-400)',
  'var(--color-gold-800)', 'var(--color-emerald-800)', 'var(--color-gold-400)',
  'var(--color-emerald-300)', 'var(--color-charcoal-500)',
];

const tooltipStyle = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--fg)',
};

function monthLabel(month: string) {
  const [year, m] = month.split('-');
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

export function ParfaxCharts({
  signups,
  scans,
  brands,
}: {
  signups: { month: string; signups: number; paid: number }[];
  scans: { month: string; scans: number; verified: number }[];
  brands: { brand: string; scans: number }[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Signups over time</CardTitle>
          <SourceNote source="ParFax user records, last 12 months" />
        </CardHeader>
        <CardContent>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={signups} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-emerald-600)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-emerald-600)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [formatNumber(v), n === 'signups' ? 'Signups' : 'Paid']} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Area type="monotone" dataKey="signups" name="Signups" stroke="var(--color-emerald-600)" strokeWidth={2} fill="url(#signupFill)" />
                <Area type="monotone" dataKey="paid" name="Paid" stroke="var(--color-gold-700)" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scans by brand</CardTitle>
          <SourceNote source="Scan records in the selected period" />
        </CardHeader>
        <CardContent>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brands} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="brand" width={86} tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatNumber(v), 'Scans']} />
                <Bar dataKey="scans" radius={[0, 3, 3, 0]}>
                  {brands.map((entry, i) => (
                    <Cell key={entry.brand} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Scan volume and verification</CardTitle>
          <SourceNote source="Scan records, last 12 months. Verified scans are those a human confirmed." />
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scans} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [formatNumber(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="scans" name="Scans" fill="var(--color-emerald-600)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="verified" name="Verified" fill="var(--color-gold-600)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
