import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

const SEVERITY = ['mild', 'moderate', 'severe'];

export default function TriageForm({ values, onChange, onSubmit, mode }) {
  const selectedSymptoms = values.symptoms || [];
  const symptomCatalog = ['fever', 'headache', 'chest pain', 'breathing difficulty', 'nausea'];

  function toggleSymptom(symptom) {
    if (selectedSymptoms.includes(symptom)) {
      onChange('symptoms', selectedSymptoms.filter((s) => s !== symptom));
    } else {
      onChange('symptoms', [...selectedSymptoms, symptom]);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{mode === 'booking' ? 'Booking + Triage Form' : 'Join Queue Triage Form'}</Text>

      <Text style={styles.label}>Chief Complaint</Text>
      <TextInput
        value={values.chiefComplaint}
        onChangeText={(text) => onChange('chiefComplaint', text)}
        style={styles.input}
        placeholder="What brings you today?"
      />

      <Text style={styles.label}>Symptoms</Text>
      <View style={styles.rowWrap}>
        {symptomCatalog.map((symptom) => {
          const active = selectedSymptoms.includes(symptom);
          return (
            <TouchableOpacity key={symptom} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleSymptom(symptom)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{symptom}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Severity</Text>
      <View style={styles.rowWrap}>
        {SEVERITY.map((s) => {
          const active = values.symptomSeverity === s;
          return (
            <TouchableOpacity key={s} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange('symptomSeverity', s)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Duration (hours)</Text>
      <TextInput
        value={String(values.symptomDuration)}
        onChangeText={(text) => onChange('symptomDuration', Number(text) || 0)}
        style={styles.input}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Vitals (Optional)</Text>
      <View style={styles.grid}>
        <TextInput value={String(values.vitalSigns.hr || '')} onChangeText={(t) => onChange('vitalSigns.hr', Number(t) || undefined)} style={styles.inputSmall} placeholder="HR" keyboardType="numeric" />
        <TextInput value={values.vitalSigns.bp || ''} onChangeText={(t) => onChange('vitalSigns.bp', t)} style={styles.inputSmall} placeholder="BP" />
        <TextInput value={String(values.vitalSigns.temp || '')} onChangeText={(t) => onChange('vitalSigns.temp', Number(t) || undefined)} style={styles.inputSmall} placeholder="Temp" keyboardType="numeric" />
        <TextInput value={String(values.vitalSigns.o2 || '')} onChangeText={(t) => onChange('vitalSigns.o2', Number(t) || undefined)} style={styles.inputSmall} placeholder="O2" keyboardType="numeric" />
      </View>

      <TouchableOpacity style={styles.submit} onPress={onSubmit}>
        <Text style={styles.submitText}>{mode === 'booking' ? 'Submit and Continue Booking' : 'Submit and Join Queue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginBottom: spacing.xl, backgroundColor: '#fff', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18, color: colors.text, marginBottom: spacing.sm },
  label: { fontFamily: 'Inter_600SemiBold', color: colors.primaryDark, marginTop: spacing.sm, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', backgroundColor: '#fdfefe' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: colors.primary, backgroundColor: '#e8f4f1' },
  chipText: { fontFamily: 'Inter_400Regular', color: colors.text },
  chipTextActive: { color: colors.primaryDark, fontFamily: 'Inter_600SemiBold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inputSmall: { minWidth: 95, flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 10, fontFamily: 'Inter_400Regular' },
  submit: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', paddingVertical: 12 },
  submitText: { color: '#fff', fontFamily: 'Inter_600SemiBold' }
});
