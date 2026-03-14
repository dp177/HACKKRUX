import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { io } from 'socket.io-client';
import { getMyQueueStatus } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { usePatientFlowStore } from '../../store/patientFlowStore';
import { colors, radii, spacing } from '../../theme/tokens';

const WINDOW_HEIGHT = Dimensions.get('window').height;

export default function QueueScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const activeQueue = usePatientFlowStore((state) => state.activeQueue);
  const setActiveQueue = usePatientFlowStore((state) => state.setActiveQueue);
  const [loading, setLoading] = useState(true);
  const [queueData, setQueueData] = useState(null);
  const lastCallAlertKeyRef = useRef('');
  const lastCompletionAlertKeyRef = useRef('');

  useEffect(() => {
    let alive = true;
    let socket;

    async function loadQueue() {
      if (!token) return;
      try {
        console.log('[QueueScreen] load_start');
        const status = await getMyQueueStatus(token);

        if (!alive) return;
        const merged = {
          ...(activeQueue || {}),
          queuePosition: status?.tokenNumber ?? status?.position ?? activeQueue?.queuePosition ?? null,
          tokenNumber: status?.tokenNumber ?? status?.position ?? null,
          patientsAhead: status?.patientsAhead ?? null,
          estimatedWaitMinutes: status?.estimatedWaitMinutes ?? activeQueue?.estimatedWaitMinutes ?? null,
          waitTimeMinutes: status?.waitTimeMinutes ?? activeQueue?.waitTimeMinutes ?? null,
          priorityLevel: status?.priorityLevel || activeQueue?.priorityLevel,
          riskScore: status?.riskScore ?? activeQueue?.riskScore,
          departmentName: status?.departmentName || activeQueue?.departmentName || null,
          hospitalName: status?.hospitalName || activeQueue?.hospitalName || null,
          departmentId: status?.departmentId || activeQueue?.departmentId,
          hospitalId: status?.hospitalId || activeQueue?.hospitalId,
          patientId: status?.patientId || activeQueue?.patientId || user?.id || user?._id || null,
          status: status?.status || activeQueue?.status || 'WAITING',
          message: status?.message || activeQueue?.message || null
        };

        if (status?.status === 'IN_CONSULTATION' || status?.notificationType === 'PATIENT_CALLED') {
          const alertKey = String(status?.calledAt || status?.queueEntryId || 'called');
          if (lastCallAlertKeyRef.current !== alertKey) {
            lastCallAlertKeyRef.current = alertKey;
            const doctorName = status?.doctorName || 'Doctor';
            Alert.alert('Called By Doctor', status?.message || `${doctorName} has called you. Please reach consultation now.`);
          }
        }

        if (status?.status === 'COMPLETED' || status?.notificationType === 'CONSULTATION_COMPLETED') {
          const completionKey = String(status?.completedAt || status?.queueEntryId || 'completed');
          if (lastCompletionAlertKeyRef.current !== completionKey) {
            lastCompletionAlertKeyRef.current = completionKey;
            Alert.alert('Consultation Completed', status?.message || 'Your consultation has been completed. We hope you feel better soon! Thank you for visiting.');
          }
        }

        setQueueData(merged);
        console.log('[QueueScreen] latest_triage_loaded', {
          hasLatest: Boolean(merged),
          priority: merged?.priorityLevel || null
        });

        const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL || (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace('/api', '');
        if (!socket && socketUrl) {
          socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            timeout: 8000
          });

          socket.on('connect', () => {
            console.log('[QueueScreen] socket_connected');
            socket.emit('queue:subscribe', {
              patientId: status?.patientId,
              departmentId: status?.departmentId
            });
          });

          socket.on('patient:called', (payload) => {
            if (!alive || !payload) return;
            const currentPatientId = String(user?.id || user?._id || activeQueue?.patientId || status?.patientId || '');
            if (currentPatientId && String(payload.patientId || '') !== currentPatientId) {
              return;
            }

            const doctorName = payload?.doctorName || 'Doctor';
            Alert.alert('Called By Doctor', payload.message || `${doctorName} has called you. Please reach consultation now.`);
            setQueueData((prev) => ({
              ...(prev || {}),
              status: 'IN_CONSULTATION',
              message: payload?.message || `${doctorName} has called you. Please reach consultation now.`
            }));
          });

          socket.on('consultation:start', (payload) => {
            if (!alive || !payload) return;

            const currentPatientId = String(user?.id || user?._id || activeQueue?.patientId || status?.patientId || '');
            if (currentPatientId && String(payload.patientId || '') !== currentPatientId) {
              return;
            }

            Alert.alert('Doctor is ready for you', payload.message || 'Please proceed to consultation room.');
            setQueueData((prev) => ({
              ...(prev || {}),
              status: 'IN_CONSULTATION',
              message: payload?.message || 'Please proceed to consultation room.'
            }));
          });

          socket.on('consultation:end', (payload) => {
            if (!alive || !payload) return;

            const currentPatientId = String(user?.id || user?._id || activeQueue?.patientId || status?.patientId || '');
            if (currentPatientId && String(payload.patientId || '') !== currentPatientId) {
              return;
            }

            Alert.alert('Consultation Completed', payload.message || 'Your consultation has been completed. We hope you feel better soon! Thank you for visiting.');
            setQueueData((prev) => ({
              ...(prev || {}),
              status: 'COMPLETED',
              message: payload?.message || 'Your consultation has been completed. We hope you feel better soon! Thank you for visiting.'
            }));
            setActiveQueue(null);
          });

          socket.on('queue:update', (payload) => {
            if (!alive || !payload) return;
            console.log('[QueueScreen] socket_queue_update', payload);

            const currentPatientId = String(user?.id || user?._id || activeQueue?.patientId || status?.patientId || '');
            const payloadPatientId = String(payload?.patientId || '');
            if (currentPatientId && payloadPatientId && payloadPatientId !== currentPatientId) {
              return;
            }

            if (payload.notificationType === 'PATIENT_CALLED' || payload.status === 'IN_CONSULTATION') {
              const doctorName = payload?.doctorName || 'Doctor';
              Alert.alert('Called By Doctor', payload.message || `${doctorName} has called you. Please reach consultation now.`);
              setQueueData((prev) => ({
                ...(prev || {}),
                ...payload,
                status: 'IN_CONSULTATION'
              }));
              return;
            }

            if (payload.notificationType === 'CONSULTATION_COMPLETED' || payload.status === 'COMPLETED') {
              Alert.alert('Consultation Completed', payload.message || 'Your consultation has been completed. We hope you feel better soon! Thank you for visiting.');
              setQueueData((prev) => ({
                ...(prev || {}),
                ...payload,
                status: 'COMPLETED'
              }));
              setActiveQueue(null);
              return;
            }

            setQueueData((prev) => ({
              ...(prev || {}),
              ...payload
            }));
          });
        }
      } catch (error) {
        console.log('[QueueScreen] load_error', { message: error?.message || 'unknown error' });
        if (alive) setQueueData(null);
      } finally {
        console.log('[QueueScreen] load_end');
        if (alive) setLoading(false);
      }
    }

    loadQueue();
    const timer = setInterval(loadQueue, 15000);

    return () => {
      alive = false;
      clearInterval(timer);
      if (socket) socket.disconnect();
    };
  }, [token, user, activeQueue, setActiveQueue]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      onScroll={emitScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      overScrollMode="always"
      nestedScrollEnabled
    >
      <Text style={styles.title}>Active Queue</Text>
      <Text style={styles.subtitle}>Auto-refreshes every 15 seconds.</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : queueData ? (
        <View style={styles.card}>
          <Text style={styles.label}>Department</Text>
          <Text style={styles.value}>{queueData.departmentName || 'Not available'}</Text>

          {String(queueData.status || 'WAITING').toUpperCase() === 'WAITING' ? (
            <>
              <Text style={styles.label}>Token Number</Text>
              <Text style={styles.value}>#{queueData.tokenNumber ?? queueData.queuePosition ?? '-'}</Text>

              <Text style={styles.label}>Patients Ahead</Text>
              <Text style={styles.value}>{queueData.patientsAhead ?? '-'}</Text>

              <Text style={styles.label}>Estimated Wait</Text>
              <Text style={styles.value}>{queueData.estimatedWaitMinutes != null ? `${queueData.estimatedWaitMinutes} min` : '-'}</Text>

              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>Waiting in queue</Text>
            </>
          ) : null}

          {String(queueData.status || '').toUpperCase() === 'IN_CONSULTATION' ? (
            <>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>Doctor is ready for you</Text>
              <Text style={styles.value}>Please proceed to consultation room.</Text>
            </>
          ) : null}

          {String(queueData.status || '').toUpperCase() === 'COMPLETED' ? (
            <>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>Your consultation has been completed.</Text>
              <Text style={styles.value}>We hope you feel better soon! Thank you for visiting.</Text>
            </>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active queue right now. Submit triage to join queue.</Text>
        </View>
      )}

      <View style={styles.scrollSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    minHeight: WINDOW_HEIGHT + 140,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2
  },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 26 },
  subtitle: { fontFamily: 'Inter_400Regular', color: colors.muted, marginTop: 6 },
  card: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: '#fff', padding: spacing.lg },
  label: { fontFamily: 'Inter_600SemiBold', color: colors.primaryDark, marginTop: spacing.sm },
  value: { fontFamily: 'Inter_400Regular', color: colors.text, marginTop: 2 },
  emptyCard: { marginTop: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', padding: spacing.lg },
  emptyText: { fontFamily: 'Inter_400Regular', color: colors.muted },
  scrollSpacer: { height: spacing.xl }
});
