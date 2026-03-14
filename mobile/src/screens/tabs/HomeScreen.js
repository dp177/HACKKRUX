import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import {
  bookAppointment,
  getUpcomingAppointments,
  getDoctorAvailableSlots,
  getDoctorsByDepartment,
  getHospitalByQrIdentifier,
  getHospitalDetails,
  getHospitals
} from '../../api';
import DepartmentSelector from '../../features/care/DepartmentSelector';
import DoctorSelector from '../../features/care/DoctorSelector';
import HospitalDetailCard from '../../features/care/HospitalDetailCard';
import SlotSelector from '../../features/care/SlotSelector';
import TriageForm from '../../features/care/TriageForm';
import { useAuthStore } from '../../store/authStore';
import { usePatientFlowStore } from '../../store/patientFlowStore';
import { colors, radii, spacing } from '../../theme/tokens';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDayLabel(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { day: 'Day', monthDate: date };
  }

  return {
    day: parsed.toLocaleDateString('en-US', { weekday: 'short' }),
    monthDate: parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}

const PENDING_QR_HOSPITAL_ID_KEY = 'pendingQrHospitalId';

function parseHospitalIdFromQr(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  const matched = value.match(/^https?:\/\/[^/]+\/hospital\/([^/?#]+)/i);
  if (matched?.[1]) return decodeURIComponent(matched[1]);

  if (/^[a-zA-Z0-9_-]{8,}$/.test(value)) {
    return value;
  }

  return null;
}

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtnPlaceholder} />
      )}
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backBtnPlaceholder} />
    </View>
  );
}

