import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { triageChatNext, triageAnalyze } from '../../api';
import { colors, radii, spacing } from '../../theme/tokens';

const MAX_AI_QUESTIONS = 3;
const BREATHING_OPTIONS = ['normal', 'mild', 'severe'];
const COMORBIDITY_OPTIONS = ['Diabetes', 'Hypertension', 'Heart disease', 'Asthma', 'COPD', 'Kidney disease'];

/**
 * Multi-step AI triage chat flow:
 *   1. 'initial'  — ask chief complaint + duration
 *   2. 'ai_loading' — fetch next questions from AI
 *   3. 'ai_chat'  — ask AI questions one by one
 *   4. 'context'  — collect age, breathing, comorbidities, vitals
 *   5. 'submitting' — analyze triage
 *
 * Props:
 *   patientId, token, availableDepartments[], departmentId, hospitalId, mode, onComplete(result), onError(msg)
 */
export default function TriageForm({ patientId, token, availableDepartments, departmentId, hospitalId, mode, onComplete, onError }) {
  const [step, setStep] = useState('initial');

  // Step 1
  const [problem, setProblem] = useState('');
  const [duration, setDuration] = useState('');
  const [initError, setInitError] = useState('');

  // Step 3 (AI chat)
  const [history, setHistory] = useState([]);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiQIdx, setAiQIdx] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');

  // Step 4 (context)
  const [age, setAge] = useState('');
  const [breathing, setBreathing] = useState('normal');
  const [recentTrauma, setRecentTrauma] = useState(false);
  const [comorbidities, setComorbidities] = useState([]);
  const [vitals, setVitals] = useState({ hr: '', bp: '', temp: '', o2: '', rr: '' });

  function toggleComorbidity(c) {
    setComorbidities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  // ── Step 1 submit ──────────────────────────────────────────────────────────
  async function handleInitialSubmit() {
    if (!problem.trim()) { setInitError('Please describe your problem.'); return; }
    if (!duration.trim()) { setInitError('Please enter how long you\'ve had it.'); return; }
    setInitError('');

    console.log('[TriageForm] initial_submit', {
      patientId,
      mode,
      departmentId: departmentId || null,
      hospitalId: hospitalId || null,
      availableDepartmentsCount: Array.isArray(availableDepartments) ? availableDepartments.length : 0
    });

    const initialHistory = [
      { role: 'assistant', content: 'What is your problem today?' },
      { role: 'user', content: problem.trim() },
      { role: 'assistant', content: 'How long have you had this problem?' },
      { role: 'user', content: duration.trim() }
    ];
    setHistory(initialHistory);
    setStep('ai_loading');

    try {
      const result = await triageChatNext(initialHistory);
      const questions = (result?.questions || []).slice(0, MAX_AI_QUESTIONS);
      console.log('[TriageForm] chat_next_success', {
        requestedHistoryLength: initialHistory.length,
        returnedQuestions: Array.isArray(questions) ? questions.length : 0
      });
      if (!questions.length) {
        console.log('[TriageForm] chat_next_empty_questions_fallback_to_context');
        setStep('context');
        return;
      }
      setAiQuestions(questions);
      setAiQIdx(0);
      setCurrentAnswer('');
      setStep('ai_chat');
    } catch (err) {
      console.log('[TriageForm] chat_next_error', { message: err?.message || 'unknown error' });
      onError?.(err.message || 'Could not fetch AI questions');
      setStep('initial');
    }
  }

  // ── Step 3: answer AI question ─────────────────────────────────────────────
  function handleAiAnswerNext() {
    if (!currentAnswer.trim()) { setAnswerError('Please type your answer.'); return; }
    setAnswerError('');

    const newHistory = [
      ...history,
      { role: 'assistant', content: aiQuestions[aiQIdx] },
      { role: 'user', content: currentAnswer.trim() }
    ];
    setHistory(newHistory);
    setCurrentAnswer('');

    console.log('[TriageForm] answer_recorded', {
      currentQuestionIndex: aiQIdx,
      totalQuestions: aiQuestions.length,
      historyLength: newHistory.length
    });

    if (aiQIdx + 1 < aiQuestions.length) {
      setAiQIdx((prev) => prev + 1);
    } else {
      setStep('context');
    }
  }

  // ── Step 4: final submit ───────────────────────────────────────────────────
  async function handleContextSubmit() {
    const submitStartedAt = Date.now();
    setStep('submitting');
    const payload = {
      patient_id: patientId,
      department_id: departmentId || null,
      hospital_id: hospitalId || null,
      conversation_history: history,
      available_departments: availableDepartments || [],
      context: {
        is_conscious: true,
        breathing_difficulty: breathing,
        age: Number(age) || 0,
        comorbidities,
        recent_trauma_or_surgery: recentTrauma
      },
      vitals: {
        heart_rate: Number(vitals.hr) || 0,
        blood_pressure: vitals.bp || '',
        temperature: Number(vitals.temp) || 0,
        o2_sat: Number(vitals.o2) || 0,
        respiratory_rate: Number(vitals.rr) || 0
      }
    };

    try {
      console.log('[TriageForm] analyze_submit', {
        patientId,
        departmentId: payload.department_id,
        hospitalId: payload.hospital_id,
        historyLength: payload.conversation_history.length,
        hasVitals: Object.values(payload.vitals || {}).some((v) => String(v || '').trim() !== ''),
        comorbidityCount: payload.context?.comorbidities?.length || 0
      });
      const result = await triageAnalyze(payload, token);
      console.log('[TriageForm] analyze_success', {
        durationMs: Date.now() - submitStartedAt,
        triageId: result?.triage?.id || null,
        riskScore: result?.triage?.risk_score ?? null,
        urgency: result?.triage?.urgency_level ?? null,
        tokenNumber: result?.queue?.tokenNumber ?? null,
        queuePosition: result?.queue?.queuePosition ?? null
      });
      onComplete?.(result);
    } catch (err) {
      console.log('[TriageForm] analyze_error', {
        durationMs: Date.now() - submitStartedAt,
        message: err?.message || 'unknown error'
      });
      onError?.(err.message || 'AI triage analysis failed');
      setStep('context');
    }
  }

  // ── Loading screens ────────────────────────────────────────────────────────
  if (step === 'ai_loading' || step === 'submitting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          {step === 'ai_loading' ? 'AI is generating questions\u2026' : 'Analyzing with AI\u2026'}
        </Text>
      </View>
    );
  }

  // ── Step 3: AI chat ────────────────────────────────────────────────────────
  if (step === 'ai_chat') {
    const totalQ = aiQuestions.length;
    return (
      <View style={styles.wrap}>
        <View style={styles.progressRow}>
          <Text style={styles.stepLabel}>Question {aiQIdx + 1} of {totalQ}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((aiQIdx + 1) / totalQ) * 100}%` }]} />
          </View>
        </View>

        {/* Previous Q&A history */}
        {history.length > 0 && (
          <View style={styles.chatHistory}>
            {history.map((msg, i) => (
              <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
                <Text style={[styles.bubbleText, msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI]}>
                  {msg.content}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Current AI question */}
        <View style={styles.currentQ}>
          <Text style={styles.aiQLabel}>AI</Text>
          <Text style={styles.aiQText}>{aiQuestions[aiQIdx]}</Text>
        </View>

        <TextInput
          value={currentAnswer}
          onChangeText={(t) => { setCurrentAnswer(t); setAnswerError(''); }}
          style={[styles.input, styles.inputTall]}
          placeholder="Type your answer..."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        {answerError ? <Text style={styles.errorText}>{answerError}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={handleAiAnswerNext}>
          <Text style={styles.btnText}>
            {aiQIdx + 1 < totalQ ? 'Next \u2192' : 'Continue to Details \u2192'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step 4: context form ───────────────────────────────────────────────────
  if (step === 'context') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Almost done!</Text>
        <Text style={styles.subtitle}>A few more details to complete your triage.</Text>

        <Text style={styles.label}>Age</Text>
        <TextInput
          value={age}
          onChangeText={setAge}
          style={styles.input}
          keyboardType="numeric"
          placeholder="Your age"
        />

        <Text style={styles.label}>Breathing Difficulty</Text>
        <View style={styles.rowWrap}>
          {BREATHING_OPTIONS.map((b) => (
            <TouchableOpacity key={b} style={[styles.chip, breathing === b && styles.chipActive]} onPress={() => setBreathing(b)}>
              <Text style={[styles.chipText, breathing === b && styles.chipTextActive]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Recent Trauma / Surgery</Text>
          <Switch value={recentTrauma} onValueChange={setRecentTrauma} trackColor={{ true: colors.primary }} />
        </View>

        <Text style={styles.label}>Comorbidities</Text>
        <View style={styles.rowWrap}>
          {COMORBIDITY_OPTIONS.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, comorbidities.includes(c) && styles.chipActive]} onPress={() => toggleComorbidity(c)}>
              <Text style={[styles.chipText, comorbidities.includes(c) && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Vitals (Optional)</Text>
        <View style={styles.grid}>
          <TextInput value={vitals.hr} onChangeText={(t) => setVitals((v) => ({ ...v, hr: t }))} style={styles.inputSmall} placeholder="HR" keyboardType="numeric" />
          <TextInput value={vitals.bp} onChangeText={(t) => setVitals((v) => ({ ...v, bp: t }))} style={styles.inputSmall} placeholder="BP 120/80" />
          <TextInput value={vitals.temp} onChangeText={(t) => setVitals((v) => ({ ...v, temp: t }))} style={styles.inputSmall} placeholder="Temp" keyboardType="numeric" />
          <TextInput value={vitals.o2} onChangeText={(t) => setVitals((v) => ({ ...v, o2: t }))} style={styles.inputSmall} placeholder="O2 %" keyboardType="numeric" />
          <TextInput value={vitals.rr} onChangeText={(t) => setVitals((v) => ({ ...v, rr: t }))} style={styles.inputSmall} placeholder="RR" keyboardType="numeric" />
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleContextSubmit}>
          <Text style={styles.btnText}>{mode === 'queue' ? 'Submit & Join Queue' : 'Submit & Continue Booking'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step 1: initial (default) ──────────────────────────────────────────────
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>AI Triage</Text>
      <Text style={styles.subtitle}>Answer a few questions and our AI will assess your condition.</Text>

      <Text style={styles.label}>What is your problem? *</Text>
      <TextInput
        value={problem}
        onChangeText={(t) => { setProblem(t); setInitError(''); }}
        style={[styles.input, styles.inputTall]}
        placeholder="e.g. chest pain, headache, fever..."
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Since when? *</Text>
      <TextInput
        value={duration}
        onChangeText={(t) => { setDuration(t); setInitError(''); }}
        style={styles.input}
        placeholder="e.g. 2 hours, 3 days, since morning"
      />

      {initError ? <Text style={styles.errorText}>{initError}</Text> : null}

      <TouchableOpacity style={styles.btn} onPress={handleInitialSubmit}>
        <Text style={styles.btnText}>Next \u2192</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { margin: spacing.lg, backgroundColor: '#fff', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadingText: { marginTop: spacing.md, color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 15 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20, color: colors.text, marginBottom: 4 },
  subtitle: { fontFamily: 'Inter_400Regular', color: colors.muted, marginBottom: spacing.md, fontSize: 13 },
  progressRow: { marginBottom: spacing.md },
  stepLabel: { fontFamily: 'Inter_600SemiBold', color: colors.primary, marginBottom: 6, fontSize: 13 },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: radii.pill, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radii.pill },
  label: { fontFamily: 'Inter_600SemiBold', color: colors.primaryDark, marginTop: spacing.sm, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', backgroundColor: '#fdfefe' },
  inputTall: { minHeight: 80 },
  inputSmall: { minWidth: 90, flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 10, fontFamily: 'Inter_400Regular' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: colors.primary, backgroundColor: '#e8f4f1' },
  chipText: { fontFamily: 'Inter_400Regular', color: colors.text },
  chipTextActive: { color: colors.primaryDark, fontFamily: 'Inter_600SemiBold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  btn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', paddingVertical: 14 },
  btnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  errorText: { color: colors.danger, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  chatHistory: { marginBottom: spacing.md, gap: spacing.sm },
  bubble: { borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '85%', marginVertical: 2 },
  bubbleAI: { backgroundColor: '#f0f4f8', alignSelf: 'flex-start' },
  bubbleUser: { backgroundColor: '#e8f4f1', alignSelf: 'flex-end' },
  bubbleText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  bubbleTextAI: { color: colors.text },
  bubbleTextUser: { color: colors.primaryDark },
  currentQ: { backgroundColor: '#f8f9fa', borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  aiQLabel: { fontFamily: 'Inter_700Bold', color: colors.primary, fontSize: 11, marginTop: 2 },
  aiQText: { flex: 1, fontFamily: 'Inter_600SemiBold', color: colors.text, fontSize: 15, lineHeight: 22 }
});
