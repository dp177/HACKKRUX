import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

function formatSelectedDateLabel(date) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
}

export default function SlotSelector({ slots = [], selectedSlot, selectedDate, infoMessage = '', onSelect }) {
  const dayLabel = formatSelectedDateLabel(selectedDate);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select Slot</Text>
      {dayLabel ? <Text style={styles.subtitle}>{dayLabel}</Text> : null}
      {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}
      <FlatList
        data={slots}
        keyExtractor={(item, index) => String(item.slotId || item.time || item.startTime || `slot-${index}`)}
        numColumns={3}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => {
          const timeLabel = item.time || item.startTime || '';
          const active = selectedSlot === timeLabel;
          const disabled = item.available === false;
          return (
            <TouchableOpacity
              style={[styles.pill, active && styles.pillActive, disabled && styles.pillDisabled]}
              onPress={() => onSelect(item)}
              disabled={disabled}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive, disabled && styles.pillTextDisabled]}>{timeLabel}</Text>
              {item.endTime ? <Text style={styles.meta}>{item.endTime}</Text> : null}
              {disabled ? <Text style={styles.meta}>{item.status || 'Booked'}</Text> : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 18, marginBottom: spacing.sm },
  subtitle: { marginTop: -4, marginBottom: spacing.sm, fontFamily: 'Inter_400Regular', color: colors.muted, fontSize: 13 },
  infoText: { marginBottom: spacing.sm, fontFamily: 'Inter_400Regular', color: colors.muted, fontSize: 12 },
  pill: { flex: 1, minWidth: 94, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center', paddingVertical: 10 },
  pillActive: { borderColor: colors.primary, backgroundColor: '#e8f4f1' },
  pillDisabled: { backgroundColor: '#f2f4f5', borderColor: '#d7dde0' },
  pillText: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  pillTextActive: { color: colors.primaryDark },
  pillTextDisabled: { color: '#9ba7ad' },
  meta: { marginTop: 2, fontFamily: 'Inter_400Regular', color: '#9ba7ad', fontSize: 11 }
});
