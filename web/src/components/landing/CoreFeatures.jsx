'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  RiBrainLine,
  RiFileTextLine,
  RiTimeLine,
  RiDashboardLine,
  RiLightbulbFlashLine,
  RiAlertLine,
} from 'react-icons/ri';

const features = [
  {
    icon: RiBrainLine,
    title: 'AI Symptom Triage',
    description: 'Natural language symptom intake with clinical reasoning. Generates urgency scores aligned with the Manchester Triage System.',
    iconColor: 'text-accent-600',
    iconBg: 'bg-accent-100',
  },
  {
    icon: RiFileTextLine,
    title: 'Smart Prescription System',
    description: 'Doctor-guided AI prescriptions with drug interaction checks, dosage recommendations, and patient history cross-referencing.',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
  },
  {
    icon: RiTimeLine,
    title: 'Patient History Timeline',
    description: 'Comprehensive longitudinal patient records — visits, labs, prescriptions, vitals — surfaced with semantic search.',
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
  },
  {
    icon: RiDashboardLine,
    title: 'Hospital Admin Dashboard',
    description: 'Multi-department capacity management with live queue analytics, staff allocation, and performance KPIs.',
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-100',
  },
  {
    icon: RiLightbulbFlashLine,
    title: 'Real-time Decision Support',
    description: 'Evidence-based clinical guidelines surfaced at the point of care — reducing diagnostic errors and improving outcomes.',
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
  },
  {
    icon: RiAlertLine,
    title: 'Predictive Risk Alerts',
    description: 'ML models continuously monitor patient vitals and flag deterioration risks before they become critical emergencies.',
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
  },
];

export default function CoreFeatures() {
  return (
    <section id="features" className="relative py-24 bg-slate-50/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mb-16 text-center"
        >
          <Badge className="mb-4">Core Features</Badge>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Everything You Need, Nothing You Don't
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            Purpose-built AI capabilities designed for clinical accuracy and operational efficiency.
          </p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.18 } }}
            >
              <div
                className="group h-full rounded-2xl border border-slate-200/70 bg-white p-6 hover:border-slate-300 hover:shadow-xl transition-all duration-300"
              >
                {/* Icon */}
                <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.iconBg}`}>
                  <feature.icon className={`h-5.5 w-5.5 ${feature.iconColor}`} style={{ width: 22, height: 22 }} />
                </div>

                <h3 className="mb-2 text-lg font-bold tracking-tight text-slate-900">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