export default function HomeScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  const {
    selectedHospital,
    selectedDepartment,
    selectedDoctor,
    selectedDate,
    selectedSlot,
    flowMode,
    setSelectedHospital,
    setSelectedDepartment,
    setSelectedDoctor,
    setSelectedDate,
    setSelectedSlot,
    setFlowMode,
    setActiveQueue,
    resetFlow
  } = usePatientFlowStore();

  const [query, setQuery] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [hospitalDepartments, setHospitalDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [routes, setRoutes] = useState([{ name: 'hospitals' }]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fallbackInfo, setFallbackInfo] = useState({ level: '', name: '' });
  const [hospitalLoadingId, setHospitalLoadingId] = useState('');
  const [slotFallbackMessage, setSlotFallbackMessage] = useState('');
  const [slotInfoMessage, setSlotInfoMessage] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [qrScanBusy, setQrScanBusy] = useState(false);
  const [qrErrorMessage, setQrErrorMessage] = useState('');
  const [loadingDate, setLoadingDate] = useState('');
  const [bookingReason, setBookingReason] = useState('');
  const [upcomingPreview, setUpcomingPreview] = useState(null);
  const [upcomingPreviewLoading, setUpcomingPreviewLoading] = useState(false);
  const [triageOutcome, setTriageOutcome] = useState(null);
  const [triageInputMode, setTriageInputMode] = useState('text');

  const greetingName = user?.name?.split(' ')[0] || 'Patient';

  useEffect(() => {
    loadHospitals();
    tryResumePendingQrScan();
  }, []);

  useEffect(() => {
    loadUpcomingPreview();
  }, [token]);

  const currentRoute = routes[routes.length - 1]?.name || 'hospitals';

  function pushRoute(name) {
    setRoutes((prev) => [...prev, { name }]);
  }

  function popRoute() {
    setRoutes((prev) => (prev.length > 1 ? prev.slice(0, prev.length - 1) : prev));
  }

  function resetToHome() {
    setRoutes([{ name: 'hospitals' }]);
  }

  async function loadHospitals(isRefresh = false) {
    console.log('[HomeFlow] load_hospitals_start', { isRefresh });
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getHospitals();
      setHospitals(data?.hospitals || []);
      console.log('[HomeFlow] load_hospitals_success', { count: data?.hospitals?.length || 0 });
    } catch (error) {
      console.log('[HomeFlow] load_hospitals_error', { message: error?.message || 'unknown' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadUpcomingPreview() {
    if (!token) {
      setUpcomingPreview(null);
      return;
    }

    setUpcomingPreviewLoading(true);
    try {
      const response = await getUpcomingAppointments(token);
      const first = response?.appointments?.[0] || null;
      setUpcomingPreview(first);
    } catch (error) {
      console.log('[HomeFlow] upcoming_preview_error', { message: error?.message || 'unknown' });
      setUpcomingPreview(null);
    } finally {
      setUpcomingPreviewLoading(false);
    }
  }

  async function handleSelectHospital(hospital) {
    if (hospitalLoadingId === hospital.id) {
      return;
    }

    setHospitalLoadingId(hospital.id);
    console.log('[HomeFlow] select_hospital', { hospitalId: hospital.id, hospitalName: hospital.name });
    resetFlow();
    setSelectedHospital(hospital);

    try {
      const detail = await getHospitalDetails(hospital.id);
      setHospitalDepartments(detail?.departments || []);
      console.log('[HomeFlow] hospital_departments_loaded', { count: detail?.departments?.length || 0 });
      pushRoute('hospital_detail');
    } catch (error) {
      console.log('[HomeFlow] hospital_departments_error', { message: error?.message || 'unknown' });
      setHospitalDepartments([]);
      pushRoute('hospital_detail');
    } finally {
      setHospitalLoadingId('');
    }
  }

  async function navigateWithHospitalIdentifier(hospitalId, source = 'qr') {
    if (!hospitalId) {
      Alert.alert('Invalid QR', 'Hospital not found in scanned QR code.');
      return;
    }

    try {
      const detail = await getHospitalByQrIdentifier(hospitalId);
      const hospital = detail?.hospital ? { ...detail.hospital, id: detail.hospital.id || hospitalId } : null;

      if (!hospital?.id) {
        throw new Error('Hospital not found');
      }

      resetFlow();
      setSelectedHospital(hospital);
      setHospitalDepartments(detail?.departments || []);
      setFallbackInfo({ level: '', name: '' });
      setQrErrorMessage('');
      setRoutes([{ name: 'hospitals' }, { name: 'hospital_detail' }]);
      await AsyncStorage.removeItem(PENDING_QR_HOSPITAL_ID_KEY);
      console.log('[HomeFlow] qr_hospital_loaded', {
        source,
        hospitalId: hospital.id,
        departmentCount: detail?.departments?.length || 0
      });
    } catch (error) {
      const message = error?.message || 'Unable to load hospital from QR';
      console.log('[HomeFlow] qr_hospital_error', { source, hospitalId, message });
      setQrErrorMessage(message);

      const lower = message.toLowerCase();
      if (lower.includes('request failed') || lower.includes('network') || lower.includes('fetch')) {
        await AsyncStorage.setItem(PENDING_QR_HOSPITAL_ID_KEY, String(hospitalId));
        Alert.alert('Offline', 'Hospital QR saved. The app will retry automatically when network is available.');
      } else if (lower.includes('not found')) {
        Alert.alert('Hospital not found', 'Scanned QR is invalid or hospital does not exist.');
      } else if (lower.includes('unavailable')) {
        Alert.alert('Hospital unavailable', 'Hospital currently unavailable. Please contact reception.');
      } else {
        Alert.alert('Scan failed', message);
      }
    }
  }

  async function tryResumePendingQrScan() {
    try {
      const pendingId = await AsyncStorage.getItem(PENDING_QR_HOSPITAL_ID_KEY);
      if (!pendingId) return;

      console.log('[HomeFlow] retry_pending_qr', { hospitalId: pendingId });
      await navigateWithHospitalIdentifier(pendingId, 'pending_retry');
    } catch (error) {
      console.log('[HomeFlow] retry_pending_qr_error', { message: error?.message || 'unknown' });
    }
  }

  async function openQrScanner() {
    const granted = cameraPermission?.granted ? true : await requestCameraPermission();
    const isGranted = Boolean(granted?.granted || granted);

    if (!isGranted) {
      Alert.alert('Camera permission needed', 'Allow camera access to scan hospital QR.');
      return;
    }

    setQrErrorMessage('');
    setQrScanBusy(false);
    pushRoute('scan_qr');
  }

  async function onQrCodeScanned(result) {
    if (qrScanBusy) return;

    const hospitalId = parseHospitalIdFromQr(result?.data);
    if (!hospitalId) {
      Alert.alert('Invalid QR', 'This QR is not a valid hospital QR.');
      return;
    }

    setQrScanBusy(true);
    await navigateWithHospitalIdentifier(hospitalId, 'camera_scan');
    setQrScanBusy(false);
  }

  function startJoinQueue() {
    if (!hospitalDepartments.length) {
      setFallbackInfo({ level: 'hospital', name: selectedHospital?.name || 'Selected hospital' });
      pushRoute('no_departments');
      console.log('[HomeFlow] no_departments_hospital', { hospitalId: selectedHospital?.id });
      return;
    }

    setFlowMode('queue');
    pushRoute('department');
    console.log('[HomeFlow] mode_set', { mode: 'queue' });
  }

  function startBookAppointment() {
    if (!hospitalDepartments.length) {
      setFallbackInfo({ level: 'hospital', name: selectedHospital?.name || 'Selected hospital' });
      pushRoute('no_departments');
      console.log('[HomeFlow] no_departments_hospital', { hospitalId: selectedHospital?.id });
      return;
    }

    if ((selectedHospital?.doctorCount || 0) < 1) {
      setFallbackInfo({ level: 'hospital', name: selectedHospital?.name || 'Selected hospital' });
      pushRoute('no_doctors');
      console.log('[HomeFlow] no_doctors_hospital', { hospitalId: selectedHospital?.id });
      return;
    }

    setFlowMode('booking');
    pushRoute('department');
    console.log('[HomeFlow] mode_set', { mode: 'booking' });
  }

  async function handleSelectDepartment(department) {
    setSelectedDepartment(department);
    console.log('[HomeFlow] select_department', { departmentId: department.id, mode: flowMode });

    if (flowMode === 'booking') {
      try {
        const response = await getDoctorsByDepartment(department.id);
        const doctorList = response?.doctors || [];
        setDoctors(doctorList);
        console.log('[HomeFlow] doctors_loaded', { count: doctorList.length || 0 });
        if (!doctorList.length) {
          setFallbackInfo({ level: 'department', name: department?.name || 'Selected department' });
          pushRoute('no_doctors');
          console.log('[HomeFlow] no_doctors_department', { departmentId: department.id });
          return;
        }
        pushRoute('doctor');
      } catch (error) {
        console.log('[HomeFlow] doctors_error', { message: error?.message || 'unknown' });
        setDoctors([]);
        setFallbackInfo({ level: 'department', name: department?.name || 'Selected department' });
        pushRoute('no_doctors');
      }
      return;
    }

    Alert.alert(
      'Choose Input Mode',
      Constants.appOwnership === 'expo'
        ? 'Voice works in Expo Go with record-and-transcribe mode. Choose your input method.'
        : 'How would you like to answer triage questions?',
      [
        {
          text: 'Voice Input',
          onPress: () => {
            setTriageInputMode('voice');
            pushRoute('triage');
          }
        },
        {
          text: 'Text Input',
          onPress: () => {
            setTriageInputMode('text');
            pushRoute('triage');
          }
        }
      ],
      { cancelable: true }
    );
  }

  async function handleSelectDoctor(doctor) {
    setSelectedDoctor(doctor);
    setSelectedDate(todayIso());
    setSelectedSlot('');
    setSelectedSlotId('');
    setBookingReason('');
    setSlotFallbackMessage('');
    setSlotInfoMessage('');

    console.log('[HomeFlow] select_doctor', { doctorId: doctor.id });
    pushRoute('date');
  }

  function getUpcomingDates(days = 7) {
    const dates = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  async function handleSelectDate(date) {
    if (loadingDate === date) {
      return;
    }

    setLoadingDate(date);
    setSelectedDate(date);
    setSelectedSlot('');
    setSelectedSlotId('');
    setSlotInfoMessage('');
    if (!selectedDoctor?.id) {
      setLoadingDate('');
      return;
    }

    console.log('[HomeFlow] select_date', { doctorId: selectedDoctor.id, date });
    try {
      const response = await getDoctorAvailableSlots(selectedDoctor.id, date);
      const loadedSlots = response?.availableSlots || response?.slots || [];
      const availableCount = loadedSlots.filter((slot) => slot?.available).length;
      setSlots(loadedSlots);
      console.log('[HomeFlow] doctor_slots_response_meta', {
        source: response?.source || 'endpoint',
        hasMessage: Boolean(response?.message),
        total: loadedSlots.length,
        available: availableCount,
        firstSlot: loadedSlots[0] || null
      });
      if (response?.message) {
        setSlotInfoMessage(response.message);
      }
      console.log('[HomeFlow] doctor_slots_loaded', { count: loadedSlots.length || 0, availableCount });
      if (!loadedSlots.length) {
        setFallbackInfo({ level: 'doctor', name: selectedDoctor?.name || 'Selected doctor' });
        setSlotFallbackMessage('No available slots for the selected date.');
        pushRoute('no_slots');
        console.log('[HomeFlow] no_slots_doctor', { doctorId: selectedDoctor.id, date });
        return;
      }

      if (!availableCount) {
        setSlotInfoMessage('Slots are visible, but currently all are booked or blocked for this day.');
      }

      console.log('[HomeFlow] route_push_slot', { from: currentRoute, to: 'slot', date, total: loadedSlots.length });
      pushRoute('slot');
    } catch (error) {
      console.log('[HomeFlow] doctor_slots_error', { message: error?.message || 'unknown' });
      setSlots([]);
      setFallbackInfo({ level: 'doctor', name: selectedDoctor?.name || 'Selected doctor' });
      setSlotFallbackMessage(error?.message || 'Unable to fetch slots right now.');
      pushRoute('no_slots');
    } finally {
      setLoadingDate('');
    }
  }

  function handleSelectSlot(slot) {
    const resolvedTime = slot?.time || slot?.startTime || '';
    setSelectedSlot(resolvedTime);
    setSelectedSlotId(slot.slotId || '');
    if (flowMode === 'booking') {
      pushRoute('booking_details');
    } else {
      pushRoute('triage');
    }
    console.log('[HomeFlow] select_slot', { slotTime: resolvedTime, slotId: slot.slotId || null });
  }

  function handleTriageComplete(result) {
    console.log('[HomeFlow] triage_complete', {
      triageId: result?.triage?.id,
      riskScore: result?.triage?.risk_score,
      urgencyLevel: result?.triage?.urgency_level,
      queuePosition: result?.queue?.queuePosition
    });
    setActiveQueue({
      hospitalName: result?.queue?.hospitalName || result?.queue?.hospital || selectedHospital?.name,
      departmentName: result?.queue?.departmentName || result?.queue?.department || result?.triage?.department || selectedDepartment?.name,
      priorityLevel: result?.triage?.urgency_level,
      tokenNumber: result?.queue?.tokenNumber,
      queuePosition: result?.queue?.queuePosition,
      patientsAhead: result?.queue?.patientsAhead,
      estimatedWaitMinutes: result?.queue?.estimatedWaitMinutes,
      recommendedSpecialty: result?.triage?.department,
      riskScore: result?.triage?.risk_score,
      summary: result?.triage?.explainability_summary,
      redFlags: result?.triage?.red_flags || []
    });
    setTriageOutcome({
      tokenNumber: result?.queue?.tokenNumber ?? result?.queue?.queuePosition ?? null,
      queuePosition: result?.queue?.queuePosition ?? null,
      estimatedWaitMinutes: result?.queue?.estimatedWaitMinutes ?? null,
      urgencyLevel: result?.triage?.urgency_level ?? null,
      riskScore: result?.triage?.risk_score ?? null,
      department: result?.triage?.department || selectedDepartment?.name || null
    });
    pushRoute('result');
  }

  async function handleSubmitBookingFlow() {
    if (!selectedHospital || !selectedDepartment || !selectedDoctor || !selectedDate || !selectedSlot) {
      Alert.alert('Missing details', 'Please select hospital, department, doctor, date and slot.');
      return;
    }

    setSubmitting(true);
    console.log('[HomeFlow] booking_submit_start', {
      doctorId: selectedDoctor.id,
      scheduledDate: selectedDate,
      scheduledTime: selectedSlot,
      slotId: selectedSlotId || null
    });

    try {
      await bookAppointment(
        {
          doctorId: selectedDoctor.id,
          slotId: selectedSlotId,
          scheduledDate: selectedDate,
          scheduledTime: selectedSlot,
          chiefComplaint: bookingReason.trim() || 'General consultation',
          appointmentType: 'consultation'
        },
        token
      );

      console.log('[HomeFlow] booking_submit_success');
    await loadUpcomingPreview();
      pushRoute('result');
    } catch (error) {
      console.log('[HomeFlow] booking_submit_error', { message: error?.message || 'unknown' });
      Alert.alert('Booking failed', error?.message || 'Unable to book appointment right now.');
    } finally {
      setSubmitting(false);
    }
  }

  function restartFlow() {
    resetToHome();
    setSelectedHospital(null);
    setSelectedDepartment(null);
    setSelectedDoctor(null);
    setSelectedDate('');
    setSelectedSlot('');
    setSelectedSlotId('');
    setBookingReason('');
    setHospitalDepartments([]);
    setDoctors([]);
    setSlots([]);
    setFallbackInfo({ level: '', name: '' });
    setSlotFallbackMessage('');
    setSlotInfoMessage('');
    setTriageOutcome(null);
    setTriageInputMode('text');
  }

  function goToActiveQueueTab() {
    DeviceEventEmitter.emit('app:switch-tab', { tab: 'Queue' });
    restartFlow();
  }

  const filteredHospitals = useMemo(() => {
    if (!query.trim()) return hospitals;
    const q = query.toLowerCase();
    return hospitals.filter((h) => h.name.toLowerCase().includes(q) || String(h.city || '').toLowerCase().includes(q));
  }, [hospitals, query]);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loaderText}>Loading care network...</Text>
      </View>
    );
  }

  if (currentRoute === 'hospitals') {
    return (
      <View style={styles.root}>
        <Header title="Home" />
        <FlatList
          style={styles.root}
          contentContainerStyle={styles.content}
          onScroll={emitScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHospitals(true)} />}
          ListHeaderComponent={(
            <LinearGradient colors={['#d8efe9', '#f3f8f6']} style={styles.hero}>
              <Text style={styles.hello}>Hello, {greetingName}</Text>
              <Text style={styles.heroSubtitle}>Search hospitals, then move through each step as a dedicated route.</Text>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#6d7f88" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search hospitals"
                  placeholderTextColor="#88a0ab"
                  style={styles.searchInput}
                />
              </View>

              <Text style={styles.orText}>OR</Text>
              <TouchableOpacity style={styles.scanBtn} onPress={openQrScanner} activeOpacity={0.85}>
                <Ionicons name="qr-code-outline" size={18} color="#fff" />
                <Text style={styles.scanBtnText}>Scan Hospital QR</Text>
              </TouchableOpacity>

              <View style={styles.upcomingPreviewCard}>
                <View style={styles.upcomingPreviewHead}>
                  <Text style={styles.upcomingPreviewTitle}>Upcoming Appointment</Text>
                  <TouchableOpacity onPress={loadUpcomingPreview}>
                    <Text style={styles.upcomingPreviewRefresh}>Refresh</Text>
                  </TouchableOpacity>
                </View>
                {upcomingPreviewLoading ? (
                  <Text style={styles.upcomingPreviewMeta}>Loading...</Text>
                ) : upcomingPreview ? (
                  <>
                    <Text style={styles.upcomingPreviewDoctor}>{upcomingPreview.doctorName || 'Doctor'}</Text>
                    <Text style={styles.upcomingPreviewMeta}>{upcomingPreview.hospitalName || 'Hospital'}</Text>
                    <Text style={styles.upcomingPreviewMeta}>{upcomingPreview.date} • {upcomingPreview.time || '-'}</Text>
                  </>
                ) : (
                  <Text style={styles.upcomingPreviewMeta}>No upcoming appointments. Book from a hospital card below.</Text>
                )}
              </View>

              <Text style={styles.sectionTitle}>Hospitals</Text>
            </LinearGradient>
          )}
          data={filteredHospitals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.hospitalCard, hospitalLoadingId === item.id && styles.hospitalCardDisabled]}
              activeOpacity={0.9}
              onPress={() => handleSelectHospital(item)}
              disabled={hospitalLoadingId === item.id}
            >
              <Text style={styles.hospitalTitle}>{item.name}</Text>
              <Text style={styles.hospitalMeta}>{item.city || 'City not set'} • {item.state || 'State not set'}</Text>
              <Text style={styles.hospitalStats}>{item.departmentCount || 0} departments • {item.doctorCount || 0} doctors</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  if (currentRoute === 'scan_qr') {
    const permissionGranted = Boolean(cameraPermission?.granted);
    return (
      <View style={styles.root}>
        <Header title="Scan Hospital QR" onBack={popRoute} />
        <View style={styles.scannerWrap}>
          {permissionGranted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onQrCodeScanned}
            />
          ) : (
            <View style={styles.permissionCard}>
              <Text style={styles.fallbackTitle}>Camera Permission Needed</Text>
              <Text style={styles.fallbackText}>Enable camera permission to scan hospital QR codes.</Text>
              <TouchableOpacity style={styles.fallbackBtn} onPress={openQrScanner}>
                <Text style={styles.fallbackBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.scanHelpCard}>
            <Text style={styles.scanHelpTitle}>Scan hospital entrance QR</Text>
            <Text style={styles.scanHelpText}>The QR should contain only hospital link like https://triage.app/hospital/[hospitalId].</Text>
            {qrErrorMessage ? <Text style={styles.scanErrorText}>{qrErrorMessage}</Text> : null}
          </View>
        </View>
      </View>
    );
  }

  if (currentRoute === 'hospital_detail') {
    return (
      <View style={styles.root}>
        <Header title="Hospital Details" onBack={popRoute} />
        <View style={styles.contentPage}>
          <HospitalDetailCard
            hospital={selectedHospital}
            departments={hospitalDepartments}
            onJoinQueue={startJoinQueue}
            onBookAppointment={startBookAppointment}
          />
        </View>
      </View>
    );
  }

  if (currentRoute === 'department') {
    return (
      <View style={styles.root}>
        <Header title="Select Department" onBack={popRoute} />
        <View style={styles.contentPage}>
          <DepartmentSelector
            departments={hospitalDepartments}
            selectedDepartmentId={selectedDepartment?.id}
            onSelect={handleSelectDepartment}
          />
        </View>
      </View>
    );
  }

  if (currentRoute === 'doctor') {
    return (
      <View style={styles.root}>
        <Header title="Select Doctor" onBack={popRoute} />
        <View style={styles.contentPage}>
          <DoctorSelector
            doctors={doctors}
            selectedDoctorId={selectedDoctor?.id}
            onSelect={handleSelectDoctor}
          />
        </View>
      </View>
    );
  }

  if (currentRoute === 'date') {
    const dateOptions = getUpcomingDates(7);
    return (
      <View style={styles.root}>
        <Header title="Select Date" onBack={popRoute} />
        <View style={styles.contentPage}>
          <View style={styles.dateCard}>
            <Text style={styles.dateTitle}>Choose appointment date</Text>
            <Text style={styles.dateSub}>Scheduling is available for the next 7 days.</Text>
            <View style={styles.dateWrap}>
              {dateOptions.map((date) => {
                const active = selectedDate === date;
                const labels = formatDayLabel(date);
                return (
                  <TouchableOpacity
                    key={date}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    onPress={() => handleSelectDate(date)}
                  >
                    <Text style={[styles.dateChipDay, active && styles.dateChipTextActive]}>{labels.day}</Text>
                    <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>{labels.monthDate}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (currentRoute === 'slot') {
    return (
      <View style={styles.root}>
        <Header title="Select Time Slot" onBack={popRoute} />
        <View style={styles.contentPage}>
          <SlotSelector
            slots={slots}
            selectedSlot={selectedSlot}
            selectedDate={selectedDate}
            infoMessage={slotInfoMessage}
            onSelect={handleSelectSlot}
          />
        </View>
      </View>
    );
  }

  if (currentRoute === 'triage') {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <Header title="AI Triage" onBack={popRoute} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TriageForm
            patientId={user?.id}
            token={token}
            availableDepartments={hospitalDepartments.map((d) => d.name).filter(Boolean)}
            departmentId={selectedDepartment?.id || null}
            selectedDepartmentName={selectedDepartment?.name || null}
            hospitalId={selectedHospital?.id || null}
            inputMode={triageInputMode}
            mode={flowMode}
            onComplete={handleTriageComplete}
            onError={(msg) => Alert.alert('Triage Error', msg)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (currentRoute === 'booking_details') {
    return (
      <View style={styles.root}>
        <Header title="Confirm Booking" onBack={popRoute} />
        <View style={styles.contentPage}>
          <View style={styles.bookingCard}>
            <Text style={styles.bookingTitle}>Simple booking details</Text>
            <Text style={styles.bookingSubtitle}>Triage is not required for appointments. Add an optional reason and confirm.</Text>

            <Text style={styles.bookingMeta}>Doctor: {selectedDoctor?.name || '-'}</Text>
            <Text style={styles.bookingMeta}>Date: {selectedDate || '-'}</Text>
            <Text style={styles.bookingMeta}>Slot: {selectedSlot || '-'}</Text>

            <Text style={styles.bookingLabel}>Reason (optional)</Text>
            <TextInput
              value={bookingReason}
              onChangeText={setBookingReason}
              placeholder="e.g., Follow-up consultation"
              placeholderTextColor="#88a0ab"
              style={styles.bookingInput}
            />

            <TouchableOpacity style={styles.bookingBtn} onPress={handleSubmitBookingFlow} disabled={submitting}>
              <Text style={styles.bookingBtnText}>{submitting ? 'Booking...' : 'Confirm Appointment'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (currentRoute === 'no_doctors') {
    const isHospital = fallbackInfo.level === 'hospital';
    const title = isHospital ? 'Hospital Has No Doctors' : 'Department Has No Doctors';
    const message = isHospital
      ? `${fallbackInfo.name} currently has no doctors available for booking.`
      : `${fallbackInfo.name} currently has no doctors available.`;

    return (
      <View style={styles.root}>
        <Header title="Unavailable" onBack={popRoute} />
        <View style={styles.contentPage}>
          <View style={styles.fallbackCard}>
            <Ionicons name="alert-circle-outline" size={34} color={colors.accent} />
            <Text style={styles.fallbackTitle}>{title}</Text>
            <Text style={styles.fallbackText}>{message}</Text>
            <TouchableOpacity
              style={styles.fallbackBtn}
              onPress={() => {
                if (isHospital) {
                  popRoute();
                } else {
                  setRoutes([{ name: 'hospitals' }, { name: 'hospital_detail' }, { name: 'department' }]);
                }
              }}
            >
              <Text style={styles.fallbackBtnText}>{isHospital ? 'Go Back to Hospital' : 'Choose Another Department'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (currentRoute === 'no_departments') {
    return (
      <View style={styles.root}>
        <Header title="Unavailable" onBack={popRoute} />
        <View style={styles.contentPage}>
          <View style={styles.fallbackCard}>
            <Ionicons name="business-outline" size={34} color={colors.accent} />
            <Text style={styles.fallbackTitle}>Hospital Has No Departments</Text>
            <Text style={styles.fallbackText}>{fallbackInfo.name} currently has no departments configured.</Text>
            <TouchableOpacity style={styles.fallbackBtn} onPress={popRoute}>
              <Text style={styles.fallbackBtnText}>Go Back to Hospital</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (currentRoute === 'no_slots') {
    return (
      <View style={styles.root}>
        <Header title="Unavailable" onBack={popRoute} />
        <View style={styles.contentPage}>
          <View style={styles.fallbackCard}>
            <Ionicons name="time-outline" size={34} color={colors.accent} />
            <Text style={styles.fallbackTitle}>Slots Not Available</Text>
            <Text style={styles.fallbackText}>{slotFallbackMessage || `${fallbackInfo.name} has no available slots right now.`}</Text>
            <TouchableOpacity
              style={styles.fallbackBtn}
              onPress={() => {
                setRoutes([{ name: 'hospitals' }, { name: 'hospital_detail' }, { name: 'department' }, { name: 'doctor' }, { name: 'date' }]);
              }}
            >
              <Text style={styles.fallbackBtnText}>Choose Another Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header title="Submission Result" onBack={popRoute} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.contentPage}
        onScroll={emitScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>{flowMode === 'booking' ? 'Booking Complete' : 'Triage Submitted Successfully'}</Text>
          {flowMode !== 'booking' ? <Text style={styles.resultSuccess}>AI analysis complete. You are now in the active queue.</Text> : null}
          <Text style={styles.resultText}>Hospital: {selectedHospital?.name}</Text>
          <Text style={styles.resultText}>Department: {triageOutcome?.department || selectedDepartment?.name}</Text>
          {flowMode === 'booking' && selectedDoctor ? <Text style={styles.resultText}>Doctor: {selectedDoctor?.name}</Text> : null}
          {flowMode === 'booking' && selectedSlot ? <Text style={styles.resultText}>Slot: {selectedDate} {selectedSlot}</Text> : null}

          {flowMode !== 'booking' && triageOutcome?.tokenNumber != null ? (
            <Text style={styles.resultText}>Token: {triageOutcome.tokenNumber}</Text>
          ) : null}
          {flowMode !== 'booking' && triageOutcome?.estimatedWaitMinutes != null ? (
            <Text style={styles.resultText}>Estimated Wait: {triageOutcome.estimatedWaitMinutes} min</Text>
          ) : null}

          {flowMode !== 'booking' ? (
            <TouchableOpacity style={styles.queueBtn} onPress={goToActiveQueueTab}>
              <Text style={styles.queueBtnText}>Go To Active Queue</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.restartBtn} onPress={restartFlow} disabled={submitting}>
            <Text style={styles.restartBtnText}>Start New Request</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  contentPage: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  scrollContent: { paddingTop: spacing.md, paddingBottom: spacing.xl * 2, flexGrow: 1 },
  header: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 16
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#f2f7f5'
  },
  backBtnPlaceholder: {
    width: 34,
    height: 34
  },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loaderText: { marginTop: spacing.sm, fontFamily: 'Inter_400Regular', color: colors.muted },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl + 10, paddingBottom: spacing.lg },
  hello: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 28 },
  heroSubtitle: { marginTop: 6, fontFamily: 'Inter_400Regular', color: colors.muted, marginBottom: spacing.md },
  orText: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
    color: colors.muted,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 1
  },
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12
  },
  scanBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold'
  },
  upcomingPreviewCard: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    padding: spacing.md
  },
  upcomingPreviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  upcomingPreviewTitle: {
    fontFamily: 'Inter_700Bold',
    color: colors.text
  },
  upcomingPreviewRefresh: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark,
    fontSize: 12
  },
  upcomingPreviewDoctor: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginBottom: 2
  },
  upcomingPreviewMeta: {
    fontFamily: 'Inter_400Regular',
    color: colors.muted
  },
  searchWrap: { backgroundColor: '#fff', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, marginLeft: 8, paddingVertical: 10, fontFamily: 'Inter_400Regular', color: colors.text },
  sectionTitle: { marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm, fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 20 },
  hospitalCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md },
  hospitalCardDisabled: { opacity: 0.6 },
  hospitalTitle: { fontFamily: 'Inter_600SemiBold', color: colors.text, fontSize: 16 },
  hospitalMeta: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted },
  hospitalStats: { marginTop: 8, fontFamily: 'Inter_600SemiBold', color: colors.primaryDark, fontSize: 12 },
  resultCard: { marginHorizontal: spacing.lg, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  resultTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: colors.text, marginBottom: spacing.sm },
  resultSuccess: { fontFamily: 'Inter_600SemiBold', color: '#0f766e', marginBottom: spacing.sm },
  resultText: { fontFamily: 'Inter_400Regular', color: colors.text, marginTop: 3 },
  queueBtn: { marginTop: spacing.md, backgroundColor: colors.primaryDark, borderRadius: radii.md, alignItems: 'center', paddingVertical: 12 },
  queueBtnText: { color: '#fff', fontFamily: 'Inter_700Bold' },
  restartBtn: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', paddingVertical: 12 },
  restartBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  overlay: { marginHorizontal: spacing.lg, marginTop: spacing.md, alignItems: 'center', gap: spacing.sm },
  overlayText: { fontFamily: 'Inter_400Regular', color: colors.muted },
  fallbackCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center'
  },
  fallbackTitle: {
    marginTop: spacing.sm,
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 20,
    textAlign: 'center'
  },
  fallbackText: {
    marginTop: spacing.sm,
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20
  },
  fallbackBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  fallbackBtnText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold'
  },
  dateCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg
  },
  dateTitle: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 18
  },
  dateSub: {
    marginTop: 6,
    marginBottom: spacing.md,
    fontFamily: 'Inter_400Regular',
    color: colors.muted
  },
  dateWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  dateChip: {
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center'
  },
  dateChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e8f4f1'
  },
  dateChipDay: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2
  },
  dateChipText: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 14
  },
  dateChipTextActive: {
    color: colors.primaryDark
  },
  bookingCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg
  },
  bookingTitle: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 18
  },
  bookingSubtitle: {
    marginTop: 6,
    marginBottom: spacing.md,
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    lineHeight: 20
  },
  bookingMeta: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    marginTop: 2
  },
  bookingLabel: {
    marginTop: spacing.md,
    marginBottom: 6,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text
  },
  bookingInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    backgroundColor: '#fff'
  },
  bookingBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: 'center',
    paddingVertical: 12
  },
  bookingBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold'
  },
  scannerWrap: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md
  },
  camera: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden'
  },
  permissionCard: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scanHelpCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    padding: spacing.md
  },
  scanHelpTitle: {
    fontFamily: 'Inter_700Bold',
    color: colors.text
  },
  scanHelpText: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    color: colors.muted
  },
  scanErrorText: {
    marginTop: 6,
    fontFamily: 'Inter_600SemiBold',
    color: colors.danger
  }
});
