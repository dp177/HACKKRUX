import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import SlotButton from '../../components/home/SlotButton';

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

  console.log('[SlotSelector] render', {
    selectedDate,
    dayLabel,
    slotsCount: slots.length,
    selectedSlot,
    preview: slots.slice(0, 3).map((slot) => ({
      slotId: slot?.slotId || null,
      time: slot?.time || slot?.startTime || '',
      endTime: slot?.endTime || null,
      available: slot?.available,
      status: slot?.status || null
    }))
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select Slot</Text>
      {dayLabel ? <Text style={styles.subtitle}>{dayLabel}</Text> : null}
      {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}
      <FlatList
        data={slots}
        keyExtractor={(item, index) => String(item.slotId || item.time || item.startTime || `slot-${index}`)}
        numColumns={3}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item, index }) => {
          const timeLabel = item.time || item.startTime || '';
          const active = selectedSlot === timeLabel;
          const disabled = item.available === false;
          return (
            <SlotButton
              slot={item}
              active={active}
              disabled={disabled}
              onPress={() => onSelect(item)}
              index={index}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md
  },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 20, marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.sm, fontFamily: 'Inter_400Regular', color: colors.muted, fontSize: 13 },
  infoText: {
    marginBottom: spacing.sm,
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    fontSize: 12,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radii.md
  },
  columns: {
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  gridContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs
  }
});
