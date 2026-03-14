'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { io } from 'socket.io-client';
import {
  addDoctorSlot,
  addDoctorBreak,
  callNextPatient,
  deleteDoctorBreak,
  deleteDoctorScheduleForDate,
  deleteDoctorSlot,
  getDoctorDashboard,
  getDoctorBreaksForDate,
  getDoctorPatientHistory,
  getDoctorProfile,
  getPatientPrescriptions,
  getDoctorScheduleForDate,
  getDoctorSlotsForDate,
  getPatientPreview,
  searchMedicines,
  setDoctorSchedule,
  updateDoctorBreak,
  updateDoctorSlot,
  createPrescription
} from '../../lib/api';

const NAV_ITEMS = [
  'Dashboard',
  'Patient Queue',
  'Appointments',
  'Availability',
  'Patient History',
  'Profile',
  'Notifications'
];

const PRIORITY_META = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'Moderate', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low: { label: 'Low', color: 'bg-violet-100 text-violet-700 border-violet-200' }
};

const DEFAULT_AVAILABILITY = [
  { day: 'Monday', start: '09:00', end: '15:00', available: true, emergency: false },
  { day: 'Tuesday', start: '10:00', end: '16:00', available: true, emergency: false },
  { day: 'Wednesday', start: '', end: '', available: false, emergency: false },
  { day: 'Thursday', start: '09:30', end: '14:30', available: true, emergency: false },
  { day: 'Friday', start: '10:00', end: '15:00', available: true, emergency: true },
  { day: 'Saturday', start: '', end: '', available: false, emergency: false },
  { day: 'Sunday', start: '', end: '', available: false, emergency: false }
];

const QUICK_FREQUENCY_OPTIONS = ['1-0-1', '1-1-1', '0-1-0', '0-0-1', 'SOS', 'OD', 'BD', 'TDS'];
const QUICK_DURATION_OPTIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month'];
const QUICK_INSTRUCTION_OPTIONS = ['After food', 'Before food', 'At bedtime', 'With water', 'As needed'];

function createMedicineEntry(base = {}) {
  return {
    medicineId: String(base.medicineId || base._id || ''),
    name: String(base.name || '').trim(),
    dosage: String(base.dosage || '').trim(),
    frequency: String(base.frequency || '1-0-1').trim(),
    duration: String(base.duration || '5 days').trim(),
    instructions: String(base.instructions || 'After food').trim()
  };
}

function normalizePriority(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('critical') || value === 'urgent') return 'critical';
  if (value.includes('high')) return 'high';
  if (value.includes('medium') || value.includes('moderate')) return 'medium';
  return 'low';
}

