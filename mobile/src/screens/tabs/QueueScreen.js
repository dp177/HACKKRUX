import React, { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, ScrollView, StyleSheet, Text, View } from 'react-native';
import { io } from 'socket.io-client';
import { getMyQueueStatus } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { usePatientFlowStore } from '../../store/patientFlowStore';
import { colors, radii, spacing } from '../../theme/tokens';

export default function QueueScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const token = useAuthStore((state) => state.token);
  const activeQueue = usePatientFlowStore((state) => state.activeQueue);
  const [loading, setLoading] = useState(true);
  const [queueData, setQueueData] = useState(null);

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
          priorityLevel: status?.priorityLevel || activeQueue?.priorityLevel,
          riskScore: status?.riskScore ?? activeQueue?.riskScore,
          departmentId: status?.departmentId || activeQueue?.departmentId,
          hospitalId: status?.hospitalId || activeQueue?.hospitalId
        };
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

          socket.on('queue:update', (payload) => {
            if (!alive || !payload) return;
            console.log('[QueueScreen] socket_queue_update', payload);
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
  }, [token, activeQueue]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }} onScroll={emitScroll} scrollEventThrottle={16}>
      <Text style={styles.title}>Active Queue</Text>
      <Text style={styles.subtitle}>Auto-refreshes every 15 seconds.</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : queueData ? (
        <View style={styles.card}>
          <Text style={styles.label}>Chief Complaint</Text>
          <Text style={styles.value}>{queueData.chiefComplaint || queueData.summary || 'Not provided'}</Text>

          <Text style={styles.label}>Hospital</Text>
          <Text style={styles.value}>{queueData.hospitalName || 'Not available'}</Text>

          <Text style={styles.label}>Department</Text>
          <Text style={styles.value}>{queueData.departmentName || 'Not available'}</Text>

          <Text style={styles.label}>Queue Position</Text>
          <Text style={styles.value}>{queueData.tokenNumber ?? queueData.queuePosition ?? '-'}</Text>

          <Text style={styles.label}>Patients Ahead</Text>
          <Text style={styles.value}>{queueData.patientsAhead ?? '-'}</Text>

          <Text style={styles.label}>Estimated Wait</Text>
          <Text style={styles.value}>{queueData.estimatedWaitMinutes != null ? `${queueData.estimatedWaitMinutes} min` : '-'}</Text>

          <Text style={styles.label}>Priority</Text>
          <Text style={styles.value}>{queueData.priorityLevel || 'Unknown'}</Text>

          <Text style={styles.label}>Recommended Specialty</Text>
          <Text style={styles.value}>{queueData.recommendedSpecialty || 'General'}</Text>

          <Text style={styles.label}>Risk Score</Text>
          <Text style={styles.bigValue}>{queueData.riskScore ?? queueData.totalRiskScore ?? '-'}</Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active queue right now. Submit triage to join queue.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 26 },
  subtitle: { fontFamily: 'Inter_400Regular', color: colors.muted, marginTop: 6 },
  card: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: '#fff', padding: spacing.lg },
  label: { fontFamily: 'Inter_600SemiBold', color: colors.primaryDark, marginTop: spacing.sm },
  value: { fontFamily: 'Inter_400Regular', color: colors.text, marginTop: 2 },
  bigValue: { fontFamily: 'Inter_700Bold', color: colors.primary, fontSize: 38, marginTop: 4 },
  emptyCard: { marginTop: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', padding: spacing.lg },
  emptyText: { fontFamily: 'Inter_400Regular', color: colors.muted }
});
