import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { triageChatNext } from '../api';
import { colors, radii, spacing } from '../theme/tokens';

const TRIAGE_COMPLETE_TOKEN = '[TRIAGE_COMPLETE]';

export default function VoiceTriageAgent({ onComplete, onError }) {
  const [conversation, setConversation] = useState([]);
  const [subtitle, setSubtitle] = useState('Tap Start to begin voice triage.');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);

  const voiceRef = useRef(null);
  const ttsRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function setupVoiceModules() {
      try {
        const VoiceModule = await import('@react-native-voice/voice');
        const TtsModule = await import('react-native-tts');

        if (!mounted) return;

        const Voice = VoiceModule.default || VoiceModule;
        const Tts = TtsModule.default || TtsModule;

        voiceRef.current = Voice;
        ttsRef.current = Tts;

        Voice.onSpeechResults = handleSpeechResults;
        Voice.onSpeechError = handleSpeechError;

        setVoiceReady(true);
      } catch (error) {
        setVoiceReady(false);
        onError?.('Voice mode requires a development build with @react-native-voice/voice and react-native-tts installed.');
      }
    }

    setupVoiceModules();

    return () => {
      mounted = false;
      cleanupVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cleanupVoice() {
    const Voice = voiceRef.current;
    const Tts = ttsRef.current;

    try {
      if (Voice?.stop) await Voice.stop();
      if (Voice?.destroy) await Voice.destroy();
      if (Voice?.removeAllListeners) Voice.removeAllListeners();
    } catch {
      // ignore cleanup errors
    }

    try {
      if (Tts?.stop) await Tts.stop();
    } catch {
      // ignore cleanup errors
    }
  }

  async function speak(text) {
    const Tts = ttsRef.current;
    if (!Tts?.speak) return;

    try {
      setSpeaking(true);
      setSubtitle(`AI: ${text}`);
      await Tts.stop?.();
      Tts.speak(text, { rate: 0.48, pitch: 1.0 });
    } finally {
      setTimeout(() => setSpeaking(false), 1000);
    }
  }

  async function startListening() {
    const Voice = voiceRef.current;
    if (!Voice?.start) return;

    try {
      setListening(true);
      await Voice.start('en-US');
    } catch (error) {
      setListening(false);
      onError?.(error?.message || 'Failed to start listening');
    }
  }

  async function stopListening() {
    const Voice = voiceRef.current;
    if (!Voice?.stop) return;

    try {
      await Voice.stop();
    } catch {
      // ignore stop failures
    } finally {
      setListening(false);
    }
  }

  async function askNextQuestion(history) {
    try {
      setBusy(true);
      const data = await triageChatNext(history);
      const nextQuestion = Array.isArray(data?.questions) ? data.questions[0] : null;

      if (!nextQuestion) {
        onError?.('No follow-up question returned by triage AI');
        return;
      }

      if (nextQuestion === TRIAGE_COMPLETE_TOKEN) {
        await stopListening();
        await speak('Thank you. I have all the information I need. Calculating your priority now.');
        onComplete?.(history);
        return;
      }

      const withAssistant = [...history, { role: 'assistant', content: nextQuestion }];
      setConversation(withAssistant);
      await speak(nextQuestion);

      setTimeout(() => {
        startListening();
      }, 1400);
    } catch (error) {
      onError?.(error?.message || 'Voice triage failed while fetching next question');
    } finally {
      setBusy(false);
    }
  }

  async function handleSpeechResults(event) {
    const spoken = Array.isArray(event?.value) ? event.value[0] : '';
    const userText = String(spoken || '').trim();
    setListening(false);

    if (!userText) {
      setTimeout(startListening, 600);
      return;
    }

    setSubtitle(`You: ${userText}`);

    const updatedHistory = [...conversation, { role: 'user', content: userText }];
    setConversation(updatedHistory);
    await askNextQuestion(updatedHistory);
  }

  function handleSpeechError(event) {
    setListening(false);
    const message = event?.error?.message || 'Voice recognition error';
    onError?.(message);
  }

  async function handleStartVoiceFlow() {
    if (!voiceReady || busy) return;
    const seedHistory = [];
    setConversation(seedHistory);
    await askNextQuestion(seedHistory);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Voice Triage</Text>
      <Text style={styles.subtitle}>Answer by voice. Live subtitles will appear below.</Text>

      <View style={styles.indicators}>
        <Text style={styles.indicatorText}>{listening ? 'Listening...' : 'Not listening'}</Text>
        <Text style={styles.indicatorText}>{speaking ? 'AI Speaking...' : 'AI idle'}</Text>
      </View>

      <View style={styles.subtitleCard}>
        <Text style={styles.subtitleLabel}>Live Subtitle</Text>
        <Text style={styles.subtitleValue}>{subtitle}</Text>
      </View>

      <View style={styles.chatHistory}>
        {conversation.slice(-8).map((item, idx) => (
          <View key={`${item.role}-${idx}`} style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
            <Text style={styles.bubbleRole}>{item.role === 'user' ? 'You' : 'AI'}</Text>
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, (!voiceReady || busy) && styles.buttonDisabled]}
        onPress={handleStartVoiceFlow}
        disabled={!voiceReady || busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start Voice Triage</Text>}
      </TouchableOpacity>

      {!voiceReady ? <Text style={styles.warn}>Voice mode unavailable in this build. Use Text Input or run a development build.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    margin: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: '#fff',
    padding: spacing.lg
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 20
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 13
  },
  indicators: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  indicatorText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark,
    fontSize: 12
  },
  subtitleCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#f5faf8',
    borderWidth: 1,
    borderColor: colors.border
  },
  subtitleLabel: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark,
    fontSize: 12
  },
  subtitleValue: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  chatHistory: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  bubble: {
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1
  },
  bubbleAI: {
    backgroundColor: '#f3f7fb',
    borderColor: '#d9e4ef'
  },
  bubbleUser: {
    backgroundColor: '#e8f4f1',
    borderColor: '#c6e2da'
  },
  bubbleRole: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.primaryDark,
    marginBottom: 2
  },
  bubbleText: {
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  button: {
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15
  },
  warn: {
    marginTop: spacing.sm,
    fontFamily: 'Inter_400Regular',
    color: colors.danger,
    fontSize: 12
  }
});