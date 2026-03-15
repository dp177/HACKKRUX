import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/tokens';

export default function HospitalCard({ item, disabled = false, onPress, index = 0 }) {
  return (
    <View>
      <TouchableOpacity
        style={[styles.card, disabled && styles.cardDisabled]}
        activeOpacity={0.88}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.rowTop}>
          <View style={styles.iconWrap}>
            <Ionicons name="medical" size={18} color={colors.primaryDark} />
          </View>
          <View style={styles.contentWrap}>
            <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.city || 'City not set'} • {item.state || 'State not set'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>

        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{item.departmentCount || 0} depts</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{item.doctorCount || 0} doctors</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  cardDisabled: {
    opacity: 0.6
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  contentWrap: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ebf3f1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 16
  },
  meta: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    fontSize: 12
  },
  pillRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm
  },
  pill: {
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark,
    fontSize: 12
  }
});
