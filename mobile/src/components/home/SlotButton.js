import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export default function SlotButton({ slot, active, disabled, onPress, index = 0 }) {
  const timeLabel = slot?.time || slot?.startTime || '';

  return (
    <View style={styles.cell}>
      <TouchableOpacity
        style={[styles.button, active && styles.buttonActive, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Text style={[styles.time, active && styles.timeActive, disabled && styles.timeDisabled]}>{timeLabel}</Text>
        {slot?.endTime ? <Text style={styles.meta}>{slot.endTime}</Text> : null}
        {disabled ? <Text style={styles.meta}>{slot?.status || 'Booked'}</Text> : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    minWidth: 98
  },
  button: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 74,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm
  },
  buttonActive: {
    borderColor: colors.primary,
    backgroundColor: '#e7f4f1'
  },
  buttonDisabled: {
    backgroundColor: '#eff3f2',
    borderColor: '#d5dfdc'
  },
  time: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 13
  },
  timeActive: {
    color: colors.primaryDark
  },
  timeDisabled: {
    color: '#9ea9a6'
  },
  meta: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    color: '#95a29e',
    fontSize: 11
  }
});
