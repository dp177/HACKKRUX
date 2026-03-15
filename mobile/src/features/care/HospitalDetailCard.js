import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/tokens';

export default function HospitalDetailCard({ hospital, departments = [], onJoinQueue, onBookAppointment }) {
  return (
    <View style={styles.card}>
      <View style={styles.nameRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="business-outline" size={18} color={colors.primaryDark} />
        </View>
        <Text style={styles.name}>{hospital?.name}</Text>
      </View>
      <Text style={styles.meta}>{hospital?.address || 'Address not set'} • {hospital?.city || 'City not set'}</Text>

      <Text style={styles.section}>Departments</Text>
      <Text style={styles.departmentText}>
        {departments.length ? departments.slice(0, 4).map((d) => d.name).join(' • ') : 'No departments available'}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onJoinQueue} activeOpacity={0.88}>
          <Text style={styles.primaryBtnText}>Join Live Queue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onBookAppointment} activeOpacity={0.88}>
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#deeee9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  name: { marginLeft: spacing.sm, fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 20, flex: 1 },
  meta: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted },
  section: { marginTop: spacing.md, fontFamily: 'Inter_600SemiBold', color: colors.primaryDark },
  departmentText: { marginTop: 6, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 20 },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  secondaryBtn: { backgroundColor: '#f1f6f4', borderRadius: radii.md, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.primaryDark, fontFamily: 'Inter_600SemiBold' }
});
