'use client';

import { cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

const DropdownMenuContext = createContext(null);

export function DropdownMenu({ children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onClickOutside(event) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    }

    function onEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={rootRef} className="relative inline-flex">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ className, asChild = false, children }) {
  const context = useContext(DropdownMenuContext);
  if (!context) return children;

  const handleTriggerClick = (event) => {
    if (typeof children?.props?.onClick === 'function') {
      children.props.onClick(event);
    }
    context.setOpen((prev) => !prev);
  };

  if (asChild && isValidElement(children)) {
    return cloneElement(children, {
      onClick: handleTriggerClick,
      'aria-expanded': context.open,
      className: cn(children.props.className, className)
    });
  }

  return (
    <button type="button" onClick={handleTriggerClick} aria-expanded={context.open} className={className}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({ className, align = 'end', children }) {
  const context = useContext(DropdownMenuContext);
  if (!context?.open) return null;

  return (
    <div
      className={cn(
        'absolute top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-violet-100 bg-white p-1 shadow-xl',
        align === 'end' ? 'right-0' : 'left-0',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ className, children }) {
  return <p className={cn('px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>{children}</p>;
}

export function DropdownMenuSeparator({ className }) {
  return <div className={cn('my-1 h-px bg-violet-100', className)} />;
}

export function DropdownMenuItem({ className, onSelect, children }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn('flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition hover:bg-violet-50 hover:text-violet-700', className)}
    >
      {children}
    </button>
  );
}
