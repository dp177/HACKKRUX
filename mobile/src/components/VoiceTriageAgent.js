import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
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
  const [runtimeMode, setRuntimeMode] = useState('native');
  const [lastTranscript, setLastTranscript] = useState('');
  const [awaitingExpoGoAnswer, setAwaitingExpoGoAnswer] = useState(false);

  const voiceRef = useRef(null);
  const ttsRef = useRef(null);
  const conversationRef = useRef([]);
  const busyRef = useRef(false);
  const awaitingExpoGoAnswerRef = useRef(false);
  const lastSubmittedTranscriptRef = useRef('');
  const ttsFinishSubscriptionRef = useRef(null);
  const shouldResumeListeningRef = useRef(false);
  const ttsEnabledRef = useRef(true);
  const sessionIdRef = useRef(`voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  function logEvent(event, extra = {}) {
    console.log('[VoiceTriage]', {
      event,
      sessionId: sessionIdRef.current,
      runtimeMode,
      ...extra
    });
  }

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    awaitingExpoGoAnswerRef.current = awaitingExpoGoAnswer;
  }, [awaitingExpoGoAnswer]);

  function extractTranscriptFromSpeechEvent(event) {
    if (!event) return '';

    if (typeof event.transcript === 'string' && event.transcript.trim()) {
      return event.transcript.trim();
    }

    const candidates = Array.isArray(event.results) ? event.results : [];
    for (const item of candidates) {
      if (item && typeof item.transcript === 'string' && item.transcript.trim()) {
        return item.transcript.trim();
      }

      if (Array.isArray(item) && item[0] && typeof item[0].transcript === 'string' && item[0].transcript.trim()) {
        return item[0].transcript.trim();
      }
    }

    return '';
  }

  function isFinalSpeechEvent(event) {
    if (!event) return true;
    if (typeof event.isFinal === 'boolean') return event.isFinal;

    const candidates = Array.isArray(event.results) ? event.results : [];
    if (!candidates.length) return true;

    return candidates.some((item) => {
      if (typeof item?.isFinal === 'boolean') return item.isFinal;
      if (Array.isArray(item) && typeof item[0]?.isFinal === 'boolean') return item[0].isFinal;
      return false;
    });
  }

  async function submitExpoGoTranscript(transcript) {
    const normalized = String(transcript || '').trim();
    if (!normalized) {
      logEvent('expo_go_submit_skipped_empty_transcript');
      return;
    }

    if (normalized === lastSubmittedTranscriptRef.current) {
      logEvent('expo_go_submit_skipped_duplicate_transcript', {
        transcriptPreview: normalized.slice(0, 80)
      });
      return;
    }

    lastSubmittedTranscriptRef.current = normalized;
    setSubtitle(`You: ${normalized}`);

    const updatedHistory = [...conversationRef.current, { role: 'user', content: normalized }];
    setConversation(updatedHistory);
    setAwaitingExpoGoAnswer(false);
    logEvent('expo_go_submit_transcript', {
      transcriptPreview: normalized.slice(0, 120),
      historyLength: updatedHistory.length
    });

    await askNextQuestion(updatedHistory);
  }

  useSpeechRecognitionEvent('start', () => {
    if (runtimeMode !== 'expo-go') return;
    setListening(true);
    console.log('[VoiceTriage] expo_go_listening_start', { sessionId: sessionIdRef.current });
  });

  useSpeechRecognitionEvent('end', () => {
    if (runtimeMode !== 'expo-go') return;
    setListening(false);
    console.log('[VoiceTriage] expo_go_listening_end', { sessionId: sessionIdRef.current });
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (runtimeMode !== 'expo-go') return;
    setListening(false);
    console.log('[VoiceTriage] expo_go_stt_error', {
      sessionId: sessionIdRef.current,
      code: event?.error || null,
      message: event?.message || null
    });
    onError?.(event?.message || 'Speech recognition failed. Please try again.');
  });

  useSpeechRecognitionEvent('result', async (event) => {
    if (runtimeMode !== 'expo-go') return;

    const transcript = extractTranscriptFromSpeechEvent(event);
    if (transcript) {
      setLastTranscript(transcript);
      setSubtitle(`You: ${transcript}`);
    }

    const finalResult = isFinalSpeechEvent(event);
    if (!finalResult || !transcript || !awaitingExpoGoAnswerRef.current || busyRef.current) {
      logEvent('expo_go_result_ignored', {
        finalResult,
        hasTranscript: Boolean(transcript),
        awaitingAnswer: awaitingExpoGoAnswerRef.current,
        busy: busyRef.current
      });
      return;
    }

    try {
      await submitExpoGoTranscript(transcript);
    } catch (error) {
      console.log('[VoiceTriage] expo_go_submit_error', {
        sessionId: sessionIdRef.current,
        message: error?.message || 'unknown error'
      });
      onError?.(error?.message || 'Could not process speech result');
    }
  });

  useEffect(() => {
    let mounted = true;
    logEvent('setup_start');

    async function setupVoiceModules() {
      try {
        if (Constants.appOwnership === 'expo') {
          logEvent('expo_go_detected');
          setRuntimeMode('expo-go');
          setVoiceReady(true);
          setSubtitle('Voice input active in Expo Go. Tap Record, speak, then stop to transcribe.');
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

        logEvent('modules_ready', {
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
        logEvent('setup_error', {
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
      logEvent('cleanup_start');
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

    try {
      if (runtimeMode === 'expo-go') {
        ExpoSpeechRecognitionModule.abort();
      }
    } catch {
      // ignore cleanup errors
    } finally {
      setListening(false);
    }

    logEvent('cleanup_done');
  }

  async function speak(text) {
    const Tts = ttsRef.current;
    if (runtimeMode === 'expo-go') {
      setSubtitle(`AI: ${text}`);
      try {
        Speech.speak(String(text || ''), { rate: 0.95, pitch: 1.0 });
      } catch {
        // Subtitle fallback is sufficient in Expo Go.
      }
      return false;
    }

    if (!Tts?.speak || !ttsEnabledRef.current) {
      setSubtitle(`AI: ${text}`);
      return false;
    }

    try {
      setSpeaking(true);
      setSubtitle(`AI: ${text}`);
      logEvent('speak_start', {
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
      logEvent('speak_error', {
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
    if (runtimeMode === 'expo-go') {
      return;
    }

    const Voice = voiceRef.current;
    if (!Voice?.start) return;

    try {
      setListening(true);
      logEvent('listening_start');
      await Voice.start('en-US');
    } catch (error) {
      logEvent('listening_error', {
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
    if (runtimeMode === 'expo-go') {
      setListening(false);
      return;
    }

    const Voice = voiceRef.current;
    if (!Voice?.stop) return;

    try {
      await Voice.stop();
    } catch {
      // ignore stop failures
    } finally {
      logEvent('listening_stop');
      setListening(false);
    }
  }

  async function askNextQuestion(history) {
    try {
      setBusy(true);
      logEvent('ask_next_start', {
        historyLength: Array.isArray(history) ? history.length : 0
      });
      const data = await triageChatNext(history);
      const nextQuestion = Array.isArray(data?.questions) ? data.questions[0] : null;

      logEvent('ask_next_response', {
        questionCount: Array.isArray(data?.questions) ? data.questions.length : 0,
        nextQuestionPreview: typeof nextQuestion === 'string' ? nextQuestion.slice(0, 120) : null
      });

      if (!nextQuestion) {
        logEvent('ask_next_missing_question');
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

      if (runtimeMode === 'expo-go') {
        setAwaitingExpoGoAnswer(true);
        setListening(false);
        setSpeaking(false);
        setSubtitle('Tap Start Listening and answer by voice.');
        return;
      }

      if (!spoke && shouldResumeListeningRef.current) {
        shouldResumeListeningRef.current = false;
        setSpeaking(false);
        startListening();
      }
    } catch (error) {
      shouldResumeListeningRef.current = false;
      logEvent('ask_next_error', {
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
    logEvent('start_requested', {
      voiceReady,
      busy
    });
    if (!voiceReady || busy) {
      logEvent('start_ignored', { voiceReady, busy });
      return;
    }
    const seedHistory = [];
    setConversation(seedHistory);
    setLastTranscript('');
    setAwaitingExpoGoAnswer(false);
    await askNextQuestion(seedHistory);
  }

  async function startExpoGoListening() {
    if (busy || !voiceReady || runtimeMode !== 'expo-go' || !awaitingExpoGoAnswer) {
      logEvent('expo_go_stt_start_ignored', {
        busy,
        voiceReady,
        awaitingExpoGoAnswer
      });
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      logEvent('expo_go_permission_result', {
        granted: Boolean(permission?.granted),
        status: permission?.status || null,
        canAskAgain: permission?.canAskAgain ?? null
      });
      if (!permission?.granted) {
        onError?.('Microphone permission is required for voice input.');
        return;
      }

      setSubtitle('Listening... speak now, then tap Stop Listening.');
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'web_search'
        }
      });

      logEvent('expo_go_stt_start_requested');
    } catch (error) {
      logEvent('expo_go_stt_start_error', {
        message: error?.message || 'unknown error'
      });
      onError?.(error?.message || 'Could not start listening');
      setListening(false);
    }
  }

  function stopExpoGoListening() {
    if (runtimeMode !== 'expo-go') return;
    try {
      ExpoSpeechRecognitionModule.stop();
      setListening(false);
      logEvent('expo_go_stt_stop_requested');
    } catch (error) {
      logEvent('expo_go_stt_stop_error', {
        message: error?.message || 'unknown error'
      });
      onError?.(error?.message || 'Could not stop listening');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Voice Triage</Text>
      <Text style={styles.subtitle}>
        {runtimeMode === 'expo-go'
          ? 'Expo Go mode: tap Record, speak, then tap Stop to transcribe.'
          : 'Answer by voice. Live subtitles will appear below.'}
      </Text>

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
        style={[styles.button, (!voiceReady || busy || (runtimeMode === 'expo-go' && awaitingExpoGoAnswer)) && styles.buttonDisabled]}
        onPress={handleStartVoiceFlow}
        disabled={!voiceReady || busy || (runtimeMode === 'expo-go' && awaitingExpoGoAnswer)}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start Voice Triage</Text>}
      </TouchableOpacity>

      {runtimeMode === 'expo-go' ? (
        <View style={styles.expoGoControls}>
          <TouchableOpacity
            style={[styles.button, listening ? styles.stopButton : styles.recordButton, (!voiceReady || busy || !awaitingExpoGoAnswer) && styles.buttonDisabled]}
            onPress={listening ? stopExpoGoListening : startExpoGoListening}
            disabled={!voiceReady || busy || !awaitingExpoGoAnswer}
          >
            <Text style={styles.buttonText}>{listening ? 'Stop Listening' : 'Start Listening'}</Text>
          </TouchableOpacity>

          {lastTranscript ? (
            <Text style={styles.transcriptText}>Last transcript: {lastTranscript}</Text>
          ) : null}
        </View>
      ) : null}

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
  expoGoControls: {
    marginTop: spacing.sm,
    gap: spacing.sm
  },
  recordButton: {
    backgroundColor: colors.primaryDark
  },
  stopButton: {
    backgroundColor: colors.danger
  },
  transcriptText: {
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    fontSize: 12,
    lineHeight: 18
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