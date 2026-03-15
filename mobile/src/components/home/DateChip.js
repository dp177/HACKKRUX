import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii } from '../../theme/tokens';

export default function DateChip({ day, monthDate, active, onPress, index = 0 }) {
  return (
    <View>
      <TouchableOpacity
        style={[styles.chip, active && styles.chipActive]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text style={[styles.day, active && styles.activeText]}>{day}</Text>
        <Text style={[styles.date, active && styles.activeText]}>{monthDate}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minWidth: 92,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e7f4f1'
  },
  day: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2
  },
  date: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 14
  },
  activeText: {
    color: colors.primaryDark
  }
});
