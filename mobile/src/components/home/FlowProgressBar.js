import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export default function FlowProgressBar({ steps = [], activeIndex = 0 }) {
  if (!Array.isArray(steps) || !steps.length) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {steps.map((step, index) => {
          const completed = index < activeIndex;
          const active = index === activeIndex;

          return (
            <View key={step.key || step.label || String(index)} style={styles.stepItem}>
              <View style={styles.dotRow}>
                <View style={[styles.dot, completed && styles.dotComplete, active && styles.dotActive]}>
                  <Text style={[styles.dotText, (completed || active) && styles.dotTextActive]}>{index + 1}</Text>
                </View>
                {index < steps.length - 1 ? (
                  <View style={[styles.line, (completed || active) && styles.lineActive]} />
                ) : null}
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  row: {
    paddingRight: spacing.sm
  },
  stepItem: {
    minWidth: 112,
    marginRight: spacing.sm
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a7b3ba',
    backgroundColor: '#f3f5f6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dotComplete: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark
  },
  dotActive: {
    backgroundColor: '#222629',
    borderColor: '#222629'
  },
  dotText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#50616b'
  },
  dotTextActive: {
    color: '#ffffff'
  },
  line: {
    height: 1,
    width: 78,
    backgroundColor: '#bbc6cc',
    marginLeft: 6
  },
  lineActive: {
    backgroundColor: '#222629'
  },
  label: {
    marginTop: 8,
    fontFamily: 'Inter_600SemiBold',
    color: '#70828d',
    fontSize: 12
  },
  labelActive: {
    color: colors.text
  }
});
