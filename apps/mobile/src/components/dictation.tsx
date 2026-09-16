import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Body } from '@/components/ui';

/**
 * Dictation.
 *
 * Transcription runs on the device — `requiresOnDeviceRecognition` — so the
 * audio of a private conversation about a client does not travel to a speech
 * service. The text lands in the field, where it can be corrected before
 * anything is saved.
 *
 * Speech recognition is a native module, and not every way of running this app
 * has it: Expo Go does not bundle it, and there is none in a browser. Loading
 * it therefore has to be allowed to fail — a missing recogniser is a button
 * that is not offered, not a screen that will not open.
 */

type SpeechModule = typeof import('expo-speech-recognition');

const speech: SpeechModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition') as SpeechModule;
  } catch {
    return null;
  }
})();

export function DictateButton(props: { onText: (text: string) => void; label?: string }) {
  // The hooks live in the component below, which only renders when the module
  // is there — so nothing conditionally calls a hook.
  if (!speech) return <DictationUnavailable />;
  return <DictationControl {...props} />;
}

function DictationUnavailable() {
  const theme = useTheme();
  return (
    <Body subtle size="sm" style={{ marginTop: theme.spacing.xs }}>
      Dictation needs a development build; it is not available in Expo Go. Type the note instead.
    </Body>
  );
}

function DictationControl({
  onText,
  label = 'Dictate',
}: {
  onText: (text: string) => void;
  label?: string;
}) {
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech!;
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
    try {
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
    } catch {
      // The module loaded but this device has no on-device recogniser.
      setListening(false);
      setProblem('This device cannot dictate. Type the note instead.');
    }
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
