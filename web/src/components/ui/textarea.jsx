import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'flex min-h-[90px] w-full rounded-xl border border-violet-200/70 bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-300/60 focus-visible:border-violet-400',
        className
      )}
      {...props}
    />
  );
}
