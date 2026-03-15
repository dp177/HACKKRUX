import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { triageChatNext, triageAnalyze } from '../../api';
import VoiceTriageAgent from '../../components/VoiceTriageAgent';
import { colors, radii, spacing } from '../../theme/tokens';

const TRIAGE_COMPLETE_TOKEN = '[TRIAGE_COMPLETE]';
const FIXED_BOOTSTRAP_QUESTION_COUNT = 2;
const MAX_DYNAMIC_FOLLOWUP_QUESTIONS = 2;
const BREATHING_OPTIONS = ['normal', 'mild', 'severe'];
const COMORBIDITY_OPTIONS = ['Diabetes', 'Hypertension', 'Heart disease', 'Asthma', 'COPD', 'Kidney disease'];

function countAssistantQuestions(messages = []) {
  return (Array.isArray(messages) ? messages : []).filter((item) => item?.role === 'assistant' && String(item?.content || '').trim()).length;
}

/**
 * Multi-step AI triage flow:
 *   1) text mode: initial prompt -> dynamic recursive AI Q&A
 *   2) voice mode: voice agent -> dynamic recursive AI Q&A
 *   3) stop condition: [TRIAGE_COMPLETE] -> context/vitals screen
 *   4) submit analyze payload
 *
 * Props:
 *   patientId, token, availableDepartments[], departmentId, selectedDepartmentName, hospitalId, inputMode, mode, onComplete(result), onError(msg)
 */
