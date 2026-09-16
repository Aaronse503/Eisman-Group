import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useTheme } from '@/theme';
import { Body } from '@/components/ui';

/**
 * Dictation.
 *
 * Transcription runs on the device — `requiresOnDeviceRecognition` — so the
 * audio of a private conversation about a client does not travel to a speech
 * service. The text lands in the field, where it can be corrected before
 * anything is saved.
 */
export function DictateButton({
  onText,
  label = 'Dictate',
}: {
  onText: (text: string) => void;
  label?: string;
}) {
  const theme = useTheme();
  const [listening, setListening] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript && event.isFinal) onText(transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setProblem(
      event.error === 'not-allowed'
        ? 'Dictation needs permission for the microphone and speech recognition.'
        : 'Dictation stopped. Try again, or type instead.',
    );
  });

  const toggle = async () => {
    setProblem(null);
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setProblem('Dictation needs permission for the microphone and speech recognition.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: false,
      continuous: false,
      // Keep the audio on the device.
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    });
  };

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Stop dictating' : label}
        accessibilityState={{ busy: listening }}
        style={({ pressed }) => ({
          minHeight: theme.minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: listening ? theme.colors.danger : theme.colors.border,
          backgroundColor: listening ? theme.colors.dangerBg : theme.colors.surface,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons
          name={listening ? 'stop-circle-outline' : 'mic-outline'}
          size={18}
          color={listening ? theme.colors.danger : theme.colors.accent}
        />
        <Body size="sm" style={{ fontWeight: '600' }}>
          {listening ? 'Listening — tap to stop' : label}
        </Body>
      </Pressable>
      {problem ? (
        <Body size="sm" style={{ color: theme.colors.danger }}>
          {problem}
        </Body>
      ) : null}
      <Body subtle size="sm">
        Transcribed on this device. No audio is sent anywhere.
      </Body>
    </View>
  );
}
