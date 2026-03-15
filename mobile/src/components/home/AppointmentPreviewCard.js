import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/tokens';

function formatDisplayDate(value) {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function AppointmentPreviewCard({ loading, upcomingPreview, onRefresh }) {
  const cardTitle = upcomingPreview ? 'Active Care' : 'Care Summary';
  const statusText = upcomingPreview ? 'Appointment Active' : 'No Upcoming Appointment';
  const doctorName = upcomingPreview?.doctorName || 'Doctor not assigned';
  const hospitalName = upcomingPreview?.hospitalName || 'Hospital not selected';

  return (
    <LinearGradient colors={['#138f78', '#0d7462']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{cardTitle}</Text>
          <View style={styles.statusPill}>
            <Ionicons name="checkmark-circle-outline" size={12} color="#ddfff6" />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton} activeOpacity={0.8}>
          <Ionicons name="refresh" size={12} color="#ebfffa" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.meta}>Loading active care summary...</Text>
      ) : (
        <>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={14} color="#d2fff3" />
            <Text style={styles.doctor} numberOfLines={1}>{doctorName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={14} color="#d2fff3" />
            <Text style={styles.meta} numberOfLines={1}>{hospitalName}</Text>
          </View>

          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Due Date</Text>
              <Text style={styles.statValue}>{formatDisplayDate(upcomingPreview?.date)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{upcomingPreview.time || '-'}</Text>
            </View>
          </View>
        </>
      )}

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  statusPill: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#76dcc6',
    backgroundColor: '#ffffff24',
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  statusText: {
    color: '#e8fffa',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#f6fffc',
    fontSize: 16
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#8fe2d0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ffffff20'
  },
  refreshText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#ebfffa',
    fontSize: 12
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3
  },
  doctor: {
    fontFamily: 'Inter_700Bold',
    color: '#ffffff',
    fontSize: 15,
    flex: 1
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    color: '#d8fff7',
    flex: 1
  },
  statRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm
  },
  statCard: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: '#ffffff1f',
    borderWidth: 1,
    borderColor: '#74d8c3',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  statLabel: {
    color: '#d2fff3',
    fontFamily: 'Inter_400Regular',
    fontSize: 11
  },
  statValue: {
    marginTop: 2,
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    fontSize: 13
  },

});
