'use client';

import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { GlassCard } from '../ui/card';
import {
  RiHeartPulseLine,
  RiBrainLine,
  RiAlertLine,
  RiCheckLine,
  RiArrowRightLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiHospitalLine,
  RiUserHeartLine,
  RiFileChartLine,
  RiDatabase2Line,
} from 'react-icons/ri';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

function FloatingCard({ className, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-slate-50 pt-16">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-accent-500/10 blur-[100px]" />
        <div className="absolute top-60 -left-40 h-[500px] w-[500px] rounded-full bg-accent-400/8 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-accent-400/8 blur-[80px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(63,159,118,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16 lg:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Text content */}
          <div className="flex flex-col items-start">
            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.5 }}
            >
              <Badge className="mb-6 gap-1.5">
                <RiBrainLine className="h-3 w-3" />
                AI-Powered Healthcare Platform
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.55, delay: 0.08 }}
              className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight text-slate-900 md:text-6xl lg:text-[4rem]"
            >
              AI-Powered{' '}
              <span className="text-accent-700">
                Clinical Triage
              </span>{' '}
              & Decision Support
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.55, delay: 0.16 }}
              className="mb-8 max-w-lg text-lg text-slate-500 leading-relaxed"
            >
              Helping hospitals prioritize patients, assist doctors with
              intelligent triage, and streamline medical workflows — all in one
              unified platform.
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.55, delay: 0.24 }}
              className="flex flex-wrap items-center gap-3"
            >
              <Button
                variant="primary"
                size="lg"
                onClick={() => (window.location.href = '/hospital-onboarding')}
              >
                Get Started
                <RiArrowRightLine className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => (window.location.href = '/hospital-onboarding')}
              >
                Onboard Hospital
              </Button>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.55, delay: 0.32 }}
              className="mt-10 flex flex-wrap items-center gap-6"
            >
              {[
                { icon: RiShieldCheckLine, text: 'HIPAA Ready' },
                { icon: RiCheckLine, text: '99.9% Uptime' },
                { icon: RiTimeLine, text: 'Real-time AI' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-slate-500">
                  <Icon className="h-4 w-4 text-accent-500" />
                  {text}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Floating UI cards */}
          <div className="relative flex items-center justify-center">
            {/* Central AI brain orb */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative flex h-52 w-52 items-center justify-center"
            >
              {/* Rotating rings */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-dashed border-accent-300/50"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-5 rounded-full border border-dashed border-accent-400/40"
              />
              {/* Pulsing glow */}
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute h-32 w-32 rounded-full bg-gradient-to-br from-accent-400/40 to-accent-600/30 blur-xl"
              />
              {/* Center icon */}
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 shadow-2xl shadow-accent-600/40">
                <RiBrainLine className="h-11 w-11 text-white" />
              </div>

              {/* Orbiting dots */}
              {[0, 72, 144, 216, 288].map((deg, i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear', delay: -i }}
                  style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${deg}deg)` }}
                >
                  <div className="absolute top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-accent-400 shadow-sm" />
                </motion.div>
              ))}
            </motion.div>

            {/* Floating card: Patient Queue */}
            <FloatingCard
              className="absolute left-0 top-4 lg:-left-12"
              delay={0.5}
            >
              <GlassCard className="w-52 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Patient Queue
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">
                    8
                  </span>
                </div>
                {[
                  { name: 'Amit Sharma', level: 'Critical', color: 'bg-red-400' },
                  { name: 'Priya Nair', level: 'Moderate', color: 'bg-amber-400' },
                  { name: 'Raj Kumar', level: 'Stable', color: 'bg-accent-400' },
                ].map((p) => (
                  <div key={p.name} className="flex items-center gap-2 py-1">
                    <div className={`h-2 w-2 rounded-full ${p.color} flex-shrink-0`} />
                    <span className="text-xs text-slate-700">{p.name}</span>
                    <span className="ml-auto text-xs text-slate-400">{p.level}</span>
                  </div>
                ))}
              </GlassCard>
            </FloatingCard>

            {/* Floating card: AI Triage Score */}
            <FloatingCard
              className="absolute right-0 top-0 lg:-right-8"
              delay={0.65}
            >
              <GlassCard className="w-48 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  AI Triage Score
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-accent-600">87</span>
                  <span className="mb-1 text-sm text-slate-400">/ 100</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '87%' }}
                    transition={{ duration: 1.2, delay: 1 }}
                    className="h-1.5 rounded-full bg-gradient-to-r from-accent-400 to-accent-600"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">High priority — review now</p>
              </GlassCard>
            </FloatingCard>

            {/* Floating card: Vitals */}
            <FloatingCard
              className="absolute bottom-4 right-0 lg:-right-4"
              delay={0.8}
            >
              <GlassCard className="w-44 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <RiHeartPulseLine className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold text-slate-600">Vitals</span>
                </div>
                {[
                  { label: 'HR', value: '92 bpm' },
                  { label: 'BP', value: '128/82' },
                  { label: 'SpO₂', value: '98%' },
                ].map((v) => (
                  <div key={v.label} className="flex justify-between text-xs py-0.5">
                    <span className="text-slate-400">{v.label}</span>
                    <span className="font-medium text-slate-700">{v.value}</span>
                  </div>
                ))}
              </GlassCard>
            </FloatingCard>

            {/* Floating card: AI Alert */}
            <FloatingCard
              className="absolute bottom-8 left-0 lg:-left-6"
              delay={0.95}
            >
              <GlassCard className="w-48 p-4">
                <div className="flex items-start gap-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <RiAlertLine className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Risk Alert</p>
                    <p className="mt-0.5 text-xs text-slate-400 leading-snug">
                      Cardiac history detected — prioritize ECG
                    </p>
                  </div>
                </div>
              </GlassCard>
            </FloatingCard>
          </div>
        </div>

        {/* Capability strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20 grid grid-cols-2 gap-6 rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm p-6 md:grid-cols-4"
        >
          {[
            { icon: RiHospitalLine, title: 'Hospital Operations', text: 'Central queue and triage desk controls' },
            { icon: RiUserHeartLine, title: 'Doctor Decision Support', text: 'Context-aware recommendations at consult time' },
            { icon: RiFileChartLine, title: 'Clinical Workflow', text: 'Prescription and visit flow in one interface' },
            { icon: RiDatabase2Line, title: 'Unified Records', text: 'Longitudinal patient history and audit trail' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-4">
              <Icon className="h-5 w-5 text-accent-600" />
              <div className="mt-2 text-sm font-semibold tracking-tight text-slate-900">{title}</div>
              <div className="mt-1 text-xs text-slate-500">{text}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
