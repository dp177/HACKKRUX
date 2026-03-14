import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { triageChatNext } from '../api';
import { colors, radii, spacing } from '../theme/tokens';

const TRIAGE_COMPLETE_TOKEN = '[TRIAGE_COMPLETE]';

export default function VoiceTriageAgent({ onComplete, onError, onFallbackToText }) {
  const [conversation, setConversation] = useState([]);
  const [subtitle, setSubtitle] = useState('Tap Start to begin voice triage.');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);

  const voiceRef = useRef(null);
  const ttsRef = useRef(null);
  const ttsFinishSubscriptionRef = useRef(null);
  const shouldResumeListeningRef = useRef(false);
  const ttsEnabledRef = useRef(true);
  const sessionIdRef = useRef(`voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  useEffect(() => {
    let mounted = true;
    console.log('[VoiceTriage] setup_start', { sessionId: sessionIdRef.current });

    async function setupVoiceModules() {
      try {
        if (Constants.appOwnership === 'expo') {
          console.log('[VoiceTriage] expo_go_detected', { sessionId: sessionIdRef.current });
          setVoiceReady(false);
          onError?.('Voice input is not supported in Expo Go. Switch to Text Input or run a development build.');
          onFallbackToText?.();
          return;
        }

        const VoiceModule = await import('@react-native-voice/voice');
        const TtsModule = await import('react-native-tts');

        if (!mounted) return;

        const Voice = VoiceModule.default || VoiceModule;
        const Tts = TtsModule.default || TtsModule;

        voiceRef.current = Voice;
        ttsRef.current = Tts;

        if (typeof Tts?.getInitStatus === 'function') {
          try {
            await Tts.getInitStatus();
            ttsEnabledRef.current = true;
          } catch (ttsInitError) {
            ttsEnabledRef.current = false;
            console.log('[VoiceTriage] tts_init_unavailable', {
              sessionId: sessionIdRef.current,
              message: ttsInitError?.message || 'unknown error'
            });
          }
        }

        Voice.onSpeechResults = handleSpeechResults;
        Voice.onSpeechError = handleSpeechError;

        console.log('[VoiceTriage] modules_ready', {
          sessionId: sessionIdRef.current,
          hasVoiceStart: Boolean(Voice?.start),
          hasTtsSpeak: Boolean(Tts?.speak),
          ttsEnabled: ttsEnabledRef.current
        });

        if (ttsEnabledRef.current && typeof Tts?.addEventListener === 'function') {
          ttsFinishSubscriptionRef.current = Tts.addEventListener('tts-finish', () => {
            console.log('[VoiceTriage] tts_finish', {
              sessionId: sessionIdRef.current,
              resumeListening: shouldResumeListeningRef.current
            });
            setSpeaking(false);
            if (shouldResumeListeningRef.current) {
              shouldResumeListeningRef.current = false;
              startListening();
            }
          });
        }

        setVoiceReady(true);
      } catch (error) {
        console.log('[VoiceTriage] setup_error', {
          sessionId: sessionIdRef.current,
          message: error?.message || 'unknown error'
        });
        setVoiceReady(false);
        onError?.('Voice mode requires a development build with @react-native-voice/voice and react-native-tts installed.');
        onFallbackToText?.();
      }
    }

    setupVoiceModules();

    return () => {
      mounted = false;
      console.log('[VoiceTriage] cleanup_start', { sessionId: sessionIdRef.current });
      cleanupVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cleanupVoice() {
    const Voice = voiceRef.current;
    const Tts = ttsRef.current;
    shouldResumeListeningRef.current = false;

    try {
      ttsFinishSubscriptionRef.current?.remove?.();
      ttsFinishSubscriptionRef.current = null;
    } catch {
      // ignore cleanup errors
    }

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

    console.log('[VoiceTriage] cleanup_done', { sessionId: sessionIdRef.current });
  }

  async function speak(text) {
    const Tts = ttsRef.current;
    if (!Tts?.speak || !ttsEnabledRef.current) {
      setSubtitle(`AI: ${text}`);
      return false;
    }

    try {
      setSpeaking(true);
      setSubtitle(`AI: ${text}`);
      console.log('[VoiceTriage] speak_start', {
        sessionId: sessionIdRef.current,
        textLength: String(text || '').length
      });

      try {
        await Tts.stop?.();
      } catch (stopError) {
        console.log('[VoiceTriage] speak_stop_error', {
          sessionId: sessionIdRef.current,
          message: stopError?.message || 'unknown error'
        });
      }

      Tts.speak(text, { rate: 0.48, pitch: 1.0 });
      return true;
    } catch (error) {
      console.log('[VoiceTriage] speak_error', {
        sessionId: sessionIdRef.current,
        message: error?.message || 'unknown error'
      });

      // Disable TTS for current session and continue voice capture without spoken prompts.
      ttsEnabledRef.current = false;
      setSpeaking(false);
      setSubtitle(`AI: ${text}`);
      return false;
    }
  }

  async function startListening() {
    const Voice = voiceRef.current;
    if (!Voice?.start) return;

    try {
      setListening(true);
      console.log('[VoiceTriage] listening_start', { sessionId: sessionIdRef.current });
      await Voice.start('en-US');
    } catch (error) {
      console.log('[VoiceTriage] listening_error', {
        sessionId: sessionIdRef.current,
        message: error?.message || 'unknown error'
      });

      // If native bridge is missing, auto-fallback to text mode.
      if ((error?.message || '').toLowerCase().includes('startspeech')) {
        setVoiceReady(false);
        onFallbackToText?.();
      }

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
      console.log('[VoiceTriage] listening_stop', { sessionId: sessionIdRef.current });
      setListening(false);
    }
  }

  async function askNextQuestion(history) {
    try {
      setBusy(true);
      console.log('[VoiceTriage] ask_next_start', {
        sessionId: sessionIdRef.current,
        historyLength: Array.isArray(history) ? history.length : 0
      });
      const data = await triageChatNext(history);
      const nextQuestion = Array.isArray(data?.questions) ? data.questions[0] : null;

      console.log('[VoiceTriage] ask_next_response', {
        sessionId: sessionIdRef.current,
        questionCount: Array.isArray(data?.questions) ? data.questions.length : 0,
        nextQuestionPreview: typeof nextQuestion === 'string' ? nextQuestion.slice(0, 120) : null
      });

      if (!nextQuestion) {
        onError?.('No follow-up question returned by triage AI');
        return;
      }

      if (nextQuestion === TRIAGE_COMPLETE_TOKEN) {
        console.log('[VoiceTriage] triage_complete_token', {
          sessionId: sessionIdRef.current,
          historyLength: Array.isArray(history) ? history.length : 0
        });
        await stopListening();
        await speak('Thank you. I have all the information I need. Calculating your priority now.');
        onComplete?.(history);
        return;
      }

      const withAssistant = [...history, { role: 'assistant', content: nextQuestion }];
      setConversation(withAssistant);
      shouldResumeListeningRef.current = true;
      const spoke = await speak(nextQuestion);

      if (!spoke && shouldResumeListeningRef.current) {
        shouldResumeListeningRef.current = false;
        setSpeaking(false);
        startListening();
      }
    } catch (error) {
      shouldResumeListeningRef.current = false;
      console.log('[VoiceTriage] ask_next_error', {
        sessionId: sessionIdRef.current,
        message: error?.message || 'unknown error'
      });
      onError?.(error?.message || 'Voice triage failed while fetching next question');
    } finally {
      setBusy(false);
    }
  }

  async function handleSpeechResults(event) {
    const spoken = Array.isArray(event?.value) ? event.value[0] : '';
    const userText = String(spoken || '').trim();
    console.log('[VoiceTriage] speech_result', {
      sessionId: sessionIdRef.current,
      alternatives: Array.isArray(event?.value) ? event.value.length : 0,
      transcriptPreview: userText.slice(0, 120)
    });
    setListening(false);

    if (!userText) {
      shouldResumeListeningRef.current = false;
      console.log('[VoiceTriage] empty_speech_retry', { sessionId: sessionIdRef.current });
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
    console.log('[VoiceTriage] speech_error', {
      sessionId: sessionIdRef.current,
      message,
      raw: event?.error || null
    });
    onError?.(message);
  }

  async function handleStartVoiceFlow() {
    console.log('[VoiceTriage] start_requested', {
      sessionId: sessionIdRef.current,
      voiceReady,
      busy
    });
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
      {!voiceReady ? (
        <TouchableOpacity style={[styles.button, styles.textFallbackButton]} onPress={() => onFallbackToText?.()}>
          <Text style={styles.buttonText}>Switch To Text Input</Text>
        </TouchableOpacity>
      ) : null}
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
  textFallbackButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primaryDark
  },
  warn: {
    marginTop: spacing.sm,
    fontFamily: 'Inter_400Regular',
    color: colors.danger,
    fontSize: 12
  }
});