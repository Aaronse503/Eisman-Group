'use client';
import * as React from 'react';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyTemplate({ subject, body }: { subject: string | null; body: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    const text = subject ? `Subject: ${subject}\n\n${body}` : body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to your clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Your browser blocked clipboard access. Select the text and copy it manually.');
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={copy} className="shrink-0">
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}