function priorityBadge(priority) {
  const meta = PRIORITY_META[priority] || PRIORITY_META.low;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.color}`}>{meta.label}</span>;
}

function queueRowFromRaw(item, index) {
  const rawPatientId =
    item.patient_id
    || item.patientId
    || item?.patient?._id
    || item?.patient?.id
    || null;
  const patientId = rawPatientId && typeof rawPatientId === 'object'
    ? String(rawPatientId._id || rawPatientId.id || '')
    : String(rawPatientId || '');

  const score = Number(item.total_risk_score || item.totalRiskScore || item.riskScore || item.score || 0);
  const priority = normalizePriority(item.urgency_level || item.urgencyLevel || item.priority_level || item.priorityLevel || item.priority || (score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low'));
  const rawStatus = String(item.status || '').toUpperCase();
  const status = ['IN_CONSULTATION', 'WAITING', 'COMPLETED', 'CANCELLED'].includes(rawStatus) ? rawStatus : 'WAITING';
  const queuePosition = Number(item.queue_position ?? item.queuePosition ?? index + 1);
  const queueEntryId = String(item.queue_entry_id || item.queueEntryId || item.entryId || '');
  const rowKey = queueEntryId || `${patientId || 'patient'}-${status}-${queuePosition}-${index}`;
  return {
    id: patientId || item.id || `queue-${index}`,
    rowKey,
    queueEntryId: queueEntryId || null,
    name: item.patient_name || item.patientName || item.name || `Patient ${index + 1}`,
    symptoms: item.chief_complaint || item.symptoms || 'Symptoms pending',
    department: item.department || item.ai_analysis?.department || 'General',
    urgency: priority,
    status,
    score,
    queuePosition,
    patientsAhead: Number(item.patientsAhead ?? item.patients_ahead ?? Math.max(0, queuePosition - 1)),
    waitTime: item.wait_time || `${item.estimated_wait_minutes ?? item.estimatedWaitMinutes ?? item.wait_minutes ?? 0} min`,
    waitedTime: `${item.waited_minutes ?? 0} min`,
    explainabilitySummary: item.explainability_summary || item.ai_analysis?.summary || '',
    historicalSummary: item.historical_summary || '',
    aiAnalysis: item.ai_analysis || null,
    analysisOutput: item.analysis_output || null
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string' && entry.trim().length)
    .map((entry) => entry.trim());
}

function formatDateWithDay(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return {
      day: 'Day',
      shortDate: date,
      full: date
    };
  }

  return {
    day: parsed.toLocaleDateString('en-US', { weekday: 'short' }),
    shortDate: parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    full: parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
  };
}

export default function DoctorPortalPage() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState('Dashboard');

  const [token, setToken] = useState('');
  const [doctor, setDoctor] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [selectedQueuePatient, setSelectedQueuePatient] = useState(null);
  const [selectedPatientPreview, setSelectedPatientPreview] = useState(null);
  const [patientPrescriptions, setPatientPrescriptions] = useState([]);
  const [showAllPrescriptionHistory, setShowAllPrescriptionHistory] = useState(false);
  const [expandedPrescriptionId, setExpandedPrescriptionId] = useState(null);
  const [medicineSearchText, setMedicineSearchText] = useState('');
  const [medicineSearchResults, setMedicineSearchResults] = useState([]);
  const [medicineSearchLoading, setMedicineSearchLoading] = useState(false);
  const [medicineSearchError, setMedicineSearchError] = useState('');
  const [customMedicineName, setCustomMedicineName] = useState('');
  const [bulkFrequency, setBulkFrequency] = useState('1-0-1');
  const [bulkDuration, setBulkDuration] = useState('5 days');
  const [bulkInstructions, setBulkInstructions] = useState('After food');
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [prescriptionForm, setPrescriptionForm] = useState({
    diagnosis: '',
    temperature: '',
    bloodPressure: '',
    notes: '',
    remarks: '',
    medicines: []
  });

  const [availability, setAvailability] = useState(DEFAULT_AVAILABILITY);
  const [availabilityDate, setAvailabilityDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleForm, setScheduleForm] = useState({
    shiftStart: '09:00',
    shiftEnd: '17:00',
    appointmentStart: '10:00',
    appointmentEnd: '13:00',
    slotDuration: '20'
  });
  const [breakForm, setBreakForm] = useState({
    breakStart: '11:00',
    breakEnd: '11:20'
  });
  const [slotForm, setSlotForm] = useState({
    startTime: '10:00',
    endTime: '10:20',
    status: 'AVAILABLE'
  });
  const [editingBreakId, setEditingBreakId] = useState('');
  const [editingSlotId, setEditingSlotId] = useState('');
  const [availabilitySchedule, setAvailabilitySchedule] = useState(null);
  const [availabilityBreaks, setAvailabilityBreaks] = useState([]);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [appointmentNotes, setAppointmentNotes] = useState({});
  const [appointmentsState, setAppointmentsState] = useState({});
  const [doctorHistory, setDoctorHistory] = useState({
    totals: { totalVisits: 0, totalPatientsTreated: 0, treatedToday: 0 },
    treatedPatients: [],
    visits: []
  });

  const [loading, setLoading] = useState(true);

  const queue = useMemo(() => {
    const patients = dashboard?.currentQueue?.patients || [];
    if (!patients.length) return [];
    const statusRank = (status) => (status === 'IN_CONSULTATION' ? 0 : status === 'WAITING' ? 1 : status === 'COMPLETED' ? 2 : 3);
    return patients
      .map(queueRowFromRaw)
      .sort((a, b) => {
        if (statusRank(a.status) !== statusRank(b.status)) {
          return statusRank(a.status) - statusRank(b.status);
        }
        if (a.queuePosition !== b.queuePosition) {
          return a.queuePosition - b.queuePosition;
        }
        return b.score - a.score;
      });
  }, [dashboard]);

  const appointments = useMemo(() => {
    const fromUpcoming = dashboard?.upcomingAppointments?.appointments || [];
    const fromToday = dashboard?.todaySchedule?.appointments || [];

    const source = fromUpcoming.length ? fromUpcoming : fromToday;
    return source.map((item) => ({
      ...item,
      displayDate: item.date || dashboard?.todayDate || 'Today'
    }));
  }, [dashboard]);

  const metrics = useMemo(() => {
    const waiting = dashboard?.statistics?.patientsWaiting ?? queue.length;
    const highPriority = queue.filter((item) => item.urgency === 'critical' || item.urgency === 'high').length;
    const todayAppointments = dashboard?.todaySchedule?.totalAppointments ?? appointments.length;
    const avgWait = dashboard?.statistics?.avgWaitTime ?? 18;

    return {
      waiting,
      highPriority,
      todayAppointments,
      avgWait
    };
  }, [dashboard, queue, appointments]);

  const urgentCases = useMemo(() => queue.filter((item) => item.urgency === 'critical' || item.urgency === 'high').slice(0, 5), [queue]);

  useEffect(() => {
    const savedToken = localStorage.getItem('doctorPortalToken');
    const savedDoctor = localStorage.getItem('doctorPortalDoctor');

    if (!savedToken || !savedDoctor) {
      router.push('/doctor-signin');
      return;
    }

    setToken(savedToken);
    setDoctor(JSON.parse(savedDoctor));
  }, [router]);

  useEffect(() => {
    if (!token || !doctor?.id) {
      return;
    }

    loadPortalData(false);

    const timer = setInterval(() => {
      loadPortalData(true);
    }, 15000);

    return () => clearInterval(timer);
  }, [token, doctor?.id]);

  useEffect(() => {
    const departmentId = dashboard?.doctor?.departmentId;
    if (!token || !departmentId) {
      return;
    }

    const base = process.env.NEXT_PUBLIC_SOCKET_URL
      || String(process.env.NEXT_PUBLIC_API_BASE_URL || '').replace('/api', '')
      || 'http://localhost:5000';

    const socket = io(base, {
      transports: ['websocket', 'polling'],
      timeout: 8000
    });

    socket.on('connect', () => {
      socket.emit('queue:subscribe', { departmentId: String(departmentId) });
    });

    socket.on('queue:department:update', (payload) => {
      if (!payload || String(payload.departmentId) !== String(departmentId)) return;

      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentQueue: {
            ...(prev.currentQueue || {}),
            waiting_count: payload.waitingCount,
            patients: payload.patients || []
          },
          statistics: {
            ...(prev.statistics || {}),
            patientsWaiting: payload.waitingCount
          }
        };
      });

      // Sync selectedQueuePatient status if it changed in this update
      setSelectedQueuePatient((prev) => {
        if (!prev) return prev;
        const updatedRaw = (payload.patients || []).find((p) => {
          const entryId = String(p.queue_entry_id || p.queueEntryId || p.entryId || '');
          return entryId && entryId === prev.queueEntryId;
        });
        if (!updatedRaw) return prev;
        const rawStatus = String(updatedRaw.status || '').toUpperCase();
        const newStatus = ['IN_CONSULTATION', 'WAITING', 'COMPLETED', 'CANCELLED'].includes(rawStatus) ? rawStatus : 'WAITING';
        if (newStatus === prev.status) return prev;
        return { ...prev, status: newStatus };
      });
    });

    return () => {
      socket.emit('queue:unsubscribe', { departmentId: String(departmentId) });
      socket.disconnect();
    };
  }, [token, dashboard?.doctor?.departmentId]);

  useEffect(() => {
    refreshAvailabilityData({ silent: true });
  }, [doctor?.id, token, availabilityDate]);

  useEffect(() => {
    const q = String(medicineSearchText || '').trim();

    if (!q || q.length < 2) {
      setMedicineSearchResults([]);
      setMedicineSearchError('');
      setMedicineSearchLoading(false);
      return undefined;
    }

    if (!token) {
      setMedicineSearchResults([]);
      setMedicineSearchError('Not authenticated - please reload the page.');
      setMedicineSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setMedicineSearchLoading(true);
        setMedicineSearchError('');
        const result = await searchMedicines(q, token, 12);
        if (cancelled) return;

        if (Array.isArray(result)) {
          setMedicineSearchResults(result);
          setMedicineSearchError(result.length ? '' : `No medicines found for "${q}"`);
        } else {
          setMedicineSearchResults([]);
          setMedicineSearchError('Unexpected response from server.');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Medicine search error:', err);
        setMedicineSearchResults([]);
        setMedicineSearchError(err?.message || 'Failed to search medicines. Check if backend is running.');
      } finally {
        if (!cancelled) {
          setMedicineSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [medicineSearchText, token]);

  async function refreshAvailabilityData({ silent = false } = {}) {
    if (!doctor?.id || !availabilityDate) return;

    try {
      const [scheduleData, breaksData, slotsData] = await Promise.all([
        getDoctorScheduleForDate(doctor.id, availabilityDate, token),
        getDoctorBreaksForDate(doctor.id, availabilityDate, token),
        getDoctorSlotsForDate(doctor.id, availabilityDate)
      ]);

      const loadedSchedule = scheduleData?.schedule || null;
      setAvailabilitySchedule(loadedSchedule);
      if (loadedSchedule) {
        setScheduleForm({
          shiftStart: loadedSchedule.shiftStart || '09:00',
          shiftEnd: loadedSchedule.shiftEnd || '17:00',
          appointmentStart: loadedSchedule.appointmentStart || '10:00',
          appointmentEnd: loadedSchedule.appointmentEnd || '13:00',
          slotDuration: String(loadedSchedule.slotDuration || 20)
        });
      }

      setAvailabilityBreaks(breaksData?.breaks || []);
      setAvailabilitySlots(slotsData?.slots || []);

      if (!silent) {
        toast.success('Availability data refreshed');
      }
    } catch (error) {
      setAvailabilitySchedule(null);
      setAvailabilityBreaks([]);
      setAvailabilitySlots([]);
      if (!silent) {
        toast.error(error.message || 'Failed to load availability data');
      }
    }
  }

  async function loadPortalData(silent) {
    if (!silent) setLoading(true);

    try {
      const [dashboardData, profileData, historyData] = await Promise.all([
        getDoctorDashboard(doctor.id, token),
        getDoctorProfile(token),
        getDoctorPatientHistory(doctor.id, token)
      ]);

      setDashboard(dashboardData);
      setProfile(profileData);
      setDoctorHistory(historyData || {
        totals: { totalVisits: 0, totalPatientsTreated: 0, treatedToday: 0 },
        treatedPatients: [],
        visits: []
      });

      if (!silent) {
        toast.success('Doctor portal synced');
      }
    } catch (error) {
      if (!silent) {
        toast.error(error.message || 'Failed to load doctor portal');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleSelectQueuePatient(item) {
    setSelectedQueuePatient(item);
    setPrescriptionForm({
      diagnosis: '',
      temperature: '',
      bloodPressure: '',
      notes: '',
      remarks: '',
      medicines: []
    });
    setMedicineSearchText('');
    setMedicineSearchResults([]);
    setMedicineSearchError('');
    setShowAllPrescriptionHistory(false);
    setExpandedPrescriptionId(null);
    setCustomMedicineName('');
    setBulkFrequency('1-0-1');
    setBulkDuration('5 days');
    setBulkInstructions('After food');

    if (!doctor?.id || !token || !item?.id || String(item.id).length < 8) {
      setSelectedPatientPreview(null);
      setPatientPrescriptions([]);
      toast.warning('Live patient preview not available for this record');
      return;
    }

    try {
      const [data, history] = await Promise.all([
        getPatientPreview(doctor.id, item.id, token),
        getPatientPrescriptions(item.id, token)
      ]);
      setSelectedPatientPreview(data);
      setPatientPrescriptions(Array.isArray(history) ? history : []);
      toast.success('Patient detail loaded');
    } catch (error) {
      setSelectedPatientPreview(null);
      setPatientPrescriptions([]);
      toast.warning(error.message || 'Preview not available for this patient');
    }
  }

  function addMedicineToPrescription(item) {
    if (!item?._id || !item?.name) return;

    const defaultStrength = Array.isArray(item.strength) && item.strength.length ? item.strength[0] : '';
    addMedicineToPrescriptionWithDetails(item, defaultStrength);
  }

  function addMedicineToPrescriptionWithDetails(item, selectedStrength = '') {
    if (!item?._id || !item?.name) return;

    setPrescriptionForm((prev) => {
      if (prev.medicines.some((m) => String(m.medicineId) === String(item._id) && String(m.dosage || '') === String(selectedStrength || ''))) {
        return prev;
      }

      return {
        ...prev,
        medicines: [
          ...prev.medicines,
          createMedicineEntry({
            medicineId: String(item._id),
            name: item.name,
            dosage: selectedStrength || '',
            frequency: bulkFrequency,
            duration: bulkDuration,
            instructions: bulkInstructions
          })
        ]
      };
    });

    setMedicineSearchText('');
    setMedicineSearchResults([]);
    setMedicineSearchError('');
  }

  function addCustomMedicineToPrescription() {
    const name = String(customMedicineName || '').trim();
    if (!name) return;

    setPrescriptionForm((prev) => ({
      ...prev,
      medicines: [
        ...prev.medicines,
        createMedicineEntry({
          medicineId: '',
          name,
          dosage: '',
          frequency: bulkFrequency,
          duration: bulkDuration,
          instructions: bulkInstructions
        })
      ]
    }));

    setCustomMedicineName('');
  }

  function updatePrescriptionMedicine(index, field, value) {
    setPrescriptionForm((prev) => {
      const medicines = [...prev.medicines];
      medicines[index] = {
        ...medicines[index],
        [field]: value
      };
      return {
        ...prev,
        medicines
      };
    });
  }

  function removePrescriptionMedicine(index) {
    setPrescriptionForm((prev) => {
      const medicines = prev.medicines.filter((_, idx) => idx !== index);
      return {
        ...prev,
        medicines
      };
    });
  }

  function duplicatePrescriptionMedicine(index) {
    setPrescriptionForm((prev) => {
      const item = prev.medicines[index];
      if (!item) return prev;
      return {
        ...prev,
        medicines: [
          ...prev.medicines,
          createMedicineEntry(item)
        ]
      };
    });
  }

  function applyBulkDefaultsToAllMedicines() {
    setPrescriptionForm((prev) => ({
      ...prev,
      medicines: prev.medicines.map((med) => ({
        ...med,
        frequency: bulkFrequency,
        duration: bulkDuration,
        instructions: bulkInstructions
      }))
    }));
  }

  async function handleGeneratePrescription() {
    if (!selectedQueuePatient?.queueEntryId || !token) {
      toast.warning('Select an in-consultation patient first');
      return;
    }

    if (selectedQueuePatient.status !== 'IN_CONSULTATION') {
      toast.warning('Prescription can be generated only while patient is in consultation');
      return;
    }

    if (!String(prescriptionForm.diagnosis || '').trim()) {
      toast.warning('Diagnosis is required');
      return;
    }

    try {
      setPrescriptionSubmitting(true);

      await createPrescription({
        consultationId: selectedQueuePatient.queueEntryId,
        form: {
          diagnosis: prescriptionForm.diagnosis,
          temperature: prescriptionForm.temperature,
          bloodPressure: prescriptionForm.bloodPressure,
          notes: prescriptionForm.notes
        },
        medicines: prescriptionForm.medicines,
        remarks: prescriptionForm.remarks
      }, token);

      toast.success('Prescription generated and consultation completed');
      await handleSelectQueuePatient(selectedQueuePatient);
      await loadPortalData(true);
    } catch (error) {
      toast.error(error.message || 'Failed to generate prescription');
    } finally {
      setPrescriptionSubmitting(false);
    }
  }

  async function handleCallNextPatient() {
    if (!doctor?.id || !token) return;

    try {
      const response = await callNextPatient(doctor.id, token);
      toast.success(response.message || 'Next patient called');

      // Immediately update selectedQueuePatient status if the called patient is currently selected
      if (response?.patient?.id) {
        setSelectedQueuePatient((prev) => {
          if (!prev || prev.id !== String(response.patient.id)) return prev;
          return { ...prev, status: 'IN_CONSULTATION' };
        });
      }

      loadPortalData(true);
    } catch (error) {
      toast.error(error.message || 'Unable to call next patient');
    }
  }

  function handleLogout() {
    localStorage.removeItem('doctorPortalToken');
    localStorage.removeItem('doctorPortalDoctor');
    toast.success('Signed out');
    router.push('/doctor-signin');
  }

  function updateAppointmentStatus(id, nextStatus) {
    setAppointmentsState((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status: nextStatus } }));
    toast.success(`Appointment marked as ${nextStatus}`);
  }

  function saveAppointmentNote(id) {
    const note = appointmentNotes[id] || '';
    if (!note.trim()) {
      toast.warning('Add a note first');
      return;
    }
    setAppointmentsState((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), note } }));
    toast.success('Appointment note saved');
  }

  function toggleAvailability(day) {
    setAvailability((prev) => prev.map((item) => item.day === day ? { ...item, available: !item.available } : item));
    toast.success(`${day} availability updated`);
  }

  function toggleEmergency(day) {
    setAvailability((prev) => prev.map((item) => item.day === day ? { ...item, emergency: !item.emergency } : item));
    toast.success(`${day} emergency toggle updated`);
  }

  function updateHours(day, field, value) {
    setAvailability((prev) => prev.map((item) => item.day === day ? { ...item, [field]: value } : item));
  }

  function renderDashboard() {
    return (
      <section className="space-y-5">
        <article className="card">
          <h2 className="mb-4 text-2xl font-semibold text-slate-900">Welcome {doctor?.name || 'Doctor'}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Patients Waiting</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.waiting}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs uppercase tracking-wide text-red-600">High Priority Cases</p>
              <p className="mt-2 text-2xl font-bold text-red-700">{metrics.highPriority}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Today's Appointments</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.todayAppointments}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Average Wait Time</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.avgWait} min</p>
            </div>
          </div>
        </article>

        <div className="grid gap-5 xl:grid-cols-2">
          <article className="card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">High Priority Cases</h3>
              <button type="button" onClick={handleCallNextPatient}>Start Consultation</button>
            </div>
            {!urgentCases.length && <p className="text-sm text-slate-500">No urgent alerts right now.</p>}
            <div className="space-y-2">
              {urgentCases.map((item) => (
                <button
                  key={item.rowKey}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-slate-700 hover:border-violet-300"
                  onClick={() => handleSelectQueuePatient(item)}
                >
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.symptoms}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {priorityBadge(item.urgency)}
                    <span className="text-xs text-slate-500">Score: {item.score}</span>
                  </div>
                </button>
              ))}
            </div>
          </article>

          <article className="card">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Today's Schedule</h3>
            <div className="space-y-2">
              {appointments.slice(0, 6).map((item) => {
                const status = appointmentsState[item.id]?.status || item.status || 'upcoming';
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{item.time} - {item.patient?.name || 'Patient'}</p>
                    <p className="text-xs capitalize text-slate-500">Status: {status}</p>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderQueue() {
    const selectedAi = selectedQueuePatient?.aiAnalysis || selectedPatientPreview?.todayTriage?.aiAnalysis || {};
    const selectedRawAnalysis = selectedQueuePatient?.analysisOutput || selectedPatientPreview?.todayTriage?.analysisOutput || null;
    const selectedSymptoms = normalizeStringList(selectedAi.extracted_symptoms);
    const selectedRedFlags = normalizeStringList(selectedAi.detected_red_flags);
    const aiComorbidities = normalizeStringList(selectedAi.extracted_comorbidities);
    const profileComorbidities = normalizeStringList(
      (selectedPatientPreview?.medicalProfile?.chronicConditions || []).map((item) => item?.condition || item?.name || '')
    );
    const selectedComorbidities = aiComorbidities.length
      ? aiComorbidities
      : profileComorbidities;
    const selectedSeverity = selectedAi.severity || selectedQueuePatient?.urgency || selectedPatientPreview?.todayTriage?.priorityLevel || '-';
    const selectedOnsetType = selectedAi.onset_type || '-';
    const selectedSymptomCategory = selectedAi.symptom_category || selectedPatientPreview?.todayTriage?.symptomCategory || '-';
    const selectedDepartment = selectedAi.department || selectedQueuePatient?.department || '-';

    return (
      <section className="space-y-5">
        <article className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Patient Queue</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCallNextPatient}>Call Top Patient</button>
              <button type="button" className="secondary" onClick={() => loadPortalData(false)}>Refresh Queue</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1">Patient</th>
                  <th className="px-2 py-1">Symptoms</th>
                  <th className="px-2 py-1">Department</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Urgency</th>
                  <th className="px-2 py-1">Score</th>
                  <th className="px-2 py-1">Waited</th>
                  <th className="px-2 py-1">Wait</th>
                </tr>
              </thead>
              <tbody>
                {!queue.length ? (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={8}>No patients in queue.</td>
                  </tr>
                ) : null}
                {queue.map((item) => (
                  <tr
                    key={item.rowKey}
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                    onClick={() => handleSelectQueuePatient(item)}
                  >
                    <td className="px-2 py-2 font-semibold text-slate-800">{item.name}</td>
                    <td className="px-2 py-2 text-slate-600">{item.symptoms}</td>
                    <td className="px-2 py-2 text-slate-700">{item.department}</td>
                    <td className="px-2 py-2 text-slate-700">{item.status === 'IN_CONSULTATION' ? 'IN CONSULTATION' : item.status}</td>
                    <td className="px-2 py-2">{priorityBadge(item.urgency)}</td>
                    <td className="px-2 py-2 text-slate-700">{item.score}</td>
                    <td className="px-2 py-2 text-slate-700">{item.waitedTime}</td>
                    <td className="px-2 py-2 text-slate-600">{item.waitTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Patient Detail</h3>
          {!selectedQueuePatient && <p className="text-sm text-slate-500">Select a patient from queue to view details.</p>}
          {selectedQueuePatient && (
            <div className="space-y-3 text-sm text-slate-700">
              <p><span className="font-semibold">Name:</span> {selectedQueuePatient.name}</p>
              <p><span className="font-semibold">Symptoms:</span> {selectedQueuePatient.symptoms}</p>
              <p><span className="font-semibold">Urgency:</span> {priorityBadge(selectedQueuePatient.urgency)}</p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-sm font-semibold text-slate-800">Extended Summary</p>
                <p className="text-sm text-slate-600">
                  {selectedRawAnalysis?.explainability_summary
                    || selectedQueuePatient.explainabilitySummary
                    || selectedPatientPreview?.todayTriage?.explainabilitySummary
                    || selectedPatientPreview?.todayTriage?.triageNotes
                    || 'No explainability summary available.'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-sm font-semibold text-slate-800">Historical Summary</p>
                <p className="text-sm text-slate-600">{selectedRawAnalysis?.historical_summary ?? selectedQueuePatient.historicalSummary ?? selectedPatientPreview?.todayTriage?.historicalSummary ?? 'No historical summary available.'}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">AI Clinical Extraction</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Chief Complaint:</span> {selectedAi.chief_complaint || selectedQueuePatient.symptoms || '-'}</p>
                  <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Severity:</span> {String(selectedSeverity)}</p>
                  <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Onset Type:</span> {String(selectedOnsetType)}</p>
                  <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Symptom Category:</span> {String(selectedSymptomCategory)}</p>
                  <p className="text-xs text-slate-600 sm:col-span-2"><span className="font-semibold text-slate-700">Department:</span> {String(selectedDepartment)}</p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted Symptoms</p>
                    {!selectedSymptoms.length ? <p className="mt-1 text-xs text-slate-500">No symptoms extracted.</p> : (
                      <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                        {selectedSymptoms.map((symptom, idx) => <li key={`${symptom}-${idx}`}>{symptom}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detected Red Flags</p>
                    {!selectedRedFlags.length ? <p className="mt-1 text-xs text-slate-500">No red flags detected.</p> : (
                      <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                        {selectedRedFlags.map((flag, idx) => <li key={`${flag}-${idx}`}>{flag}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comorbidities</p>
                    {!selectedComorbidities.length ? <p className="mt-1 text-xs text-slate-500">No comorbidities extracted.</p> : (
                      <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                        {selectedComorbidities.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">Previous Prescriptions</p>
                  <span className="text-xs text-slate-500">{patientPrescriptions.length} records</span>
                </div>

                {!patientPrescriptions.length ? (
                  <p className="text-xs text-slate-500">No previous prescriptions found.</p>
                ) : (
                  <div className="space-y-2">
                    {(showAllPrescriptionHistory ? patientPrescriptions : patientPrescriptions.slice(0, 5)).map((item) => {
                      const isExpanded = expandedPrescriptionId === item.id;
                      const full = item.full || {};
                      const fullMedicines = full.medicines || [];
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                          {/* Summary row — click to expand */}
                          <button
                            type="button"
                            onClick={() => setExpandedPrescriptionId(isExpanded ? null : item.id)}
                            className="w-full text-left p-2 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700">{new Date(item.date).toLocaleDateString()}</p>
                                <p className="text-xs text-slate-600">Diagnosis: {item.diagnosis || 'Not recorded'}</p>
                                <p className="text-xs text-slate-500 truncate">Medicines: {(item.medicines || []).join(', ') || 'Not recorded'}</p>
                              </div>
                              <span className="shrink-0 text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </button>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-slate-200 bg-white p-3 space-y-3">
                              {/* Doctor */}
                              {item.doctorName && (
                                <p className="text-xs text-slate-500">Prescribed by: <span className="font-medium text-slate-700">{item.doctorName}</span></p>
                              )}

                              {/* Vitals */}
                              {(full.form?.temperature || full.form?.bloodPressure || full.form?.notes) && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-600 mb-1">Vitals / Notes</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {full.form?.temperature && <span className="text-xs text-slate-600">Temp: {full.form.temperature}</span>}
                                    {full.form?.bloodPressure && <span className="text-xs text-slate-600">BP: {full.form.bloodPressure}</span>}
                                  </div>
                                  {full.form?.notes && <p className="text-xs text-slate-600 mt-1">Notes: {full.form.notes}</p>}
                                </div>
                              )}

                              {/* Medicines table */}
                              {fullMedicines.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-600 mb-1">Medicines ({fullMedicines.length})</p>
                                  <div className="space-y-2">
                                    {fullMedicines.map((med, idx) => (
                                      <div key={idx} className="rounded border border-slate-100 bg-slate-50 p-2">
                                        <p className="text-xs font-semibold text-slate-800">{med.name}</p>
                                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                          {med.dosage && <span className="text-xs text-slate-500">Dose: <span className="text-slate-700">{med.dosage}</span></span>}
                                          {med.frequency && <span className="text-xs text-slate-500">Freq: <span className="text-slate-700">{med.frequency}</span></span>}
                                          {med.duration && <span className="text-xs text-slate-500">Duration: <span className="text-slate-700">{med.duration}</span></span>}
                                        </div>
                                        {med.instructions && <p className="text-xs text-slate-500 mt-0.5">Instructions: <span className="text-slate-700">{med.instructions}</span></p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Remarks */}
                              {full.remarks && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-600">Remarks</p>
                                  <p className="text-xs text-slate-600">{full.remarks}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {patientPrescriptions.length > 5 ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setShowAllPrescriptionHistory((prev) => !prev)}
                        >
                          {showAllPrescriptionHistory ? 'Show Less' : `View More (${patientPrescriptions.length - 5} more)`}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {selectedQueuePatient.status === 'IN_CONSULTATION' ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">Create Prescription</p>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      {prescriptionForm.medicines.length} medicines added
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Diagnosis"
                      value={prescriptionForm.diagnosis}
                      onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, diagnosis: event.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Temperature (e.g. 101F)"
                      value={prescriptionForm.temperature}
                      onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, temperature: event.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Blood Pressure (e.g. 120/80)"
                      value={prescriptionForm.bloodPressure}
                      onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, bloodPressure: event.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Clinical Notes"
                      value={prescriptionForm.notes}
                      onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Search Medicine</label>
                    <input
                      type="text"
                      placeholder="Type medicine name (min 2 letters)"
                      value={medicineSearchText}
                      onChange={(event) => setMedicineSearchText(event.target.value)}
                    />
                    {medicineSearchLoading ? <p className="mt-1 text-xs text-slate-500">Searching...</p> : null}
                    {!medicineSearchLoading && medicineSearchError ? (
                      <p className="mt-1 text-xs text-red-500">{medicineSearchError}</p>
                    ) : null}
                    {!medicineSearchLoading && !medicineSearchError && medicineSearchResults.length ? (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                        {medicineSearchResults.map((item) => (
                          <div key={item._id} className="mb-2 rounded-md border border-slate-200 bg-white p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-slate-700">{item.name}</p>
                                {Array.isArray(item.strength) && item.strength.length ? (
                                  <p className="mt-1 text-xs text-slate-500">Strengths: {item.strength.slice(0, 6).join(', ')}</p>
                                ) : null}
                              </div>
                              <button type="button" className="secondary" onClick={() => addMedicineToPrescription(item)}>Add</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Custom medicine name"
                        value={customMedicineName}
                        onChange={(event) => setCustomMedicineName(event.target.value)}
                      />
                      <button type="button" className="secondary" onClick={addCustomMedicineToPrescription}>Add Custom</button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Quick Defaults</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Frequency</label>
                        <input value={bulkFrequency} onChange={(event) => setBulkFrequency(event.target.value)} placeholder="1-0-1" />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {QUICK_FREQUENCY_OPTIONS.map((opt) => (
                            <button key={`freq-${opt}`} type="button" className="secondary" onClick={() => setBulkFrequency(opt)}>{opt}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Duration</label>
                        <input value={bulkDuration} onChange={(event) => setBulkDuration(event.target.value)} placeholder="5 days" />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {QUICK_DURATION_OPTIONS.map((opt) => (
                            <button key={`duration-${opt}`} type="button" className="secondary" onClick={() => setBulkDuration(opt)}>{opt}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Instruction</label>
                        <input value={bulkInstructions} onChange={(event) => setBulkInstructions(event.target.value)} placeholder="After food" />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {QUICK_INSTRUCTION_OPTIONS.map((opt) => (
                            <button key={`instr-${opt}`} type="button" className="secondary" onClick={() => setBulkInstructions(opt)}>{opt}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button type="button" className="secondary" onClick={applyBulkDefaultsToAllMedicines} disabled={!prescriptionForm.medicines.length}>
                        Apply Defaults To All Medicines
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {prescriptionForm.medicines.map((med, index) => (
                      <div key={`${med.medicineId}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-700">#{index + 1} {med.name}</p>
                          <div className="flex flex-wrap gap-1">
                            <button type="button" className="secondary" onClick={() => duplicatePrescriptionMedicine(index)}>Duplicate</button>
                            <button type="button" className="secondary" onClick={() => removePrescriptionMedicine(index)}>Remove</button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <input type="text" placeholder="Dosage" value={med.dosage || ''} onChange={(event) => updatePrescriptionMedicine(index, 'dosage', event.target.value)} />
                          <input type="text" placeholder="Frequency" value={med.frequency || ''} onChange={(event) => updatePrescriptionMedicine(index, 'frequency', event.target.value)} />
                          <input type="text" placeholder="Duration" value={med.duration || ''} onChange={(event) => updatePrescriptionMedicine(index, 'duration', event.target.value)} />
                          <input type="text" placeholder="Instructions" value={med.instructions || ''} onChange={(event) => updatePrescriptionMedicine(index, 'instructions', event.target.value)} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {QUICK_FREQUENCY_OPTIONS.map((opt) => (
                            <button key={`med-f-${index}-${opt}`} type="button" className="secondary" onClick={() => updatePrescriptionMedicine(index, 'frequency', opt)}>{opt}</button>
                          ))}
                          {QUICK_DURATION_OPTIONS.map((opt) => (
                            <button key={`med-d-${index}-${opt}`} type="button" className="secondary" onClick={() => updatePrescriptionMedicine(index, 'duration', opt)}>{opt}</button>
                          ))}
                          {QUICK_INSTRUCTION_OPTIONS.map((opt) => (
                            <button key={`med-i-${index}-${opt}`} type="button" className="secondary" onClick={() => updatePrescriptionMedicine(index, 'instructions', opt)}>{opt}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3">
                    <textarea
                      rows={3}
                      placeholder="Doctor remarks"
                      value={prescriptionForm.remarks}
                      onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, remarks: event.target.value }))}
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={handleGeneratePrescription} disabled={prescriptionSubmitting}>
                      {prescriptionSubmitting ? 'Generating...' : 'Generate Prescription'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </article>
      </section>
    );
  }

  function renderAppointments() {
    return (
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Appointments</h2>
        <div className="space-y-3">
          {!appointments.length && <p className="text-sm text-slate-500">No booked appointments found for upcoming days.</p>}
          {appointments.map((item) => {
            const state = appointmentsState[item.id] || {};
            const status = state.status || item.status || 'upcoming';
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{item.displayDate} {item.time} - {item.patient?.name || 'Patient'}</p>
                  <span className="text-xs uppercase tracking-wide text-slate-500">{status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateAppointmentStatus(item.id, 'completed')}>Complete Visit</button>
                  <button type="button" className="secondary" onClick={() => updateAppointmentStatus(item.id, 'rescheduled')}>Reschedule</button>
                </div>
                <div className="mt-3">
                  <textarea
                    rows={2}
                    placeholder="Add consultation note"
                    value={appointmentNotes[item.id] || ''}
                    onChange={(event) => setAppointmentNotes((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  />
                  <button type="button" className="mt-2" onClick={() => saveAppointmentNote(item.id)}>Save Note</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderAvailability() {
      const today = new Date();
      const dateOptions = Array.from({ length: 7 }).map((_, idx) => {
        const d = new Date(today);
        d.setDate(today.getDate() + idx);
        return d.toISOString().slice(0, 10);
      });

      const daywiseOptions = dateOptions.map((date) => ({
        value: date,
        ...formatDateWithDay(date)
      }));

      const selectedDate = availabilityDate || dateOptions[0];
      const selectedDateMeta = formatDateWithDay(selectedDate);

    return (
      <section className="card space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Availability Scheduler</h2>
          <p className="text-sm text-slate-600">Define shift, appointment window, slot duration, and breaks. Slots auto-generate and update in real time.</p>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Daywise View (Next 7 Days)</p>
            <div className="flex flex-wrap gap-2">
              {daywiseOptions.map((option) => {
                const active = option.value === selectedDate;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active ? '' : 'secondary'}
                    onClick={() => setAvailabilityDate(option.value)}
                  >
                    {option.day} {option.shortDate}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date (next 7 days)</label>
                <select value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)}>
                  {daywiseOptions.map((date) => (
                    <option key={date.value} value={date.value}>{date.day} {date.shortDate}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Shift Start</label>
                <input type="time" value={scheduleForm.shiftStart} onChange={(e) => setScheduleForm((p) => ({ ...p, shiftStart: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Shift End</label>
                <input type="time" value={scheduleForm.shiftEnd} onChange={(e) => setScheduleForm((p) => ({ ...p, shiftEnd: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Slot Duration (min)</label>
                <input type="number" min="5" max="180" value={scheduleForm.slotDuration} onChange={(e) => setScheduleForm((p) => ({ ...p, slotDuration: e.target.value }))} />
              </div>
            </div>

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Appointment Start</label>
                <input type="time" value={scheduleForm.appointmentStart} onChange={(e) => setScheduleForm((p) => ({ ...p, appointmentStart: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Appointment End</label>
                <input type="time" value={scheduleForm.appointmentEnd} onChange={(e) => setScheduleForm((p) => ({ ...p, appointmentEnd: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!doctor?.id || !token) return;
                  try {
                    const response = await setDoctorSchedule({
                      doctorId: doctor.id,
                      date: availabilityDate,
                      shiftStart: scheduleForm.shiftStart,
                      shiftEnd: scheduleForm.shiftEnd,
                      appointmentStart: scheduleForm.appointmentStart,
                      appointmentEnd: scheduleForm.appointmentEnd,
                      slotDuration: Number(scheduleForm.slotDuration)
                    }, token);
                    toast.success(response?.message || 'Schedule saved');
                    await refreshAvailabilityData({ silent: true });
                  } catch (error) {
                    toast.error(error.message || 'Failed to save schedule');
                  }
                }}
              >
                Save Schedule
              </button>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  if (!doctor?.id || !token) return;
                  try {
                    await deleteDoctorScheduleForDate(doctor.id, availabilityDate, token);
                    toast.success('Schedule deleted for selected day');
                    await refreshAvailabilityData({ silent: true });
                  } catch (error) {
                    toast.error(error.message || 'Failed to delete schedule');
                  }
                }}
              >
                Delete Schedule
              </button>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  await refreshAvailabilityData();
                }}
              >
                Refresh Day Data
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Break Controls</h3>
            <p className="mb-3 mt-1 text-sm text-slate-600">Slider-style break concept: define break range within appointment window.</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Break Start</label>
                <input type="time" value={breakForm.breakStart} onChange={(e) => setBreakForm((p) => ({ ...p, breakStart: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Break End</label>
                <input type="time" value={breakForm.breakEnd} onChange={(e) => setBreakForm((p) => ({ ...p, breakEnd: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full"
                  onClick={async () => {
                    if (!doctor?.id || !token) return;
                    try {
                      if (editingBreakId) {
                        await updateDoctorBreak(editingBreakId, {
                          breakStart: breakForm.breakStart,
                          breakEnd: breakForm.breakEnd
                        }, token);
                        toast.success('Break updated');
                        setEditingBreakId('');
                      } else {
                        await addDoctorBreak({
                          doctorId: doctor.id,
                          date: availabilityDate,
                          breakStart: breakForm.breakStart,
                          breakEnd: breakForm.breakEnd
                        }, token);
                        toast.success('Break added and slots blocked');
                      }
                      await refreshAvailabilityData({ silent: true });
                    } catch (error) {
                      toast.error(error.message || 'Failed to save break');
                    }
                  }}
                >
                  {editingBreakId ? 'Update Break' : 'Add Break'}
                </button>
              </div>
            </div>

            {editingBreakId ? (
              <div className="mt-2">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingBreakId('');
                    setBreakForm({ breakStart: '11:00', breakEnd: '11:20' });
                  }}
                >
                  Cancel Break Edit
                </button>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing Breaks</p>
              {!availabilityBreaks.length && <p className="text-sm text-slate-500">No breaks added for selected day.</p>}
              {!!availabilityBreaks.length && availabilityBreaks.map((item) => (
                <div key={item._id || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">{item.breakStart} - {item.breakEnd}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditingBreakId(item._id || item.id);
                        setBreakForm({ breakStart: item.breakStart, breakEnd: item.breakEnd });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        try {
                          await deleteDoctorBreak(item._id || item.id, token);
                          toast.success('Break deleted');
                          await refreshAvailabilityData({ silent: true });
                        } catch (error) {
                          toast.error(error.message || 'Failed to delete break');
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline Concept</p>
              <div className="mt-2 h-5 w-full rounded-full bg-violet-100">
                <div className="h-5 rounded-full bg-violet-500" style={{ width: '70%' }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Purple bar: appointment window. Add breaks to carve blocked segments.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Generated Slots</h3>
            <p className="mb-3 text-sm text-slate-600">Viewing slots for {selectedDateMeta.full}</p>

            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Custom Slot Start</label>
                <input type="time" value={slotForm.startTime} onChange={(e) => setSlotForm((prev) => ({ ...prev, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Custom Slot End</label>
                <input type="time" value={slotForm.endTime} onChange={(e) => setSlotForm((prev) => ({ ...prev, endTime: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                <select value={slotForm.status} onChange={(e) => setSlotForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="BLOCKED">BLOCKED</option>
                  <option value="BOOKED">BOOKED</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full"
                  onClick={async () => {
                    if (!doctor?.id || !token) return;
                    try {
                      if (editingSlotId) {
                        await updateDoctorSlot(editingSlotId, {
                          startTime: slotForm.startTime,
                          endTime: slotForm.endTime,
                          status: slotForm.status
                        }, token);
                        toast.success('Slot updated');
                        setEditingSlotId('');
                      } else {
                        await addDoctorSlot({
                          doctorId: doctor.id,
                          date: availabilityDate,
                          startTime: slotForm.startTime,
                          endTime: slotForm.endTime,
                          status: slotForm.status
                        }, token);
                        toast.success('Custom slot added');
                      }
                      await refreshAvailabilityData({ silent: true });
                    } catch (error) {
                      toast.error(error.message || 'Failed to save slot');
                    }
                  }}
                >
                  {editingSlotId ? 'Update Slot' : 'Add Slot'}
                </button>
              </div>
            </div>

            {editingSlotId ? (
              <div className="mb-3">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingSlotId('');
                    setSlotForm({ startTime: '10:00', endTime: '10:20', status: 'AVAILABLE' });
                  }}
                >
                  Cancel Slot Edit
                </button>
              </div>
            ) : null}

            {availabilitySchedule ? (
              <p className="mb-3 text-xs text-slate-500">
                Active schedule: Shift {availabilitySchedule.shiftStart}-{availabilitySchedule.shiftEnd}, Window {availabilitySchedule.appointmentStart}-{availabilitySchedule.appointmentEnd}, Duration {availabilitySchedule.slotDuration} min
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500">No schedule found for selected date.</p>
            )}

            {!availabilitySlots.length && <p className="text-sm text-slate-500">No slots generated yet for selected date.</p>}
            {!!availabilitySlots.length && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {availabilitySlots.map((slot) => (
                  <div key={slot.slotId} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <p className="text-xs text-slate-500">{selectedDateMeta.day} {selectedDateMeta.shortDate}</p>
                    <p className="font-semibold text-slate-800">{slot.startTime} - {slot.endTime}</p>
                    <p className={`mt-1 text-xs font-semibold ${slot.status === 'AVAILABLE' ? 'text-violet-700' : slot.status === 'BOOKED' ? 'text-amber-700' : 'text-slate-600'}`}>
                      {slot.status}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditingSlotId(slot.slotId);
                          setSlotForm({
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            status: slot.status || 'AVAILABLE'
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          try {
                            await deleteDoctorSlot(slot.slotId, token);
                            toast.success('Slot deleted');
                            await refreshAvailabilityData({ silent: true });
                          } catch (error) {
                            toast.error(error.message || 'Failed to delete slot');
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            )}
        </div>
      </section>
    );
  }

  function renderHistory() {
    const treatedPatients = doctorHistory?.treatedPatients || [];
    const visits = doctorHistory?.visits || [];
    const totals = doctorHistory?.totals || { totalVisits: 0, totalPatientsTreated: 0, treatedToday: 0 };

    return (
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Patient History</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Visits</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.totalVisits || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Patients Treated</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.totalPatientsTreated || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Treated Today</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.treatedToday || 0}</p>
          </div>
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Treated Patients</h3>
          {!treatedPatients.length ? (
            <p className="text-sm text-slate-500">No treated patients found yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-1">Patient</th>
                    <th className="px-2 py-1">Phone</th>
                    <th className="px-2 py-1">Visits</th>
                    <th className="px-2 py-1">Last Visit</th>
                    <th className="px-2 py-1">Last Diagnosis</th>
                  </tr>
                </thead>
                <tbody>
                  {treatedPatients.map((patient) => (
                    <tr key={patient.patientId} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-semibold text-slate-800">{patient.name}</td>
                      <td className="px-2 py-2 text-slate-600">{patient.phone || '-'}</td>
                      <td className="px-2 py-2 text-slate-700">{patient.visitsCount || 0}</td>
                      <td className="px-2 py-2 text-slate-700">{patient.lastVisitDate ? new Date(patient.lastVisitDate).toLocaleDateString() : '-'}</td>
                      <td className="px-2 py-2 text-slate-600">{patient.lastDiagnosis || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Visits / Treatments</h3>
          {!visits.length && <p className="text-sm text-slate-500">No visit records available yet.</p>}
          {!!visits.length && (
          <div className="space-y-2">
            {visits.map((visit) => (
              <div key={visit.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{new Date(visit.visitDate).toLocaleDateString()} - {visit.patientName || 'Patient'}</p>
                <p className="text-xs text-slate-600">Chief Complaint: {visit.chiefComplaint || '-'}</p>
                <p className="text-xs text-slate-600">Diagnosis: {visit.diagnosis || 'Pending'}</p>
                <p className="text-xs text-slate-600">Treatment: {visit.treatment || 'No treatment notes'}</p>
                <p className="text-xs text-slate-600">Doctor Notes: {visit.doctorNotes || '-'}</p>
              </div>
            ))}
          </div>
          )}
        </article>
      </section>
    );
  }

  function renderProfile() {
    return (
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Name</p>
            <p className="text-sm font-semibold text-slate-800">{doctor?.name || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Specialization</p>
            <p className="text-sm font-semibold text-slate-800">{doctor?.specialty || profile?.specialty || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
            <p className="text-sm font-semibold text-slate-800">{doctor?.department || profile?.department?.name || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
            <p className="text-sm font-semibold text-slate-800">{doctor?.email || profile?.email || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">License ID</p>
            <p className="text-sm font-semibold text-slate-800">{profile?.licenseNumber || 'Not available yet'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Experience</p>
            <p className="text-sm font-semibold text-slate-800">{profile?.yearsOfExperience ?? 'Not available'} years</p>
          </div>
        </div>
      </section>
    );
  }

  function renderNotifications() {
    const liveNotifs = notifications.length
      ? notifications
      : [
          { id: 'n1', level: 'critical', text: 'Critical patient arrived' },
          { id: 'n2', level: 'medium', text: 'Appointment starting soon' },
          { id: 'n3', level: 'low', text: 'New triage case assigned' }
        ];

    return (
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
        <div className="space-y-2">
          {liveNotifs.map((notification) => (
            <div key={notification.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="mb-1">{priorityBadge(normalizePriority(notification.level))}</div>
              <p>{notification.text}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  useEffect(() => {
    if (!dashboard) return;

    const top = (dashboard.currentQueue?.patients || []).map(queueRowFromRaw).find((item) => item.urgency === 'critical' || item.urgency === 'high');
    if (!top) return;

    const id = `queue-${top.id}-${top.score}`;
    setNotifications((prev) => {
      if (prev.some((item) => item.id === id)) return prev;
      return [{ id, level: top.urgency, text: `New ${top.urgency.toUpperCase()} priority patient: ${top.name}` }, ...prev].slice(0, 15);
    });
  }, [dashboard]);

  function renderContent() {
    if (activeNav === 'Dashboard') return renderDashboard();
    if (activeNav === 'Patient Queue') return renderQueue();
    if (activeNav === 'Appointments') return renderAppointments();
    if (activeNav === 'Availability') return renderAvailability();
    if (activeNav === 'Patient History') return renderHistory();
    if (activeNav === 'Profile') return renderProfile();
    return renderNotifications();
  }

  return (
    <main className="container">
      <section className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="card h-fit">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.14em] text-violet-700">Doctor Portal</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">Fast Situational Awareness</h1>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                type="button"
                className={`w-full text-left ${activeNav === item ? '' : 'secondary'}`}
                onClick={() => {
                  setActiveNav(item);
                  toast.success(`${item} opened`);
                }}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <button type="button" className="w-full" onClick={() => loadPortalData(false)} disabled={loading}>
              {loading ? 'Refreshing...' : 'Sync Now'}
            </button>
            <button type="button" className="secondary mt-2 w-full" onClick={handleLogout}>Logout</button>
          </div>
        </aside>

        <section className="space-y-4">
          {loading && <p className="text-sm text-slate-500">Loading doctor portal...</p>}
          {!loading && renderContent()}
        </section>
      </section>
    </main>
  );
}
