'use client';

import { motion } from 'framer-motion';
import { Badge } from '../ui/badge';
import {
  RiSmartphoneLine,
  RiBrainLine,
  RiUserHeartLine,
  RiFileTextLine,
  RiDatabase2Line,
  RiArrowRightLine,
} from 'react-icons/ri';

const steps = [
  {
    icon: RiSmartphoneLine,
    step: '01',
    title: 'Patient App',
    description: 'Patient submits symptoms via mobile triage assistant',
    color: 'from-blue-500 to-blue-700',
    glow: 'shadow-blue-500/30',
    bg: 'bg-blue-50',
  },
  {
    icon: RiBrainLine,
    step: '02',
    title: 'AI Triage Engine',
    description: 'Clinical AI parses symptoms and computes urgency score',
    color: 'from-accent-500 to-accent-700',
    glow: 'shadow-accent-500/30',
    bg: 'bg-accent-50',
  },
  {
    icon: RiUserHeartLine,
    step: '03',
    title: 'Doctor Consultation',
    description: 'Doctor reviews AI insights and diagnoses the patient',
    color: 'from-purple-500 to-purple-700',
    glow: 'shadow-purple-500/30',
    bg: 'bg-purple-50',
  },
  {
    icon: RiFileTextLine,
    step: '04',
    title: 'Smart Prescription',
    description: 'AI-assisted prescription generated and reviewed',
    color: 'from-amber-500 to-amber-700',
    glow: 'shadow-amber-500/30',
    bg: 'bg-amber-50',
  },
  {
    icon: RiDatabase2Line,
    step: '05',
    title: 'Record Storage',
    description: 'Full patient record stored securely with audit trail',
    color: 'from-teal-500 to-teal-700',
    glow: 'shadow-teal-500/30',
    bg: 'bg-teal-50',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 bg-white overflow-hidden">
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(63,159,118,1) 1px, transparent 1px), linear-gradient(90deg, rgba(63,159,118,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mb-16 text-center"
        >
          <Badge className="mb-4">Workflow</Badge>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            From first symptom to stored record — a seamless AI-guided clinical workflow.
          </p>
        </motion.div>

        {/* Steps: desktop horizontal, mobile vertical */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="absolute top-10 left-[10%] right-[10%] hidden h-0.5 bg-gradient-to-r from-blue-200 via-accent-300 to-teal-200 lg:block" />

          <div className="grid gap-8 lg:grid-cols-5 lg:gap-4">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="flex flex-col items-center text-center lg:relative"
              >
                {/* Connector arrow (mobile) */}
                {i < steps.length - 1 && (
                  <div className="absolute right-[-14px] top-8 z-10 hidden lg:block">
                    <RiArrowRightLine className="h-5 w-5 text-slate-300" />
                  </div>
                )}

                {/* Icon circle */}
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  transition={{ duration: 0.2 }}
                  className={`relative mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} shadow-xl ${step.glow}`}
                >
                  <step.icon className="h-9 w-9 text-white" />
                  {/* Step number badge */}
                  <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-white border-2 border-slate-200 text-[10px] font-bold text-slate-600">
                    {i + 1}
                  </div>
                </motion.div>

                <h3 className="mb-1.5 text-base font-bold tracking-tight text-slate-900">
                  {step.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[160px]">
                  {step.description}
                </p>

                {/* Mobile arrow */}
                {i < steps.length - 1 && (
                  <div className="mt-4 flex justify-center lg:hidden">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-300">
                      <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
