import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export default function HospitalDetailCard({ hospital, departments = [], onJoinQueue, onBookAppointment }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{hospital?.name}</Text>
      <Text style={styles.meta}>{hospital?.address || 'Address not set'} • {hospital?.city || 'City not set'}</Text>

      <Text style={styles.section}>Departments</Text>
      <Text style={styles.departmentText}>
        {departments.length ? departments.slice(0, 4).map((d) => d.name).join(' • ') : 'No departments available'}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onJoinQueue}>
          <Text style={styles.primaryBtnText}>Join Live Queue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onBookAppointment}>
          <Text style={styles.secondaryBtnText}>Book Appointment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  name: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 20 },
  meta: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted },
  section: { marginTop: spacing.md, fontFamily: 'Inter_600SemiBold', color: colors.primaryDark },
  departmentText: { marginTop: 6, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 20 },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  secondaryBtn: { backgroundColor: '#f1f6f4', borderRadius: radii.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.primaryDark, fontFamily: 'Inter_600SemiBold' }
});
