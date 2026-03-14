import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-soft p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassCard({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/60 bg-white/70 backdrop-blur-md shadow-xl p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