export default function TriageForm({ patientId, token, availableDepartments, departmentId, selectedDepartmentName, hospitalId, inputMode = 'text', mode, onComplete, onError }) {
  const [step, setStep] = useState('initial');
  const [debugSessionId] = useState(() => `triage_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  // Text-mode bootstrap
  const [problem, setProblem] = useState('');
  const [duration, setDuration] = useState('');
  const [initError, setInitError] = useState('');

  // Shared dynamic history (text/voice)
  const [history, setHistory] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [askingNext, setAskingNext] = useState(false);

  // Context / vitals screen
  const [age, setAge] = useState('');
  const [breathing, setBreathing] = useState('normal');
  const [recentTrauma, setRecentTrauma] = useState(false);
  const [comorbidities, setComorbidities] = useState([]);
  const [vitals, setVitals] = useState({ hr: '', bp: '', temp: '', o2: '', rr: '' });
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');

  const normalizedInputMode = useMemo(() => (String(inputMode).toLowerCase() === 'voice' ? 'voice' : 'text'), [inputMode]);
  const [effectiveInputMode, setEffectiveInputMode] = useState(normalizedInputMode);

  useEffect(() => {
    setEffectiveInputMode(normalizedInputMode);
  }, [normalizedInputMode]);

  function fallbackToTextMode(reason) {
    console.log('[TriageForm] fallback_to_text', {
      debugSessionId,
      reason: reason || 'unknown',
      previousMode: effectiveInputMode
    });
    setEffectiveInputMode('text');
    setStep('initial');
    onError?.(reason || 'Voice input unavailable. Switched to Text Input.');
  }

  function toggleComorbidity(c) {
    setComorbidities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function handlePickAttachment() {
    try {
      setAttachmentError('');
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        copyToCacheDirectory: true,
        multiple: false
      });

      if (result?.canceled) {
        return;
      }

      const asset = Array.isArray(result?.assets) ? result.assets[0] : null;
      if (!asset?.uri) {
        setAttachmentError('Unable to read selected file. Please try again.');
        return;
      }

      const pickedFile = {
        uri: asset.uri,
        name: asset.name || `report_${Date.now()}`,
        type: asset.mimeType || 'application/octet-stream'
      };

      setAttachment(pickedFile);
      console.log('[TriageForm] attachment_selected', {
        debugSessionId,
        fileName: pickedFile.name,
        mimeType: pickedFile.type
      });
    } catch (error) {
      setAttachmentError(error?.message || 'Could not open file picker');
    }
  }

  function clearAttachment() {
    setAttachment(null);
    setAttachmentError('');
  }

  async function askNextQuestion(baseHistory) {
    try {
      setAskingNext(true);
      const askedAssistantQuestions = countAssistantQuestions(baseHistory);
      const dynamicFollowUpsAsked = Math.max(0, askedAssistantQuestions - FIXED_BOOTSTRAP_QUESTION_COUNT);

      if (dynamicFollowUpsAsked >= MAX_DYNAMIC_FOLLOWUP_QUESTIONS) {
        console.log('[TriageForm] dynamic_limit_reached', {
          debugSessionId,
          inputMode: effectiveInputMode,
          askedAssistantQuestions,
          dynamicFollowUpsAsked,
          maxDynamicFollowUps: MAX_DYNAMIC_FOLLOWUP_QUESTIONS
        });
        setStep('context');
        return;
      }

      console.log('[TriageForm] ask_next_start', {
        debugSessionId,
        inputMode: effectiveInputMode,
        historyLength: Array.isArray(baseHistory) ? baseHistory.length : 0,
        dynamicFollowUpsAsked,
        maxDynamicFollowUps: MAX_DYNAMIC_FOLLOWUP_QUESTIONS
      });
      const result = await triageChatNext(baseHistory);
      const nextQuestion = Array.isArray(result?.questions) ? result.questions[0] : null;

      console.log('[TriageForm] ask_next_response', {
        debugSessionId,
        inputMode: effectiveInputMode,
        questionCount: Array.isArray(result?.questions) ? result.questions.length : 0,
        nextQuestionPreview: typeof nextQuestion === 'string' ? nextQuestion.slice(0, 120) : null
      });

      if (!nextQuestion) {
        onError?.('No follow-up question returned by triage AI');
        setStep(effectiveInputMode === 'voice' ? 'voice' : 'chat');
        return;
      }

      if (nextQuestion === TRIAGE_COMPLETE_TOKEN) {
        console.log('[TriageForm] triage_complete_token', {
          debugSessionId,
          inputMode: effectiveInputMode,
          historyLength: Array.isArray(baseHistory) ? baseHistory.length : 0
        });
        setStep('context');
        return;
      }

      setCurrentQuestion(nextQuestion);
      setHistory((prev) => {
        if (prev.length && prev[prev.length - 1]?.role === 'assistant' && prev[prev.length - 1]?.content === nextQuestion) {
          return prev;
        }
        return [...prev, { role: 'assistant', content: nextQuestion }];
      });

      setStep(effectiveInputMode === 'voice' ? 'voice' : 'chat');
    } catch (error) {
      console.log('[TriageForm] ask_next_error', {
        debugSessionId,
        inputMode: effectiveInputMode,
        message: error?.message || 'unknown error'
      });
      onError?.(error?.message || 'Could not fetch AI questions');
      setStep(effectiveInputMode === 'voice' ? 'voice' : 'initial');
    } finally {
      setAskingNext(false);
    }
  }

  // ── Text bootstrap ──────────────────────────────────────────────────────────
  async function handleInitialSubmit() {
    if (!problem.trim()) { setInitError('Please describe your problem.'); return; }
    if (!duration.trim()) { setInitError('Please enter how long you\'ve had it.'); return; }
    setInitError('');

    console.log('[TriageForm] initial_submit', {
      debugSessionId,
      patientId,
      mode,
      inputMode: effectiveInputMode,
      departmentId: departmentId || null,
      hospitalId: hospitalId || null,
      availableDepartmentsCount: Array.isArray(availableDepartments) ? availableDepartments.length : 0
    });

    const seedHistory = [
      { role: 'assistant', content: 'What is your problem today?' },
      { role: 'user', content: problem.trim() },
      { role: 'assistant', content: 'How long have you had this problem?' },
      { role: 'user', content: duration.trim() }
    ];
    setHistory(seedHistory);
    setCurrentAnswer('');
    await askNextQuestion(seedHistory);
  }

  function handleVoiceHistoryComplete(finalHistory) {
    console.log('[TriageForm] voice_history_complete', {
      debugSessionId,
      historyLength: Array.isArray(finalHistory) ? finalHistory.length : 0
    });
    setHistory(finalHistory || []);
    setStep('context');
  }

  // ── Text mode answer submit ─────────────────────────────────────────────────
  async function handleTextAnswerNext() {
    if (!currentAnswer.trim()) { setAnswerError('Please type your answer.'); return; }
    setAnswerError('');

    console.log('[TriageForm] text_answer_submit', {
      debugSessionId,
      answerLength: currentAnswer.trim().length,
      historyLength: history.length
    });

    const updatedHistory = [
      ...history,
      { role: 'user', content: currentAnswer.trim() }
    ];
    setHistory(updatedHistory);
    setCurrentAnswer('');
    await askNextQuestion(updatedHistory);
  }

  // ── Final submit ────────────────────────────────────────────────────────────
  async function handleContextSubmit() {
    const submitStartedAt = Date.now();
    setStep('submitting');
    const submitAction = mode === 'queue' ? 'Submit & Join Queue' : 'Submit & Continue Booking';
    const payload = {
      patient_id: patientId,
      choosen_department: selectedDepartmentName || null,
      department_id: departmentId || null,
      hospital_id: hospitalId || null,
      input_mode: effectiveInputMode,
      conversation_history: history,
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
        debugSessionId,
        submitAction,
        mode,
        patientId,
        selectedDepartmentName: payload.choosen_department,
        departmentId: payload.department_id,
        hospitalId: payload.hospital_id,
        inputMode: effectiveInputMode,
        historyLength: payload.conversation_history.length,
        hasAttachment: Boolean(attachment?.uri),
        attachmentName: attachment?.name || null,
        hasVitals: Object.values(payload.vitals || {}).some((v) => String(v || '').trim() !== ''),
        comorbidityCount: payload.context?.comorbidities?.length || 0,
        outgoingPayload: payload,
        attachmentMeta: attachment
          ? {
              uri: attachment.uri || null,
              name: attachment.name || null,
              type: attachment.type || null,
              size: attachment.size || null
            }
          : null
      });
      const result = await triageAnalyze(payload, token, attachment || null);
      console.log('[TriageForm] analyze_success', {
        debugSessionId,
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
        debugSessionId,
        durationMs: Date.now() - submitStartedAt,
        message: err?.message || 'unknown error'
      });
      onError?.(err.message || 'AI triage analysis failed');
      setStep('context');
    }
  }

  if (step === 'submitting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Analyzing with AI</Text>
      </View>
    );
  }

  if (effectiveInputMode === 'voice' && (step === 'initial' || step === 'voice' || step === 'chat') && step !== 'context') {
    return (
      <VoiceTriageAgent
        token={token}
        onComplete={handleVoiceHistoryComplete}
        onError={(message) => onError?.(message)}
        onFallbackToText={() => fallbackToTextMode('Voice input unavailable. Switched to Text Input.')}
      />
    );
  }

  if (step === 'chat') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>AI Triage</Text>
        <Text style={styles.subtitle}>Answer the dynamic follow-up questions below.</Text>

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

        {currentQuestion ? (
          <View style={styles.currentQ}>
            <Text style={styles.aiQLabel}>AI</Text>
            <Text style={styles.aiQText}>{currentQuestion}</Text>
          </View>
        ) : null}

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

        <TouchableOpacity style={styles.btn} onPress={handleTextAnswerNext} disabled={askingNext}>
          {askingNext ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Next</Text>}
        </TouchableOpacity>
      </View>
    );
  }

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

        <Text style={styles.label}>Upload Previous Prescription/Report (Optional)</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handlePickAttachment}>
          <Text style={styles.secondaryBtnText}>{attachment?.name ? 'Change File' : 'Choose File'}</Text>
        </TouchableOpacity>

        {attachment?.name ? (
          <View style={styles.attachmentRow}>
            <Text style={styles.attachmentText} numberOfLines={2}>{attachment.name}</Text>
            <TouchableOpacity onPress={clearAttachment}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {attachmentError ? <Text style={styles.errorText}>{attachmentError}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={handleContextSubmit}>
          <Text style={styles.btnText}>{mode === 'queue' ? 'Submit & Join Queue' : 'Submit & Continue Booking'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

      <TouchableOpacity style={styles.btn} onPress={handleInitialSubmit} disabled={askingNext}>
        {askingNext ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Start Dynamic Questions</Text>}
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
  secondaryBtn: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, alignItems: 'center', paddingVertical: 11, backgroundColor: '#fff' },
  secondaryBtnText: { color: colors.primaryDark, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  attachmentRow: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  attachmentText: { flex: 1, color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 12 },
  removeText: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
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
