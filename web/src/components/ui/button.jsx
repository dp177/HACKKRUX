import { cn } from '../../lib/utils';

const variants = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 shadow-md hover:shadow-lg shadow-accent-600/20',
  outline: 'border border-accent-600 text-accent-700 bg-white hover:bg-accent-50',
  ghost: 'text-slate-700 hover:text-accent-700 hover:bg-accent-50',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 shadow-md',
  gradient: 'bg-gradient-to-r from-accent-600 to-accent-700 text-white hover:from-accent-700 hover:to-accent-800 shadow-lg shadow-accent-700/20',
  soft: 'border border-white/30 bg-white/10 text-white hover:bg-white/15',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

export function Button({ variant = 'primary', size = 'md', className, children, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
