'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '../ui/card';
import { Badge } from '../ui/badge';
import { RiStarFill, RiHospitalLine, RiUserHeartLine } from 'react-icons/ri';

const testimonials = [
  {
    quote:
      'Jeeva has transformed our emergency department. Patient wait times dropped by 40% in the first month. The AI triage accuracy is remarkable and our staff trusts it.',
    name: 'Dr. Ramesh Iyer',
    role: 'Chief Medical Officer',
    org: 'Apollo Hospitals, Hyderabad',
    icon: RiHospitalLine,
    rating: 5,
  },
  {
    quote:
      'As a general physician, the AI decision support gives me differential diagnoses I might have missed. The prescription system alone saves me 20 minutes per patient.',
    name: 'Dr. Kavitha Menon',
    role: 'Senior Physician',
    org: 'Fortis Healthcare, Bangalore',
    icon: RiUserHeartLine,
    rating: 5,
  },
  {
    quote:
      'The hospital dashboard gives our admin team a live view of every department. Capacity planning is finally data-driven. We recommended Jeeva to three sister hospitals.',
    name: 'Mr. Arun Chandrasekhar',
    role: 'Hospital Administrator',
    org: 'Manipal Health Enterprises',
    icon: RiHospitalLine,
    rating: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="relative py-24 bg-white overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[600px] rounded-full bg-accent-400/6 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mb-16 text-center"
        >
          <Badge className="mb-4">Testimonials</Badge>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Trusted by Healthcare Leaders
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            Hospitals and clinicians across India rely on Jeeva to deliver better care.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.18 } }}
            >
              <GlassCard className="h-full flex flex-col hover:shadow-xl transition-all duration-300">
                {/* Stars */}
                <div className="mb-4 flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <RiStarFill key={j} className="h-4 w-4 text-amber-400" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="mb-6 flex-1 text-sm text-slate-600 leading-relaxed italic">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="mt-auto flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-100 to-accent-200">
                    <t.icon className="h-5 w-5 text-accent-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                    <div className="text-xs text-accent-600 font-medium">{t.org}</div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
