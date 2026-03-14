'use client';

import {
  RiHeartPulseLine,
  RiTwitterXLine,
  RiLinkedinBoxFill,
  RiGithubFill,
  RiInstagramLine,
} from 'react-icons/ri';

const footerLinks = {
  Product: [
    { label: 'AI Triage Engine', href: '#features' },
    { label: 'Doctor Portal', href: '/doctor-signin' },
    { label: 'Hospital Portal', href: '/hospital-portal' },
    { label: 'Mobile App', href: '#' },
    { label: 'Admin Dashboard', href: '#' },
  ],
  Company: [
    { label: 'About Us', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Press', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  Resources: [
    { label: 'Documentation', href: '#' },
    { label: 'API Reference', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Case Studies', href: '#' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'HIPAA Compliance', href: '#' },
    { label: 'Cookie Policy', href: '#' },
  ],
};

const socials = [
  { icon: RiTwitterXLine, href: '#', label: 'Twitter' },
  { icon: RiLinkedinBoxFill, href: '#', label: 'LinkedIn' },
  { icon: RiGithubFill, href: '#', label: 'GitHub' },
  { icon: RiInstagramLine, href: '#', label: 'Instagram' },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Main footer grid */}
        <div className="py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          {/* Brand column */}
          <div className="sm:col-span-2">
            <a href="/" className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700">
                <RiHeartPulseLine className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">Jeeva</span>
            </a>
            <p className="mb-5 max-w-xs text-sm text-slate-500 leading-relaxed">
              AI-powered clinical triage and decision support for modern hospitals. Smarter care, faster decisions.
            </p>
            <div className="flex gap-3">
              {socials.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-accent-300 hover:text-accent-600 hover:bg-accent-50 transition-all"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
                {section}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-600 hover:text-accent-700 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 py-6">
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} Jeeva Health Technologies Pvt. Ltd. All rights reserved.
          </p>
          <div className="flex gap-5">
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Terms
            </a>
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Sitemap
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
