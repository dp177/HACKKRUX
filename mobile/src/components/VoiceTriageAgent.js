import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { triageChatNext, triageTranscribeAudio } from '../api';
import { colors, radii, spacing } from '../theme/tokens';

const TRIAGE_COMPLETE_TOKEN = '[TRIAGE_COMPLETE]';

function getMimeTypeFromUri(uri) {
  const normalized = String(uri || '').toLowerCase();
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.webm')) return 'audio/webm';
  if (normalized.endsWith('.ogg') || normalized.endsWith('.opus')) return 'audio/ogg';
  if (normalized.endsWith('.3gp') || normalized.endsWith('.amr')) return 'audio/3gpp';
  if (normalized.endsWith('.m4a') || normalized.endsWith('.mp4')) return 'audio/mp4';
  return 'application/octet-stream';
}

export default function VoiceTriageAgent({ onComplete, onError, onFallbackToText, token }) {
  const [conversation, setConversation] = useState([]);
  const [subtitle, setSubtitle] = useState('Tap Start to begin voice triage.');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState('native');
  const [recording, setRecording] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [awaitingExpoGoAnswer, setAwaitingExpoGoAnswer] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const voiceRef = useRef(null);
  const ttsRef = useRef(null);
  const recordingRef = useRef(null);
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
    let mounted = true;
    logEvent('setup_start');

    async function setupVoiceModules() {
      try {
        if (Constants.appOwnership === 'expo') {
          logEvent('expo_go_detected');
          setRuntimeMode('expo-go');
          setVoiceReady(true);
          setSubtitle('Voice input active in Expo Go. Tap Start Voice Triage, then record your answer.');
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
            logEvent('tts_init_unavailable', {
              message: ttsInitError?.message || 'unknown error'
            });
          }
        }

        Voice.onSpeechResults = handleNativeSpeechResults;
        Voice.onSpeechError = handleNativeSpeechError;

        if (ttsEnabledRef.current && typeof Tts?.addEventListener === 'function') {
          ttsFinishSubscriptionRef.current = Tts.addEventListener('tts-finish', () => {
            logEvent('tts_finish', {
              resumeListening: shouldResumeListeningRef.current
            });
            setSpeaking(false);
            if (shouldResumeListeningRef.current) {
              shouldResumeListeningRef.current = false;
              startListening();
            }
          });
        }

        logEvent('modules_ready', {
          hasVoiceStart: Boolean(Voice?.start),
          hasTtsSpeak: Boolean(Tts?.speak),
          ttsEnabled: ttsEnabledRef.current
        });

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
      await recordingRef.current?.stopAndUnloadAsync?.();
    } catch {
      // ignore cleanup errors
    } finally {
      recordingRef.current = null;
      setRecording(false);
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
      logEvent('speak_start', { textLength: String(text || '').length });

      try {
        await Tts.stop?.();
      } catch (stopError) {
        logEvent('speak_stop_error', {
          message: stopError?.message || 'unknown error'
        });
      }

      Tts.speak(text, { rate: 0.48, pitch: 1.0 });
      return true;
    } catch (error) {
      logEvent('speak_error', {
        message: error?.message || 'unknown error'
      });

      ttsEnabledRef.current = false;
      setSpeaking(false);
      setSubtitle(`AI: ${text}`);
      return false;
    }
  }

  async function startListening() {
    if (runtimeMode === 'expo-go') return;

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
      logEvent('ask_next_start', { historyLength: Array.isArray(history) ? history.length : 0 });

      const data = await triageChatNext(history);
      const nextQuestion = Array.isArray(data?.questions) ? data.questions[0] : null;

      logEvent('ask_next_response', {
        questionCount: Array.isArray(data?.questions) ? data.questions.length : 0,
        nextQuestionPreview: typeof nextQuestion === 'string' ? nextQuestion.slice(0, 120) : null
      });

      if (!nextQuestion) {
        onError?.('No follow-up question returned by triage AI');
        return;
      }

      if (nextQuestion === TRIAGE_COMPLETE_TOKEN) {
        logEvent('triage_complete_token', { historyLength: Array.isArray(history) ? history.length : 0 });
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
        setSubtitle('Tap Start Recording and answer by voice.');
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

  async function handleNativeSpeechResults(event) {
    const spoken = Array.isArray(event?.value) ? event.value[0] : '';
    const userText = String(spoken || '').trim();

    logEvent('speech_result', {
      alternatives: Array.isArray(event?.value) ? event.value.length : 0,
      transcriptPreview: userText.slice(0, 120)
    });

    setListening(false);

    if (!userText) {
      shouldResumeListeningRef.current = false;
      logEvent('empty_speech_retry');
      setTimeout(startListening, 600);
      return;
    }

    setSubtitle(`You: ${userText}`);
    const updatedHistory = [...conversation, { role: 'user', content: userText }];
    setConversation(updatedHistory);
    await askNextQuestion(updatedHistory);
  }

  function handleNativeSpeechError(event) {
    setListening(false);
    const message = event?.error?.message || 'Voice recognition error';

    logEvent('speech_error', {
      message,
      raw: event?.error || null
    });

    onError?.(message);
  }

  async function handleStartVoiceFlow() {
    logEvent('start_requested', {
      voiceReady,
      busy,
      awaitingExpoGoAnswer
    });

    if (!voiceReady || busy || (runtimeMode === 'expo-go' && awaitingExpoGoAnswer)) {
      logEvent('start_ignored');
      return;
    }

    const seedHistory = [];
    setConversation(seedHistory);
    setLastTranscript('');
    setManualAnswer('');
    setShowManualInput(false);
    setAwaitingExpoGoAnswer(false);
    await askNextQuestion(seedHistory);
  }

  async function submitManualExpoGoAnswer() {
    const userText = String(manualAnswer || '').trim();
    if (!userText || busy || runtimeMode !== 'expo-go' || !awaitingExpoGoAnswer) {
      return;
    }

    try {
      setBusy(true);
      setSubtitle(`You: ${userText}`);
      setLastTranscript(userText);
      setManualAnswer('');
      setShowManualInput(false);

      const updatedHistory = [...conversation, { role: 'user', content: userText }];
      setConversation(updatedHistory);
      setAwaitingExpoGoAnswer(false);

      logEvent('expo_go_manual_answer_submit', {
        answerLength: userText.length,
        historyLength: updatedHistory.length
      });

      await askNextQuestion(updatedHistory);
    } finally {
      setBusy(false);
    }
  }

  async function startExpoGoRecording() {
    if (busy || !voiceReady || runtimeMode !== 'expo-go' || !awaitingExpoGoAnswer) {
      logEvent('expo_go_record_start_ignored', { busy, voiceReady, awaitingExpoGoAnswer });
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      logEvent('expo_go_permission_result', {
        granted: Boolean(permission?.granted),
        status: permission?.status || null,
        canAskAgain: permission?.canAskAgain ?? null
      });

      if (!permission?.granted) {
        onError?.('Microphone permission is required for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false
      });

      const rec = new Audio.Recording();
      // LOW_QUALITY is more broadly compatible with cloud STT providers than high-quality AAC/m4a.
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
      await rec.startAsync();

      recordingRef.current = rec;
      setRecording(true);
      setListening(true);
      setSubtitle('Listening... speak now, then tap Stop Recording.');

      logEvent('expo_go_recording_start');
    } catch (error) {
      logEvent('expo_go_recording_error', {
        message: error?.message || 'unknown error'
      });
      onError?.(error?.message || 'Could not start recording');
      setRecording(false);
      setListening(false);
    }
  }

  async function stopExpoGoRecordingAndTranscribe() {
    if (runtimeMode !== 'expo-go') return;
    if (!recordingRef.current) {
      logEvent('expo_go_record_stop_ignored_no_recording');
      return;
    }

    try {
      setBusy(true);
      setRecording(false);
      setListening(false);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        logEvent('expo_go_transcribe_missing_uri');
        onError?.('Recording failed. Please try again.');
        return;
      }

      const mimeType = getMimeTypeFromUri(uri);
      logEvent('expo_go_recording_file_ready', {
        mimeType,
        uriPreview: String(uri).slice(0, 120)
      });

      const data = await triageTranscribeAudio({ fileUri: uri, token, mimeType });
      const transcript = String(data?.transcript || '').trim();
      setLastTranscript(transcript);

      if (!transcript) {
        logEvent('expo_go_transcribe_empty_result');
        onError?.('Could not detect speech. Please record again.');
        setAwaitingExpoGoAnswer(true);
        return;
      }

      setSubtitle(`You: ${transcript}`);
      const updatedHistory = [...conversation, { role: 'user', content: transcript }];
      setConversation(updatedHistory);
      setAwaitingExpoGoAnswer(false);
      setShowManualInput(false);
      setManualAnswer('');

      logEvent('expo_go_transcribe_success', {
        transcriptPreview: transcript.slice(0, 120),
        historyLength: updatedHistory.length
      });

      await askNextQuestion(updatedHistory);
    } catch (error) {
      logEvent('expo_go_transcribe_error', {
        message: error?.message || 'unknown error'
      });
      onError?.('Transcription is unavailable right now. You can still continue by typing your answer below.');
      setAwaitingExpoGoAnswer(true);
      setShowManualInput(true);
      setSubtitle('Transcription unavailable. Type your answer below to continue.');
    } finally {
      setBusy(false);
      logEvent('expo_go_recording_stop');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Voice Triage</Text>
      <Text style={styles.subtitle}>
        {runtimeMode === 'expo-go'
          ? 'Expo Go mode: Start triage, then record each answer and transcribe.'
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
            style={[styles.button, recording ? styles.stopButton : styles.recordButton, (!voiceReady || busy || !awaitingExpoGoAnswer) && styles.buttonDisabled]}
            onPress={recording ? stopExpoGoRecordingAndTranscribe : startExpoGoRecording}
            disabled={!voiceReady || busy || !awaitingExpoGoAnswer}
          >
            <Text style={styles.buttonText}>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
          </TouchableOpacity>

          {lastTranscript ? (
            <Text style={styles.transcriptText}>Last transcript: {lastTranscript}</Text>
          ) : null}

          {showManualInput ? (
            <View style={styles.manualInputWrap}>
              <Text style={styles.manualInputLabel}>Type your answer</Text>
              <TextInput
                style={styles.manualInput}
                value={manualAnswer}
                onChangeText={setManualAnswer}
                placeholder="Describe your symptoms"
                multiline
                editable={!busy}
              />
              <TouchableOpacity
                style={[styles.button, styles.manualSubmitButton, (!manualAnswer.trim() || busy || !awaitingExpoGoAnswer) && styles.buttonDisabled]}
                onPress={submitManualExpoGoAnswer}
                disabled={!manualAnswer.trim() || busy || !awaitingExpoGoAnswer}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Typed Answer</Text>}
              </TouchableOpacity>
            </View>
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
  manualInputWrap: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: '#fafafa'
  },
  manualInputLabel: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark,
    fontSize: 12,
    marginBottom: 6
  },
  manualInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
    backgroundColor: '#fff'
  },
  manualSubmitButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primaryDark
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
