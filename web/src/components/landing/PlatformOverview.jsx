'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  RiHospitalLine,
  RiUserHeartLine,
  RiSmartphoneLine,
  RiArrowRightLine,
} from 'react-icons/ri';

const cards = [
  {
    icon: RiHospitalLine,
    audience: 'For Hospitals',
    title: 'Centralized Triage Command',
    description:
      'Real-time emergency prioritization dashboard with live queue management, bed availability tracking, and AI-generated triage scores across all departments.',
    link: '/hospital-portal',
    cardBg: 'bg-white',
    iconBg: 'bg-accent-600',
    badge: 'Hospital',
    badgeVariant: 'default',
  },
  {
    icon: RiUserHeartLine,
    audience: 'For Doctors',
    title: 'AI-Assisted Diagnosis Support',
    description:
      'Intelligent clinical decision support with patient history insights, differential diagnosis suggestions, and smart prescription generation — right inside your workflow.',
    link: '/doctor-signin',
    cardBg: 'bg-white',
    iconBg: 'bg-accent-600',
    badge: 'Doctor',
    badgeVariant: 'blue',
  },
  {
    icon: RiSmartphoneLine,
    audience: 'For Patients',
    title: 'Mobile Triage Assistant',
    description:
      'AI-powered symptom assessment in the patient\'s hands. Evaluate severity, get recommended department routing, and book appointments before arriving at the hospital.',
    link: '#',
    cardBg: 'bg-white',
    iconBg: 'bg-accent-600',
    badge: 'Patient',
    badgeVariant: 'purple',
  },
];

export default function PlatformOverview() {
  return (
    <section id="hospitals" className="relative py-24 bg-white">
      {/* Subtle background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mb-16 text-center"
        >
          <Badge className="mb-4">Platform</Badge>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Built for Modern Healthcare
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            One unified AI platform serving every stakeholder in the healthcare delivery chain.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card, i) => (
            <motion.div
              key={card.audience}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
            >
              <GlassCard className={`group flex h-full flex-col ${card.cardBg} border-slate-200/60 hover:border-slate-300 hover:shadow-2xl transition-all duration-300 cursor-default`}>
                <div className="mb-5 flex items-center gap-3">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg} shadow-lg shadow-accent-600/20`}>
                    <card.icon className="h-6 w-6 text-white" />
                  </div>
                  <Badge variant={card.badgeVariant}>
                    {card.badge}
                  </Badge>
                </div>

                <h3 className="mb-3 text-xl font-bold tracking-tight text-slate-900">
                  {card.title}
                </h3>
                <p className="mb-6 text-sm text-slate-500 leading-relaxed">
                  {card.description}
                </p>

                <a
                  href={card.link}
                  className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:gap-2 transition-all"
                >
                  Learn more <RiArrowRightLine className="h-4 w-4" />
                </a>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
