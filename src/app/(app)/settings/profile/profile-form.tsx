'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field, FormGrid } from '@/components/form';
import { updateProfileAction } from '@/server/actions/auth';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'UTC',
];

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; title: string; phone: string; timezone: string };
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(defaults);
  const [pending, setPending] = React.useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const result = await updateProfileAction(form);
        setPending(false);
        if (result.ok) {
          toast.success('Profile updated');
          router.refresh();
        } else toast.error(result.error);
      }}
      className="space-y-4"
    >
      <FormGrid>
        <Field label="Name" htmlFor="name" required>
          <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <Field label="Title" htmlFor="title">
          <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Time zone" htmlFor="timezone">
          <NativeSelect
            id="timezone"
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </NativeSelect>
        </Field>
      </FormGrid>
      <Button type="submit" variant="primary" loading={pending}>
        <Save /> Save
      </Button>
    </form>
  );
}
