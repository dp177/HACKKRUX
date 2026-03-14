'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import {
  RiHeartPulseLine,
  RiMenuLine,
  RiCloseLine,
  RiArrowDownSLine,
} from 'react-icons/ri';
import { cn } from '../../lib/utils';

const navLinks = [
  {
    label: 'Product',
    href: '#features',
    children: [
      { label: 'AI Triage Engine', href: '#features' },
      { label: 'Doctor Portal', href: '/doctor-signin' },
      { label: 'Hospital Portal', href: '/hospital-portal' },
    ],
  },
  { label: 'Features', href: '#features' },
  { label: 'Hospitals', href: '#hospitals' },
  { label: 'Doctors', href: '#doctors' },
  { label: 'Resources', href: '#how-it-works' },
];

function NavDropdown({ item }) {
  const [open, setOpen] = useState(false);

  if (!item.children) {
    return (
      <a
        href={item.href}
        className="text-sm font-medium text-slate-600 hover:text-accent-700 transition-colors"
      >
        {item.label}
      </a>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-accent-700 transition-colors bg-transparent shadow-none p-0 cursor-pointer">
        {item.label}
        <RiArrowDownSLine
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-xl py-2 z-50"
          >
            {item.children.map((child) => (
              <a
                key={child.label}
                href={child.href}
                className="block px-4 py-2 text-sm text-slate-600 hover:text-accent-700 hover:bg-accent-50 transition-colors"
              >
                {child.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-sm'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 shadow-md shadow-accent-600/30">
              <RiHeartPulseLine className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Jeeva
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <NavDropdown key={link.label} item={link} />
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/doctor-signin')}>
              Sign In
            </Button>
            <Button variant="primary" size="sm" onClick={() => (window.location.href = '/hospital-onboarding')}>
              Onboard Hospital
            </Button>
          </div>

          {/* Mobile toggle */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition md:hidden bg-transparent shadow-none p-0"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <RiCloseLine className="h-5 w-5" /> : <RiMenuLine className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-slate-200 bg-white/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-accent-50 hover:text-accent-700 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => (window.location.href = '/doctor-signin')}
                >
                  Sign In
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => (window.location.href = '/hospital-onboarding')}
                >
                  Onboard Hospital
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
