import React, { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getCurrentPatient, getCurrentUser, getMyPrescriptions, getPatientDashboard } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { colors, radii, spacing } from '../../theme/tokens';

const INITIAL_VISIBLE_PRESCRIPTIONS = 5;

function normalizePrescriptionMedicines(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item) return null;

      if (typeof item === 'string') {
        return { name: item };
      }

      if (typeof item === 'object') {
        const name = String(item.name || item.medicineName || '').trim();
        if (!name) return null;

        return {
          name,
          dosage: item.dosage || null,
          frequency: item.frequency || null,
          duration: item.duration || null,
          instructions: item.instructions || null
        };
      }

      return null;
    })
    .filter(Boolean);
}

function derivePrescriptionsFromVisits(visits = []) {
  return visits
    .filter((visit) => Array.isArray(visit?.prescriptions) && visit.prescriptions.length)
    .map((visit, index) => ({
      id: `visit-rx-${visit?.id || index}`,
      date: visit?.date || null,
      diagnosis: visit?.diagnosis || visit?.chiefComplaint || null,
      doctorName: visit?.doctor || null,
      medicines: normalizePrescriptionMedicines(visit.prescriptions),
      remarks: null
    }));
}

export default function HistoryScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const token = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState([]);
  const [showAllPrescriptions, setShowAllPrescriptions] = useState(false);
  const [expandedPrescriptionIds, setExpandedPrescriptionIds] = useState({});

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        let patientId = null;

        try {
          const patientProfile = await getCurrentPatient(token);
          patientId = patientProfile?.id || null;
        } catch {
          // Fallback for legacy auth flow where /auth/me/patient may not be available.
          const me = await getCurrentUser(token);
          patientId = me?.patient?.id || me?.user?.patientId || me?.user?.id || me?.user?._id || null;
        }

        if (!patientId) {
          throw new Error('Unable to resolve patient ID for dashboard');
        }

        const dashboard = await getPatientDashboard(patientId, token);
        const nextVisits = dashboard?.visitHistory?.recentVisits || [];

        try {
          const prescriptionHistory = await getMyPrescriptions(token);
          const normalized = Array.isArray(prescriptionHistory) ? prescriptionHistory : [];
          if (normalized.length) {
            setPrescriptions(normalized);
          } else {
            setPrescriptions(derivePrescriptionsFromVisits(nextVisits));
          }
        } catch {
          // Fallback for older backends without /prescriptions/me.
          setPrescriptions(derivePrescriptionsFromVisits(nextVisits));
        }
      } catch {
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
          data={showAllPrescriptions ? prescriptions : prescriptions.slice(0, INITIAL_VISIBLE_PRESCRIPTIONS)}
          keyExtractor={(item, index) => item.id || `rx-${index}`}
          onScroll={emitScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListHeaderComponent={(
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Past Prescriptions</Text>
              <Text style={styles.recordCount}>{prescriptions.length} records</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isExpanded = Boolean(expandedPrescriptionIds[item.id]);
            const medicines = Array.isArray(item.medicines) ? item.medicines : [];
            const medicineNames = medicines.map((m) => m?.name || '').filter(Boolean);
            const hasMedicineDetails = medicines.some((m) => m?.dosage || m?.frequency || m?.duration || m?.instructions);
            const canExpand = hasMedicineDetails || Boolean(item.remarks) || Boolean(item.temperature) || Boolean(item.bloodPressure) || Boolean(item.notes);

            return (
              <View style={styles.itemCard}>
                <Text style={styles.itemTitle}>{item.diagnosis || 'General consultation'}</Text>
                <Text style={styles.itemSub}>{new Date(item.date).toLocaleDateString()} {item.doctorName ? `• ${item.doctorName}` : ''}</Text>
                <Text style={styles.itemSub}>
                  Medicines: {medicineNames.slice(0, 2).join(', ') || 'Not recorded'}
                  {medicineNames.length > 2 ? ` +${medicineNames.length - 2} more` : ''}
                </Text>

                {canExpand ? (
                  <TouchableOpacity
                    style={styles.inlineToggleBtn}
                    onPress={() => setExpandedPrescriptionIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  >
                    <Text style={styles.inlineToggleText}>{isExpanded ? 'Show Less' : 'View More'}</Text>
                  </TouchableOpacity>
                ) : null}

                {isExpanded ? (
                  <View style={styles.detailBlock}>
                    {(item.temperature || item.bloodPressure || item.notes) ? (
                      <>
                        <Text style={styles.detailTitle}>Vitals / Notes</Text>
                        {item.temperature ? <Text style={styles.itemSub}>Temp: {item.temperature}</Text> : null}
                        {item.bloodPressure ? <Text style={styles.itemSub}>BP: {item.bloodPressure}</Text> : null}
                        {item.notes ? <Text style={styles.itemSub}>Notes: {item.notes}</Text> : null}
                      </>
                    ) : null}

                    {medicines.length ? (
                      <>
                        <Text style={styles.detailTitle}>Medicines</Text>
                        {medicines.map((med, idx) => (
                          <View key={`${item.id || 'rx'}-${idx}`} style={styles.medicineRow}>
                            <Text style={styles.itemSubStrong}>{med?.name || 'Medicine'}</Text>
                            {(med?.dosage || med?.frequency || med?.duration) ? (
                              <Text style={styles.itemSub}>
                                {med?.dosage ? `Dose: ${med.dosage}  ` : ''}
                                {med?.frequency ? `Freq: ${med.frequency}  ` : ''}
                                {med?.duration ? `Duration: ${med.duration}` : ''}
                              </Text>
                            ) : null}
                            {med?.instructions ? <Text style={styles.itemSub}>Instructions: {med.instructions}</Text> : null}
                          </View>
                        ))}
                      </>
                    ) : null}

                    {item.remarks ? <Text style={styles.itemSub}>Remarks: {item.remarks}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No prescriptions found.</Text>}
          ListFooterComponent={prescriptions.length > INITIAL_VISIBLE_PRESCRIPTIONS ? (
            <TouchableOpacity
              style={styles.viewMoreBtn}
              onPress={() => setShowAllPrescriptions((prev) => !prev)}
            >
              <Text style={styles.viewMoreText}>
                {showAllPrescriptions
                  ? 'Show Less'
                  : `View More (${prescriptions.length - INITIAL_VISIBLE_PRESCRIPTIONS} more)`}
              </Text>
            </TouchableOpacity>
          ) : null}
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
  recordCount: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted },
  itemCard: { marginTop: spacing.sm, backgroundColor: '#fff', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  itemTitle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  itemSubStrong: { fontFamily: 'Inter_600SemiBold', color: colors.text, marginTop: 4 },
  itemSub: { fontFamily: 'Inter_400Regular', color: colors.muted, marginTop: 4 },
  detailBlock: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  detailTitle: { fontFamily: 'Inter_600SemiBold', color: colors.text, marginTop: 2 },
  medicineRow: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  inlineToggleBtn: { marginTop: 8, alignSelf: 'flex-start' },
  inlineToggleText: { fontFamily: 'Inter_600SemiBold', color: colors.primaryDark },
  empty: { marginTop: spacing.lg, color: colors.muted, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  viewMoreBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff'
  },
  viewMoreText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text
  }
});
