import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import TopBar from '../../components/home/TopBar';

const FAQS = [
  {
    q: 'How do I book an appointment?',
    a: 'Select your hospital, department, doctor, date, and slot. Confirm your booking from the app home screen.'
  },
  {
    q: 'How does AI triage work?',
    a: 'AI triage analyzes your symptoms and medical history to prioritize care and recommend departments.'
  },
  {
    q: 'What if my hospital is not listed?',
    a: 'Use the QR scan feature at the hospital entrance or contact support to request addition.'
  },
  {
    q: 'How do I join the live queue?',
    a: 'Select your hospital and department, then follow the prompts to join the queue and receive your token.'
  },
  {
    q: 'Is my medical data secure?',
    a: 'Yes, your data is encrypted and only accessible to authorized medical staff. We follow strict privacy standards.'
  },
  {
    q: 'How can I reschedule or cancel an appointment?',
    a: 'Go to the Appointments tab, select your appointment, and choose reschedule or cancel.'
  },
  {
    q: 'What if I face technical issues?',
    a: 'Try restarting the app. If issues persist, contact support from the Help page.'
  },
  {
    q: 'How do I contact support?',
    a: 'Use the Help page to access support and FAQ. For urgent issues, contact hospital reception.'
  }
];

export default function HelpScreen() {
  function emitScroll(event) {
    DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
  }
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} onScroll={emitScroll} scrollEventThrottle={16}>
        <Text style={styles.title}>Help & FAQ</Text>
        {FAQS.map((item, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, color: colors.text, marginBottom: spacing.md },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  question: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.primaryDark, marginBottom: 4 },
  answer: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.text }
});
