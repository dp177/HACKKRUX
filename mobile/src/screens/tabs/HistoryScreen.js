import React, { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, FlatList, StyleSheet, Text, View } from 'react-native';
import { getCurrentUser, getMyPrescriptions, getPatientDashboard } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { colors, radii, spacing } from '../../theme/tokens';

export default function HistoryScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const token = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const me = await getCurrentUser(token);
        const [dashboard, prescriptionHistory] = await Promise.all([
          getPatientDashboard(me.user.id, token),
          getMyPrescriptions(token)
        ]);
        setVisits(dashboard?.visitHistory?.recentVisits || []);
        setPrescriptions(Array.isArray(prescriptionHistory) ? prescriptionHistory : []);
      } catch {
        setVisits([]);
        setPrescriptions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Medical History</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          onScroll={emitScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListHeaderComponent={(
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Past Prescriptions</Text>
              {!prescriptions.length ? (
                <Text style={styles.empty}>No prescriptions found.</Text>
              ) : (
                prescriptions.map((item) => (
                  <View key={item.id} style={styles.itemCard}>
                    <Text style={styles.itemTitle}>{item.diagnosis || 'General consultation'}</Text>
                    <Text style={styles.itemSub}>{new Date(item.date).toLocaleDateString()} {item.doctorName ? `• ${item.doctorName}` : ''}</Text>
                    <Text style={styles.itemSub}>Medicines: {(item.medicines || []).map((m) => m.name).join(', ') || 'Not recorded'}</Text>
                    {item.remarks ? <Text style={styles.itemSub}>Remarks: {item.remarks}</Text> : null}
                  </View>
                ))
              )}
              <Text style={styles.sectionTitle}>Past Visits</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.chiefComplaint || 'General visit'}</Text>
              <Text style={styles.itemSub}>{new Date(item.date).toLocaleDateString()} • {item.department || 'General'}</Text>
              <Text style={styles.itemSub}>Diagnosis: {item.diagnosis || 'Pending'}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No past visits found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 26, marginBottom: spacing.md },
  sectionWrap: { marginBottom: spacing.sm },
  sectionTitle: { marginTop: spacing.sm, fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 16 },
  itemCard: { marginTop: spacing.sm, backgroundColor: '#fff', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  itemTitle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  itemSub: { fontFamily: 'Inter_400Regular', color: colors.muted, marginTop: 4 },
  empty: { marginTop: spacing.lg, color: colors.muted, fontFamily: 'Inter_400Regular', textAlign: 'center' }
});
