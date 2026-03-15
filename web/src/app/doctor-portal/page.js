'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiBell,
  FiCalendar,
  FiClock,
  FiFileText,
  FiGrid,
  FiHome,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiUser,
  FiUsers,
  FiX
} from 'react-icons/fi';
import { toast } from 'sonner';
import { io } from 'socket.io-client';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
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
  createPrescription,
  uploadDoctorSignature,
  downloadPrescriptionPdf
} from '../../lib/api';

const NAV_ITEMS = [
  'Dashboard',
  'Patient Queue',
  'Appointments',
  'Availability',
  'Patient History',
  'Profile'
];

const NAV_ICONS = {
  Dashboard: FiHome,
  'Patient Queue': FiUsers,
  Appointments: FiCalendar,
  Availability: FiClock,
  'Patient History': FiFileText,
  Profile: FiUser
};

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
  return <Badge className={`border text-[11px] font-semibold normal-case tracking-normal ${meta.color}`}>{meta.label}</Badge>;
}

async function triggerPrescriptionDownload(prescriptionId, token) {
  const { blob, fileName } = await downloadPrescriptionPdf(prescriptionId, token);
  const objectUrl = window.URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
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

function formatAppointmentDate(dateValue) {
  const raw = String(dateValue || '').trim();
  if (!raw) return '';

  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]);
    const day = Number(isoDateOnly[3]);
    const safeLocalDate = new Date(year, month - 1, day, 12, 0, 0);
    return safeLocalDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  return raw;
}

function formatAppointmentTime(timeValue) {
  const raw = String(timeValue || '').trim();
  if (!raw) return '';

  const hhmm = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    const base = new Date();
    base.setHours(hours, minutes, 0, 0);
    return base.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return raw;
}

function formatAppointmentDateTime(dateValue, timeValue) {
  const dateLabel = formatAppointmentDate(dateValue);
  const timeLabel = formatAppointmentTime(timeValue);

  if (dateLabel && timeLabel) return `${dateLabel} ${timeLabel}`;
  if (dateLabel) return dateLabel;
  if (timeLabel) return timeLabel;
  return 'Date/Time TBD';
}

function filterDashboardDataLocally(rawDashboard, rawQuery) {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!rawDashboard || !query) return rawDashboard;

  const matches = (...values) => values.some((value) => String(value || '').toLowerCase().includes(query));

  const todayAppointments = Array.isArray(rawDashboard?.todaySchedule?.appointments)
    ? rawDashboard.todaySchedule.appointments.filter((item) => matches(
      item?.patient?.name,
      item?.chiefComplaint,
      item?.status,
      item?.time,
      item?.type
    ))
    : [];

  const upcomingAppointments = Array.isArray(rawDashboard?.upcomingAppointments?.appointments)
    ? rawDashboard.upcomingAppointments.appointments.filter((item) => matches(
      item?.patient?.name,
      item?.chiefComplaint,
      item?.status,
      item?.time,
      item?.date,
      item?.type
    ))
    : [];

  const queuePatients = Array.isArray(rawDashboard?.currentQueue?.patients)
    ? rawDashboard.currentQueue.patients.filter((item) => matches(
      item?.patient_name,
      item?.patientName,
      item?.name,
      item?.chief_complaint,
      item?.symptoms,
      item?.department,
      item?.status,
      item?.priority_level,
      item?.urgency_level
    ))
    : [];

  const waitingCount = queuePatients.filter((item) => String(item?.status || '').toUpperCase() === 'WAITING').length;
  const avgWait = waitingCount
    ? Math.round(queuePatients
      .filter((item) => String(item?.status || '').toUpperCase() === 'WAITING')
      .reduce((sum, item) => sum + Number(item?.estimated_wait_minutes || item?.estimatedWaitMinutes || item?.wait_minutes || 0), 0) / waitingCount)
    : 0;

  return {
    ...rawDashboard,
    todaySchedule: {
      ...(rawDashboard.todaySchedule || {}),
      totalAppointments: todayAppointments.length,
      appointments: todayAppointments
    },
    upcomingAppointments: {
      ...(rawDashboard.upcomingAppointments || {}),
      total: upcomingAppointments.length,
      appointments: upcomingAppointments
    },
    currentQueue: {
      ...(rawDashboard.currentQueue || {}),
      waiting_count: waitingCount,
      avg_wait_minutes: avgWait,
      patients: queuePatients
    },
    statistics: {
      ...(rawDashboard.statistics || {}),
      patientsWaiting: waitingCount,
      avgWaitTime: avgWait
    }
  };
}

