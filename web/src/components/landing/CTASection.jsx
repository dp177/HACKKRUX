'use client';

import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { RiArrowRightLine, RiCalendarLine } from 'react-icons/ri';

export default function CTASection() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-accent-700" />

      {/* Texture/noise overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-20 h-[400px] w-[400px] rounded-full bg-accent-400/20 blur-[100px]" />
        <div className="absolute -bottom-40 -right-20 h-[400px] w-[400px] rounded-full bg-accent-500/20 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-300 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Now available across India
          </div>

          <h2 className="mb-6 text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
            Transform Hospital Workflows with AI
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-accent-100/80">
            Join hundreds of hospitals already using Jeeva to deliver faster, safer, and smarter patient care.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              className="bg-white text-accent-700 hover:bg-accent-50 shadow-xl shadow-black/20 border-0"
              size="lg"
              onClick={() => (window.location.href = '/hospital-onboarding')}
            >
              Start Free Trial
              <RiArrowRightLine className="h-4 w-4" />
            </Button>
            <Button
              className="border border-white/30 bg-white/5 text-white hover:bg-white/10 shadow-none"
              size="lg"
              onClick={() => (window.location.href = '/hospital-onboarding')}
            >
              <RiCalendarLine className="h-4 w-4 " />
              Onboard Hospital
            </Button>
          </div>

          <p className="mt-8 text-sm text-accent-200/70">
            No credit card required · Setup in under 10 minutes · HIPAA-ready infrastructure
          </p>
        </motion.div>
      </div>
    </section>
  );
}
