'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  RiUserLine,
  RiFileTextLine,
  RiAlertLine,
  RiAddLine,
  RiHeartPulseLine,
} from 'react-icons/ri';

const queuePatients = [
  { name: 'Anjali Verma', age: 34, score: 92, level: 'Critical', color: 'bg-red-500', wait: '2 min' },
  { name: 'Suresh Patel', age: 67, score: 78, level: 'High', color: 'bg-orange-500', wait: '8 min' },
  { name: 'Meera Singh', age: 28, score: 45, level: 'Moderate', color: 'bg-amber-500', wait: '15 min' },
  { name: 'Ravi Kiran', age: 52, score: 31, level: 'Stable', color: 'bg-accent-500', wait: '22 min' },
];

const prescriptions = [
  { drug: 'Amoxicillin 500mg', freq: '3×/day', days: '7 days', status: 'Active' },
  { drug: 'Paracetamol 650mg', freq: '2×/day', days: '5 days', status: 'Active' },
  { drug: 'Cetirizine 10mg', freq: '1×/day', days: '3 days', status: 'Completed' },
];

export default function DoctorPreview() {
  return (
    <section id="doctors" className="relative py-24 bg-slate-900 overflow-hidden">
      {/* Glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 h-[400px] w-[400px] rounded-full bg-accent-500/10 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-600/10 blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="mb-14 text-center"
        >
          <Badge variant="default" className="mb-4 bg-accent-900/60 text-accent-300 border border-accent-700/40">
            Doctor Interface
          </Badge>
          <h2 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            Built for Clinical Efficiency
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            A thoughtfully designed doctor portal that puts AI insights exactly where you need them.
          </p>
        </motion.div>

        {/* Mock dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.65 }}
          className="overflow-hidden rounded-3xl border border-white/10 bg-slate-800/60 backdrop-blur-xl shadow-2xl"
        >
          {/* Fake browser top bar */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900/50 px-5 py-3.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <div className="h-3 w-3 rounded-full bg-accent-500" />
            <div className="mx-auto rounded-md bg-slate-700/60 px-4 py-1 text-xs text-slate-400">
              jeeva.health/doctor-portal
            </div>
          </div>

          {/* Dashboard content */}
          <div className="grid gap-5 p-6 lg:grid-cols-3">
            {/* Patient Queue */}
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RiUserLine className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-white">Patient Queue</span>
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                    {queuePatients.length} waiting
                  </span>
                </div>
                <span className="text-xs text-slate-500">Today, 10:42 AM</span>
              </div>

              <div className="space-y-2.5">
                {queuePatients.map((p, i) => (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.08 }}
                    className="flex items-center gap-3 rounded-xl bg-slate-700/40 px-4 py-3 hover:bg-slate-700/60 transition-colors"
                  >
                    <div className={`h-2.5 w-2.5 rounded-full ${p.color} flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">Age {p.age} · {p.level}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{p.score}</div>
                      <div className="text-xs text-slate-500">{p.wait} ago</div>
                    </div>
                    <button className="ml-1 rounded-lg bg-accent-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 transition-colors shadow-none">
                      See
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right panels */}
            <div className="flex flex-col gap-4">
              {/* Triage score */}
              <div className="rounded-xl border border-white/10 bg-slate-700/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <RiHeartPulseLine className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-slate-300">Current Patient Score</span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">92</span>
                  <span className="mb-1 text-sm text-slate-400">/ 100</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-600">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '92%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.5 }}
                    className="h-1.5 rounded-full bg-gradient-to-r from-red-400 to-red-600"
                  />
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <RiAlertLine className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-xs text-red-400 font-medium">Critical — Immediate attention</span>
                </div>
              </div>

              {/* Recent prescriptions */}
              <div className="flex-1 rounded-xl border border-white/10 bg-slate-700/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RiFileTextLine className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300">Prescriptions</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {prescriptions.map((rx) => (
                    <div key={rx.drug} className="rounded-lg bg-slate-800/60 px-3 py-2">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-medium text-white leading-snug">{rx.drug}</span>
                        <span
                          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            rx.status === 'Active'
                              ? 'bg-accent-500/20 text-accent-400'
                              : 'bg-slate-600 text-slate-400'
                          }`}
                        >
                          {rx.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {rx.freq} · {rx.days}
                      </p>
                    </div>
                  ))}
                </div>

                <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-600/80 py-2 text-xs font-semibold text-white hover:bg-accent-500 transition-colors shadow-none">
                  <RiAddLine className="h-3.5 w-3.5" /> Generate Prescription
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-wrap justify-center gap-4"
        >
          <Button
            variant="primary"
            size="lg"
            onClick={() => (window.location.href = '/doctor-signin')}
          >
            Access Doctor Portal
          </Button>
          <Button
            variant="soft"
            size="lg"
            onClick={() => (window.location.href = '/hospital-onboarding')}
          >
            Onboard Hospital
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
