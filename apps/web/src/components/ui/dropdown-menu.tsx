'use client';
import * as React from 'react';
import * as Primitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuSub = Primitive.Sub;
export const DropdownMenuSubTrigger = Primitive.SubTrigger;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

const contentClass =
  'z-50 min-w-[11rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <Primitive.Portal>
    <Primitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(contentClass, className)}
      {...props}
    />
  </Primitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

const itemClass =
  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[var(--fg)] outline-none transition-colors focus:bg-[var(--surface-sunken)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--fg-subtle)]';

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <Primitive.Item
    ref={ref}
    className={cn(itemClass, destructive && 'text-[var(--danger)] [&_svg]:text-[var(--danger)]', className)}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof Primitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Primitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <Primitive.CheckboxItem ref={ref} className={cn(itemClass, 'pl-8', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <Primitive.ItemIndicator>
        <Check className="size-3.5" />
      </Primitive.ItemIndicator>
    </span>
    {children}
  </Primitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

export const DropdownMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof Primitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof Primitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <Primitive.RadioItem ref={ref} className={cn(itemClass, 'pl-8', className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <Primitive.ItemIndicator>
        <Check className="size-3.5" />
      </Primitive.ItemIndicator>
    </span>
    {children}
  </Primitive.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase',
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof Primitive.Separator>,
  React.ComponentPropsWithoutRef<typeof Primitive.Separator>
>(({ className, ...props }, ref) => (
  <Primitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-[var(--border)]', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof Primitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof Primitive.SubContent>
>(({ className, ...props }, ref) => (
  <Primitive.Portal>
    <Primitive.SubContent ref={ref} className={cn(contentClass, className)} {...props} />
  </Primitive.Portal>
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('ml-auto text-xs tracking-widest text-[var(--fg-subtle)]', className)} {...props} />
  );
}

export { ChevronRight as DropdownMenuSubIndicator };
