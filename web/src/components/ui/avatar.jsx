import { cn } from '../../lib/utils';

export function Avatar({ className, children, ...props }) {
  return (
    <div className={cn('relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-violet-200 bg-violet-100', className)} {...props}>
      {children}
    </div>
  );
}

export function AvatarImage({ className, alt = 'Avatar', ...props }) {
  return <img className={cn('h-full w-full object-cover', className)} alt={alt} {...props} />;
}

export function AvatarFallback({ className, children, ...props }) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-semibold text-white', className)} {...props}>
      {children}
    </div>
  );
}
