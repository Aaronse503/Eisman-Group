'use client';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

export interface TrendPoint {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
}

function monthLabel(month: string) {
  const [year, m] = month.split('-');
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

export function RevenueChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-emerald-600)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-emerald-600)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-gold-600)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--color-gold-600)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v, 'USD', { compact: true })}
            tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }}
            axisLine={false}
            tickLine={false}
            width={62}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
              color: 'var(--fg)',
            }}
            labelFormatter={(label: string) => {
              const [year, m] = label.split('-');
              return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              });
            }}
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="var(--color-emerald-600)"
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
          <Area
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke="var(--color-gold-700)"
            strokeWidth={2}
            fill="url(#expenseFill)"
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="var(--fg-muted)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