export default function DoctorPortalPage() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState('');

  const [token, setToken] = useState('');
  const [doctor, setDoctor] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [fullDashboard, setFullDashboard] = useState(null);

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
  const [appointmentNotes, setAppointmentNotes] = useState({});
  const [appointmentsState, setAppointmentsState] = useState({});
  const [doctorHistory, setDoctorHistory] = useState({
    totals: { totalVisits: 0, totalPatientsTreated: 0, treatedToday: 0 },
    treatedPatients: [],
    visits: []
  });
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureUploading, setSignatureUploading] = useState(false);

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

  const searchQuery = useMemo(() => String(globalSearch || '').trim().toLowerCase(), [globalSearch]);

  const filteredQueue = useMemo(() => {
    if (!searchQuery) return queue;
    return queue.filter((item) => (
      String(item.name || '').toLowerCase().includes(searchQuery)
      || String(item.symptoms || '').toLowerCase().includes(searchQuery)
      || String(item.department || '').toLowerCase().includes(searchQuery)
    ));
  }, [queue, searchQuery]);

  const filteredAppointments = useMemo(() => {
    if (!searchQuery) return appointments;
    return appointments.filter((item) => (
      String(item.patient?.name || '').toLowerCase().includes(searchQuery)
      || String(item.time || '').toLowerCase().includes(searchQuery)
      || String(item.status || '').toLowerCase().includes(searchQuery)
    ));
  }, [appointments, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGlobalSearch(String(globalSearch || '').trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [globalSearch]);

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

    const backendSearch = activeNav === 'Dashboard' ? debouncedGlobalSearch : '';

    loadPortalData(false, { search: backendSearch });

    const timer = setInterval(() => {
      loadPortalData(true, { search: backendSearch });
    }, 15000);

    return () => clearInterval(timer);
  }, [token, doctor?.id, activeNav, debouncedGlobalSearch]);

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

  async function loadPortalData(silent, options = {}) {
    if (!silent) setLoading(true);

    try {
      const dashboardSearch = String(options.search || '').trim();
      const [dashboardData, profileData, historyData] = await Promise.all([
        getDoctorDashboard(doctor.id, token, dashboardSearch),
        getDoctorProfile(token),
        getDoctorPatientHistory(doctor.id, token)
      ]);

      if (!dashboardSearch) {
        setFullDashboard(dashboardData);
        setDashboard(dashboardData);
      } else {
        const backendHasResults = Number(dashboardData?.todaySchedule?.totalAppointments || 0) > 0
          || Number(dashboardData?.upcomingAppointments?.total || 0) > 0
          || Array.isArray(dashboardData?.currentQueue?.patients) && dashboardData.currentQueue.patients.length > 0;

        if (backendHasResults || !fullDashboard) {
          setDashboard(dashboardData);
        } else {
          setDashboard(filterDashboardDataLocally(fullDashboard, dashboardSearch));
        }
      }
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

      const response = await createPrescription({
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

      const generatedPrescriptionId = response?.prescription?._id || response?.prescription?.id || null;
      const verificationHash = response?.verification?.hash || response?.prescription?.hash || null;

      if (generatedPrescriptionId) {
        try {
          await triggerPrescriptionDownload(generatedPrescriptionId, token);
        } catch (downloadError) {
          toast.warning(downloadError?.message || 'Prescription generated, but auto-download failed');
        }
      }

      if (!profile?.signatureUrl) {
        toast.warning('Prescription generated without signature. Upload a PNG/JPEG signature in Profile for signed PDFs.');
      }

      if (verificationHash) {
        toast.success(`Prescription generated. Verification hash: ${verificationHash.slice(0, 10)}...`);
      } else {
        toast.success('Prescription generated and consultation completed');
      }

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

  async function handleSignatureUpload() {
    if (!signatureFile || !token) {
      toast.warning('Please select a signature image first');
      return;
    }

    try {
      setSignatureUploading(true);
      const response = await uploadDoctorSignature(signatureFile, token);
      setProfile((prev) => ({
        ...(prev || {}),
        signatureUrl: response?.signatureUrl || prev?.signatureUrl || null,
        signatureUpdatedAt: response?.signatureUpdatedAt || new Date().toISOString()
      }));
      setSignatureFile(null);
      toast.success(response?.message || 'Signature uploaded');
    } catch (error) {
      toast.error(error.message || 'Failed to upload signature');
    } finally {
      setSignatureUploading(false);
    }
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
      <section className="space-y-6">
        <Card className="border-violet-100/80 bg-gradient-to-r from-white via-violet-50/60 to-indigo-50/60 p-6 shadow-lg shadow-violet-100/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">Jeeva - Doctor Portal</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Clinical Command Center for {doctor?.name || 'Doctor'}</h2>
              <p className="mt-1 text-sm text-slate-600">Real-time queue visibility, triage intelligence, and consultation workflows in one place.</p>
            </div>
            <Button variant="doctorGradient" onClick={handleCallNextPatient}>Call Next Patient</Button>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Patients Waiting', value: metrics.waiting, icon: FiUsers, glow: 'from-violet-500 to-indigo-500' },
            { label: 'High Priority Cases', value: metrics.highPriority, icon: FiBell, glow: 'from-rose-400 to-red-500' },
            { label: "Today's Appointments", value: metrics.todayAppointments, icon: FiCalendar, glow: 'from-violet-500 to-fuchsia-500' },
            { label: 'Average Wait Time', value: `${metrics.avgWait} min`, icon: FiGrid, glow: 'from-indigo-500 to-violet-500' }
          ].map((item) => (
            <motion.div whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} key={item.label}>
              <Card className="group overflow-hidden border-violet-100/80 bg-white/80 p-5 shadow-md shadow-violet-100/40 backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                  <div className={`rounded-xl bg-gradient-to-br ${item.glow} p-2 text-white shadow`}> 
                    <item.icon size={16} />
                  </div>
                </div>
                <motion.p
                  key={String(item.value)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 text-3xl font-semibold text-slate-900"
                >
                  {item.value}
                </motion.p>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="border-red-100/80 bg-white/85 p-5 shadow-md shadow-rose-100/60">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Urgent Cases</h3>
              <Button size="sm" variant="doctorOutline" onClick={() => setActiveNav('Patient Queue')}>Open Queue</Button>
            </div>
            {!urgentCases.length && <p className="text-sm text-slate-500">No urgent alerts right now.</p>}
            <div className="space-y-3">
              {urgentCases.map((item, index) => (
                <motion.button
                  key={item.rowKey}
                  type="button"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="w-full rounded-2xl border border-red-100 bg-gradient-to-r from-red-50/70 to-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-200"
                  onClick={() => {
                    setActiveNav('Patient Queue');
                    handleSelectQueuePatient(item);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    {priorityBadge(item.urgency)}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{item.symptoms}</p>
                  <p className="mt-2 text-xs font-medium text-red-600">Triage score {item.score} - Wait {item.waitTime}</p>
                </motion.button>
              ))}
            </div>
          </Card>

          <Card className="border-violet-100/80 bg-white/85 p-5 shadow-md shadow-violet-100/50">
            <h3 className="mb-3 text-base font-semibold text-slate-900">Today's Schedule</h3>
            <div className="space-y-2">
              {(() => {
                const todayScheduleItems = appointments.slice(0, 6);
                if (!todayScheduleItems.length) {
                  return <p className="text-sm text-slate-500">No appointments for today.</p>;
                }

                return todayScheduleItems.map((item) => {
                const status = appointmentsState[item.id]?.status || item.status || 'upcoming';
                return (
                  <motion.div key={item.id} whileHover={{ x: 2 }} className="rounded-xl border border-violet-100 bg-violet-50/45 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{formatAppointmentTime(item.time)} - {item.patient?.name || 'Patient'}</p>
                      <Badge variant="slate" className="normal-case tracking-normal">{status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatAppointmentDate(item.displayDate)}</p>
                  </motion.div>
                );
                });
              })()}
            </div>
          </Card>
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
      <section className="space-y-6">
        <Card className="border-violet-100/80 bg-white/80 p-5 shadow-md shadow-violet-100/50 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Patient Queue Board</h2>
              <p className="text-sm text-slate-500">Card-based queue with AI triage priority and live consultation context.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="doctor" onClick={handleCallNextPatient}>Call Top Patient</Button>
              <Button variant="doctorOutline" onClick={() => loadPortalData(false)}>Refresh Queue</Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {!filteredQueue.length ? <p className="text-sm text-slate-500">No patients in queue.</p> : null}
            {filteredQueue.map((item, index) => {
              const active = selectedQueuePatient?.rowKey === item.rowKey;
              return (
                <motion.button
                  key={item.rowKey}
                  type="button"
                  onClick={() => handleSelectQueuePatient(item)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition ${active ? 'border-violet-300 bg-violet-50/80 shadow-violet-200/50' : 'border-violet-100 bg-white hover:border-violet-200'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border-violet-200">
                        <AvatarFallback>{String(item.name || 'P').slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.department}</p>
                      </div>
                    </div>
                    {priorityBadge(item.urgency)}
                  </div>
                  <p className="mt-3 text-xs text-slate-600 line-clamp-2">{item.symptoms}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-violet-50 p-2 text-slate-700">Risk Score <span className="ml-1 font-semibold">{item.score}</span></div>
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-700">Wait <span className="ml-1 font-semibold">{item.waitTime}</span></div>
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-700">Waited <span className="ml-1 font-semibold">{item.waitedTime}</span></div>
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-700">Status <span className="ml-1 font-semibold">{item.status === 'IN_CONSULTATION' ? 'IN CONSULTATION' : item.status}</span></div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </Card>

        <AnimatePresence mode="wait">
          {selectedQueuePatient ? (
            <motion.div
              key={selectedQueuePatient.rowKey}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid gap-5 xl:grid-cols-2"
            >
              <Card className="border-violet-100/80 bg-white/85 p-5 shadow-md shadow-violet-100/40">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">AI Clinical Extraction</h3>
                    <p className="text-xs text-slate-500">{selectedQueuePatient.name} - {selectedQueuePatient.department}</p>
                  </div>
                  {priorityBadge(selectedQueuePatient.urgency)}
                </div>

                <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Summary</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedRawAnalysis?.explainability_summary
                      || selectedQueuePatient.explainabilitySummary
                      || selectedPatientPreview?.todayTriage?.explainabilitySummary
                      || selectedPatientPreview?.todayTriage?.triageNotes
                      || 'No explainability summary available.'}
                  </p>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><span className="font-semibold text-slate-800">Chief Complaint:</span> {selectedAi.chief_complaint || selectedQueuePatient.symptoms || '-'}</div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><span className="font-semibold text-slate-800">Severity:</span> {String(selectedSeverity)}</div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><span className="font-semibold text-slate-800">Onset Type:</span> {String(selectedOnsetType)}</div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><span className="font-semibold text-slate-800">Symptom Category:</span> {String(selectedSymptomCategory)}</div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Symptoms</p>
                    {!selectedSymptoms.length ? <p className="mt-1 text-xs text-slate-500">No symptoms extracted.</p> : (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedSymptoms.map((symptom, idx) => <Badge key={`${symptom}-${idx}`} variant="purple" className="normal-case tracking-normal">{symptom}</Badge>)}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Red Flags</p>
                    {!selectedRedFlags.length ? <p className="mt-1 text-xs text-slate-500">No red flags detected.</p> : (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedRedFlags.map((flag, idx) => <Badge key={`${flag}-${idx}`} className="bg-red-100 text-red-700 normal-case tracking-normal">{flag}</Badge>)}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comorbidities</p>
                    {!selectedComorbidities.length ? <p className="mt-1 text-xs text-slate-500">No comorbidities extracted.</p> : (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedComorbidities.map((item, idx) => <Badge key={`${item}-${idx}`} variant="slate" className="normal-case tracking-normal">{item}</Badge>)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historical Summary</p>
                  <p className="mt-1 text-sm text-slate-600">{selectedRawAnalysis?.historical_summary ?? selectedQueuePatient.historicalSummary ?? selectedPatientPreview?.todayTriage?.historicalSummary ?? 'No historical summary available.'}</p>
                </div>

                <div className="mt-4 rounded-xl border border-violet-100 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">Previous Prescriptions</p>
                    <Badge variant="slate" className="normal-case tracking-normal">{patientPrescriptions.length} records</Badge>
                  </div>
                  {!patientPrescriptions.length ? <p className="text-xs text-slate-500">No previous prescriptions found.</p> : (
                    <div className="space-y-2">
                      {(showAllPrescriptionHistory ? patientPrescriptions : patientPrescriptions.slice(0, 5)).map((item) => {
                        const isExpanded = expandedPrescriptionId === item.id;
                        const full = item.full || {};
                        const fullMedicines = full.medicines || [];
                        return (
                          <div key={item.id} className="overflow-hidden rounded-xl border border-violet-100 bg-violet-50/40">
                            <button
                              type="button"
                              onClick={() => setExpandedPrescriptionId(isExpanded ? null : item.id)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700">{new Date(item.date).toLocaleDateString()} - {item.diagnosis || 'Diagnosis pending'}</p>
                                <p className="truncate text-xs text-slate-500">Doctor: {item.doctorName || '-'} | Medicines: {(item.medicines || []).join(', ') || 'Not recorded'}</p>
                              </div>
                              <span className="text-xs text-slate-500">{isExpanded ? 'Hide' : 'View'}</span>
                            </button>
                            <AnimatePresence>
                              {isExpanded ? (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-violet-100 bg-white px-3 py-2"
                                >
                                  {(full.form?.temperature || full.form?.bloodPressure || full.form?.notes) ? (
                                    <div className="mb-2 text-xs text-slate-600">
                                      {full.form?.temperature ? <span className="mr-3">Temp: {full.form.temperature}</span> : null}
                                      {full.form?.bloodPressure ? <span className="mr-3">BP: {full.form.bloodPressure}</span> : null}
                                      {full.form?.notes ? <span>Notes: {full.form.notes}</span> : null}
                                    </div>
                                  ) : null}
                                  <div className="space-y-1">
                                    {fullMedicines.map((med, idx) => (
                                      <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                        <span className="font-semibold text-slate-800">{med.name}</span>
                                        <span className="ml-2">{med.dosage || '-'} | {med.frequency || '-'} | {med.duration || '-'}</span>
                                        {med.instructions ? <span className="ml-2">{med.instructions}</span> : null}
                                      </div>
                                    ))}
                                  </div>
                                  {full.remarks ? <p className="mt-2 text-xs text-slate-600">Remarks: {full.remarks}</p> : null}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                      {patientPrescriptions.length > 5 ? (
                        <Button size="sm" variant="doctorOutline" onClick={() => setShowAllPrescriptionHistory((prev) => !prev)}>
                          {showAllPrescriptionHistory ? 'Show Less' : `View More (${patientPrescriptions.length - 5} more)`}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </Card>

              <Card className="border-violet-100/80 bg-white/85 p-5 shadow-md shadow-violet-100/40">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">Prescription Generator</h3>
                  <Badge variant="purple" className="normal-case tracking-normal">{prescriptionForm.medicines.length} medicines</Badge>
                </div>

                {selectedQueuePatient.status !== 'IN_CONSULTATION' ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Select patient in consultation state to generate prescription.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Diagnosis" value={prescriptionForm.diagnosis} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, diagnosis: event.target.value }))} />
                      <Input placeholder="Temperature (e.g. 101F)" value={prescriptionForm.temperature} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, temperature: event.target.value }))} />
                      <Input placeholder="Blood Pressure (e.g. 120/80)" value={prescriptionForm.bloodPressure} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, bloodPressure: event.target.value }))} />
                      <Input placeholder="Clinical Notes" value={prescriptionForm.notes} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, notes: event.target.value }))} />
                    </div>

                    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Medicine Search</p>
                      <Input placeholder="Type medicine name (min 2 letters)" value={medicineSearchText} onChange={(event) => setMedicineSearchText(event.target.value)} />
                      {medicineSearchLoading ? <p className="mt-1 text-xs text-slate-500">Searching...</p> : null}
                      {!medicineSearchLoading && medicineSearchError ? <p className="mt-1 text-xs text-red-500">{medicineSearchError}</p> : null}
                      {!medicineSearchLoading && !medicineSearchError && medicineSearchResults.length ? (
                        <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                          {medicineSearchResults.map((item) => (
                            <div key={item._id} className="rounded-xl border border-violet-100 bg-white p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-semibold text-slate-700">{item.name}</p>
                                  {Array.isArray(item.strength) && item.strength.length ? <p className="text-xs text-slate-500">{item.strength.slice(0, 6).join(', ')}</p> : null}
                                </div>
                                <Button size="sm" variant="doctorOutline" onClick={() => addMedicineToPrescription(item)}>Add</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input placeholder="Custom medicine name" value={customMedicineName} onChange={(event) => setCustomMedicineName(event.target.value)} className="w-full sm:max-w-xs" />
                        <Button size="sm" variant="doctorOutline" onClick={addCustomMedicineToPrescription}>Add Custom</Button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Quick Defaults</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <Input value={bulkFrequency} onChange={(event) => setBulkFrequency(event.target.value)} placeholder="Frequency" />
                          <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">{QUICK_FREQUENCY_OPTIONS.map((opt) => <Button key={`freq-${opt}`} size="sm" variant="doctorOutline" className="px-2 py-1 text-xs" onClick={() => setBulkFrequency(opt)}>{opt}</Button>)}</div>
                        </div>
                        <div>
                          <Input value={bulkDuration} onChange={(event) => setBulkDuration(event.target.value)} placeholder="Duration" />
                          <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">{QUICK_DURATION_OPTIONS.map((opt) => <Button key={`duration-${opt}`} size="sm" variant="doctorOutline" className="px-2 py-1 text-xs" onClick={() => setBulkDuration(opt)}>{opt}</Button>)}</div>
                        </div>
                        <div>
                          <Input value={bulkInstructions} onChange={(event) => setBulkInstructions(event.target.value)} placeholder="Instruction" />
                          <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">{QUICK_INSTRUCTION_OPTIONS.map((opt) => <Button key={`instr-${opt}`} size="sm" variant="doctorOutline" className="px-2 py-1 text-xs" onClick={() => setBulkInstructions(opt)}>{opt}</Button>)}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="doctorOutline" onClick={applyBulkDefaultsToAllMedicines} disabled={!prescriptionForm.medicines.length}>Apply Defaults To All</Button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {prescriptionForm.medicines.map((med, index) => (
                        <motion.div key={`${med.medicineId}-${index}`} layout className="rounded-xl border border-violet-100 bg-violet-50/45 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800">#{index + 1} {med.name}</p>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="doctorOutline" onClick={() => duplicatePrescriptionMedicine(index)}>Duplicate</Button>
                              <Button size="sm" variant="doctorOutline" onClick={() => removePrescriptionMedicine(index)}>Remove</Button>
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input placeholder="Dosage" value={med.dosage || ''} onChange={(event) => updatePrescriptionMedicine(index, 'dosage', event.target.value)} />
                            <Input placeholder="Frequency" value={med.frequency || ''} onChange={(event) => updatePrescriptionMedicine(index, 'frequency', event.target.value)} />
                            <Input placeholder="Duration" value={med.duration || ''} onChange={(event) => updatePrescriptionMedicine(index, 'duration', event.target.value)} />
                            <Input placeholder="Instructions" value={med.instructions || ''} onChange={(event) => updatePrescriptionMedicine(index, 'instructions', event.target.value)} />
                          </div>
                          <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">
                            {QUICK_FREQUENCY_OPTIONS.map((opt) => <Button key={`med-f-${index}-${opt}`} size="sm" variant="doctorOutline" className="px-2 py-1 text-xs" onClick={() => updatePrescriptionMedicine(index, 'frequency', opt)}>{opt}</Button>)}
                            {QUICK_DURATION_OPTIONS.map((opt) => <Button key={`med-d-${index}-${opt}`} size="sm" variant="doctorOutline" className="px-2 py-1 text-xs" onClick={() => updatePrescriptionMedicine(index, 'duration', opt)}>{opt}</Button>)}
                            {QUICK_INSTRUCTION_OPTIONS.map((opt) => <Button key={`med-i-${index}-${opt}`} size="sm" variant="doctorOutline" className="px-2 py-1 text-xs" onClick={() => updatePrescriptionMedicine(index, 'instructions', opt)}>{opt}</Button>)}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-3">
                      <Textarea rows={3} placeholder="Doctor remarks" value={prescriptionForm.remarks} onChange={(event) => setPrescriptionForm((prev) => ({ ...prev, remarks: event.target.value }))} />
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button variant="doctor" onClick={handleGeneratePrescription} disabled={prescriptionSubmitting}>{prescriptionSubmitting ? 'Generating...' : 'Generate Prescription'}</Button>
                    </div>
                  </>
                )}
              </Card>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-dashed border-violet-200 bg-white/60 p-10 text-center text-sm text-slate-500">
              Select a patient card to open the detail panel.
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );
  }

  function renderAppointments() {
    return (
      <section className="space-y-4">
        <Card className="border-violet-100/80 bg-white/85 p-5 shadow-md shadow-violet-100/40">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Appointments</h2>
            <Badge variant="purple" className="normal-case tracking-normal">{filteredAppointments.length} scheduled</Badge>
          </div>
          <div className="space-y-3">
          {!filteredAppointments.length && <p className="text-sm text-slate-500">No booked appointments found for upcoming days.</p>}
          {filteredAppointments.map((item, index) => {
            const state = appointmentsState[item.id] || {};
            const status = state.status || item.status || 'upcoming';
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} whileHover={{ y: -3 }} className="rounded-2xl border border-violet-100 bg-gradient-to-r from-white to-violet-50/45 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{formatAppointmentDateTime(item.displayDate, item.time)} - {item.patient?.name || 'Patient'}</p>
                  <Badge variant="slate" className="normal-case tracking-normal">{status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="doctor" onClick={() => updateAppointmentStatus(item.id, 'completed')}>Complete Visit</Button>
                  <Button size="sm" variant="doctorOutline" onClick={() => updateAppointmentStatus(item.id, 'rescheduled')}>Reschedule</Button>
                </div>
                <div className="mt-3">
                  <Textarea
                    rows={2}
                    placeholder="Add consultation note"
                    value={appointmentNotes[item.id] || ''}
                    onChange={(event) => setAppointmentNotes((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  />
                  <Button type="button" size="sm" variant="doctor" className="mt-2" onClick={() => saveAppointmentNote(item.id)}>Save Note</Button>
                </div>
              </motion.div>
            );
          })}
          </div>
        </Card>
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
      <section className="space-y-4">
        <Card className="space-y-4 border-violet-100/80 bg-white/85 shadow-md shadow-violet-100/40">
          <h2 className="text-xl font-semibold text-slate-900">Availability Scheduler</h2>
          <p className="text-sm text-slate-600">Define shift, appointment window, slot duration, and breaks. Slots auto-generate and update in real time.</p>

          <div className="rounded-xl border border-violet-100 bg-violet-50/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Daywise View (Next 7 Days)</p>
            <div className="flex flex-wrap gap-2">
              {daywiseOptions.map((option) => {
                const active = option.value === selectedDate;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={active ? 'doctor' : 'doctorOutline'}
                    onClick={() => setAvailabilityDate(option.value)}
                  >
                    {option.day} {option.shortDate}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-violet-100 bg-white p-4">
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date (next 7 days)</label>
                <select className="h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-700" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)}>
                  {daywiseOptions.map((date) => (
                    <option key={date.value} value={date.value}>{date.day} {date.shortDate}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Shift Start</label>
                <Input type="time" value={scheduleForm.shiftStart} onChange={(e) => setScheduleForm((p) => ({ ...p, shiftStart: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Shift End</label>
                <Input type="time" value={scheduleForm.shiftEnd} onChange={(e) => setScheduleForm((p) => ({ ...p, shiftEnd: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Slot Duration (min)</label>
                <Input type="number" min="5" max="180" value={scheduleForm.slotDuration} onChange={(e) => setScheduleForm((p) => ({ ...p, slotDuration: e.target.value }))} />
              </div>
            </div>

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Appointment Start</label>
                <Input type="time" value={scheduleForm.appointmentStart} onChange={(e) => setScheduleForm((p) => ({ ...p, appointmentStart: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Appointment End</label>
                <Input type="time" value={scheduleForm.appointmentEnd} onChange={(e) => setScheduleForm((p) => ({ ...p, appointmentEnd: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="doctor"
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
              </Button>
              <Button
                type="button"
                variant="doctorOutline"
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
              </Button>
              <Button
                type="button"
                variant="doctorOutline"
                onClick={async () => {
                  await refreshAvailabilityData();
                }}
              >
                Refresh Day Data
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-violet-100 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Break Controls</h3>
            <p className="mb-3 mt-1 text-sm text-slate-600">Define break ranges within the appointment window.</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Break Start</label>
                <Input type="time" value={breakForm.breakStart} onChange={(e) => setBreakForm((p) => ({ ...p, breakStart: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Break End</label>
                <Input type="time" value={breakForm.breakEnd} onChange={(e) => setBreakForm((p) => ({ ...p, breakEnd: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button
                  variant="doctor"
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
                </Button>
              </div>
            </div>

            {editingBreakId ? (
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="doctorOutline"
                  onClick={() => {
                    setEditingBreakId('');
                    setBreakForm({ breakStart: '11:00', breakEnd: '11:20' });
                  }}
                >
                  Cancel Break Edit
                </Button>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing Breaks</p>
              {!availabilityBreaks.length && <p className="text-sm text-slate-500">No breaks added for selected day.</p>}
              {!!availabilityBreaks.length && availabilityBreaks.map((item) => (
                <div key={item._id || item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">{item.breakStart} - {item.breakEnd}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="doctorOutline"
                      onClick={() => {
                        setEditingBreakId(item._id || item.id);
                        setBreakForm({ breakStart: item.breakStart, breakEnd: item.breakEnd });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="doctorOutline"
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
                    </Button>
                  </div>
                </div>
              ))}
            </div>

          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/45 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Generated Slots</h3>
            <p className="mb-3 text-sm text-slate-600">Viewing slots for {selectedDateMeta.full}</p>

            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Custom Slot Start</label>
                <Input type="time" value={slotForm.startTime} onChange={(e) => setSlotForm((prev) => ({ ...prev, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Custom Slot End</label>
                <Input type="time" value={slotForm.endTime} onChange={(e) => setSlotForm((prev) => ({ ...prev, endTime: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                <select className="h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm text-slate-700" value={slotForm.status} onChange={(e) => setSlotForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="BLOCKED">BLOCKED</option>
                  <option value="BOOKED">BOOKED</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="doctor"
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
                </Button>
              </div>
            </div>

            {editingSlotId ? (
              <div className="mb-3">
                <Button
                  type="button"
                  size="sm"
                  variant="doctorOutline"
                  onClick={() => {
                    setEditingSlotId('');
                    setSlotForm({ startTime: '10:00', endTime: '10:20', status: 'AVAILABLE' });
                  }}
                >
                  Cancel Slot Edit
                </Button>
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
                      <Button
                        type="button"
                        size="sm"
                        variant="doctorOutline"
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
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="doctorOutline"
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
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
            )}
        </div>
        </Card>
      </section>
    );
  }

  function renderHistory() {
    const treatedPatients = doctorHistory?.treatedPatients || [];
    const visits = doctorHistory?.visits || [];
    const totals = doctorHistory?.totals || { totalVisits: 0, totalPatientsTreated: 0, treatedToday: 0 };

    return (
      <section className="space-y-4">
        <Card className="space-y-4 border-violet-100/80 bg-white/85 shadow-md shadow-violet-100/40">
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

        <article className="rounded-2xl border border-violet-100 bg-white p-4">
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

        <article className="rounded-2xl border border-violet-100 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Visits / Treatments</h3>
          {!visits.length && <p className="text-sm text-slate-500">No visit records available yet.</p>}
          {!!visits.length && (
          <div className="space-y-2">
            {visits.map((visit, index) => (
              <motion.div key={visit.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{new Date(visit.visitDate).toLocaleDateString()} - {visit.patientName || 'Patient'}</p>
                <p className="text-xs text-slate-600">Chief Complaint: {visit.chiefComplaint || '-'}</p>
                <p className="text-xs text-slate-600">Diagnosis: {visit.diagnosis || 'Pending'}</p>
                <p className="text-xs text-slate-600">Treatment: {visit.treatment || 'No treatment notes'}</p>
                <p className="text-xs text-slate-600">Doctor Notes: {visit.doctorNotes || '-'}</p>
              </motion.div>
            ))}
          </div>
          )}
        </article>
        </Card>
      </section>
    );
  }

  function renderProfile() {
    const signatureUrl = profile?.signatureUrl || null;

    return (
      <section className="space-y-4">
        <Card className="space-y-4 border-violet-100/80 bg-white/85 shadow-md shadow-violet-100/40">
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

        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-700">Prescription Signature</h3>
          <p className="mt-1 text-sm text-slate-600">Upload once and it will be embedded into generated prescriptions with QR verification.</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={(event) => setSignatureFile(event.target.files?.[0] || null)}
              className="block w-full max-w-sm cursor-pointer rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
            <Button
              type="button"
              variant="doctor"
              onClick={handleSignatureUpload}
              disabled={signatureUploading || !signatureFile}
            >
              {signatureUploading ? 'Uploading...' : 'Upload Signature'}
            </Button>
          </div>

          <div className="mt-3 rounded-xl border border-violet-100 bg-white p-3">
            {signatureUrl ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Current Signature</p>
                <img src={signatureUrl} alt="Doctor signature" className="max-h-20 w-auto object-contain" />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No signature uploaded yet.</p>
            )}
          </div>
        </div>
        </Card>
      </section>
    );
  }

  function renderContent() {
    if (activeNav === 'Dashboard') return renderDashboard();
    if (activeNav === 'Patient Queue') return renderQueue();
    if (activeNav === 'Appointments') return renderAppointments();
    if (activeNav === 'Availability') return renderAvailability();
    if (activeNav === 'Patient History') return renderHistory();
    return renderProfile();
  }

  function renderSidebarContent(isMobile = false) {
    const collapsed = isMobile ? false : sidebarCollapsed;

    return (
      <>
      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          {!collapsed ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Doctor Workspace</p> : null}
          {!collapsed ? <h1 className="text-lg font-semibold text-slate-900">Jeeva</h1> : null}
        </div>
        <Button size="sm" variant="doctorGhost" className={`hidden lg:inline-flex ${isMobile ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed((prev) => !prev)}>
          {collapsed ? <FiMenu size={16} /> : <FiX size={16} />}
        </Button>
      </div>

      <nav className={`space-y-1 ${collapsed ? 'mt-3' : ''}`}>
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item];
          const active = activeNav === item;
          return (
            <motion.button
              whileHover={{ x: collapsed ? 0 : 2 }}
              key={item}
              type="button"
              title={collapsed ? item : undefined}
              className={`group flex w-full items-center rounded-xl text-sm transition ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'} ${active ? 'bg-violet-100 text-violet-700' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'}`}
              onClick={() => {
                setActiveNav(item);
                setMobileSidebarOpen(false);
              }}
            >
              <Icon size={17} />
              {!collapsed ? <span>{item}</span> : null}
              {!collapsed && active ? <span className="ml-auto h-2 w-2 rounded-full bg-violet-500" /> : null}
            </motion.button>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-violet-100 pt-4">
        <Button variant={isMobile ? 'doctorOutline' : 'doctor'} className={`w-full ${collapsed ? 'px-2' : ''}`} onClick={() => loadPortalData(false)} disabled={loading}>
          {collapsed ? 'Sync' : loading ? 'Refreshing...' : 'Sync Now'}
        </Button>
        <Button className="mt-2 w-full" variant="doctorOutline" onClick={handleLogout}><FiLogOut size={14} /> {!collapsed ? 'Logout' : 'Sign out'}</Button>
      </div>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.16),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.14),_transparent_35%)]" />

      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-0 lg:grid-cols-[auto_1fr]">
        <motion.aside
          animate={{ width: sidebarCollapsed ? 92 : 270 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="sticky top-0 hidden h-screen border-r border-violet-100 bg-white/80 p-4 backdrop-blur lg:block"
        >
          {renderSidebarContent(false)}
        </motion.aside>

        <AnimatePresence>
          {mobileSidebarOpen ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="h-full w-[280px] bg-white p-4"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-3 flex justify-end">
                  <Button size="sm" variant="doctorGhost" onClick={() => setMobileSidebarOpen(false)}><FiX size={16} /></Button>
                </div>
                {renderSidebarContent(true)}
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className="p-4 sm:p-6">
          <Card className="mb-5 border-violet-100/80 bg-white/80 p-4 shadow-sm shadow-violet-100/60">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button variant="doctorGhost" size="sm" className="lg:hidden" onClick={() => setMobileSidebarOpen(true)}><FiMenu size={18} /></Button>
              <div className="relative min-w-[220px] flex-1">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <Input className="pl-9" placeholder="Search patients, appointments, symptoms" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} />
              </div>
              <Button variant="doctorGradient" size="sm" className="w-full sm:w-auto" onClick={handleCallNextPatient}>Call Next Patient</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded-full">
                    <Avatar>
                      {profile?.avatarUrl || doctor?.avatar ? <AvatarImage src={profile?.avatarUrl || doctor?.avatar} alt={doctor?.name || 'Doctor'} /> : null}
                      <AvatarFallback>{String(doctor?.name || 'DR').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{doctor?.name || 'Doctor'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setActiveNav('Profile')}>Open Profile</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleLogout}>Sign Out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>

          {loading ? <p className="text-sm text-slate-500">Loading doctor portal...</p> : null}
          {!loading ? (
            <AnimatePresence mode="wait">
              <motion.div key={activeNav} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          ) : null}
        </section>
      </div>
    </main>
  );
}

