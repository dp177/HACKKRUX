import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { cancelAppointment, getAppointmentHistory, getUpcomingAppointments } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { colors, radii, spacing } from '../../theme/tokens';

function formatDate(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

export default function AppointmentsScreen({ mode = 'upcoming' }) {
  function emitScroll(event) {
    DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
  }

  const token = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);

  const isHistoryMode = mode === 'history';

  async function load() {
    if (!token) return;

    setLoading(true);
    try {
      const response = isHistoryMode
        ? await getAppointmentHistory(token)
        : await getUpcomingAppointments(token);

      const list = isHistoryMode ? (response?.history || []) : (response?.appointments || []);
      setAppointments(list);
    } catch (error) {
      console.log('[AppointmentsScreen] load_error', { mode, message: error?.message || 'unknown' });
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, mode]);

  const title = useMemo(() => (isHistoryMode ? 'Appointment History' : 'Upcoming Appointments'), [isHistoryMode]);

  async function onCancel(appointmentId) {
    if (!appointmentId || !token) return;

    try {
      await cancelAppointment(appointmentId, token);
      await load();
    } catch (error) {
      Alert.alert('Cancel failed', error?.message || 'Unable to cancel appointment right now.');
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => item.appointmentId}
          onScroll={emitScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.hospital}>{item.hospitalName || 'Hospital'}</Text>
              <Text style={styles.doctor}>{item.doctorName || 'Doctor'} {item.department ? `• ${item.department}` : ''}</Text>
              <Text style={styles.meta}>{formatDate(item.date)} • {item.time}</Text>
              <Text style={styles.status}>Status: {item.status || '-'}</Text>

              {!isHistoryMode && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert('Details', 'Detailed appointment view can be opened here.')}> 
                    <Text style={styles.secondaryBtnText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => onCancel(item.appointmentId)}>
                    <Text style={styles.cancelBtnText}>Cancel Appointment</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No appointments found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 26, marginBottom: spacing.md },
  card: {
    marginTop: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md
  },
  hospital: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 16 },
  doctor: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.text },
  meta: { marginTop: 6, fontFamily: 'Inter_600SemiBold', color: colors.primaryDark },
  status: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted },
  actions: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff'
  },
  secondaryBtnText: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  cancelBtn: {
    flex: 1,
    borderRadius: radii.md,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f8ece9'
  },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', color: colors.danger },
  empty: { marginTop: spacing.lg, color: colors.muted, fontFamily: 'Inter_400Regular', textAlign: 'center' }
});