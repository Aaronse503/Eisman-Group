import type { ExpoConfig } from 'expo/config';

/**
 * Eisman Holdings Command Center — mobile.
 *
 * The API base URL is the one setting that must change between a laptop, a
 * staging server and production, so it comes from the environment rather than
 * being compiled in. Everything else is the same build.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const config: ExpoConfig = {
  name: 'Eisman Command Center',
  slug: 'eisman-command-center',
  scheme: 'eisman',
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#06281a',
  },
  assetBundlePatterns: ['**/*'],

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.eismanholdings.commandcenter',
    buildNumber: '1',
    config: {
      // The development server is plain HTTP on a local network. Production
      // traffic stays over HTTPS: this exception is narrow and deliberate.
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSFaceIDUsageDescription:
        'Unlock the Command Center with Face ID so your business records stay private if your phone is left unattended.',
      NSCameraUsageDescription:
        'Photograph a document or receipt to file it against a client, partnership or investor.',
      NSPhotoLibraryUsageDescription:
        'Attach an existing photograph or scan to a record.',
      NSMicrophoneUsageDescription:
        'Dictate a note. The transcription happens on this device.',
      NSSpeechRecognitionUsageDescription:
        'Turn dictated notes into text on this device, so nothing is sent anywhere to be transcribed.',
    },
  },

  android: {
    package: 'com.eismanholdings.commandcenter',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#06281a',
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    // Deep links: eisman://… and https://<host>/… once the domain is verified.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'eisman' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  web: {
    bundler: 'metro',
    output: 'single',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        faceIDPermission:
          'Unlock the Command Center with Face ID so your business records stay private.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Photograph a document to file it against a record.',
        microphonePermission: 'Dictate a note.',
        recordAudioAndroid: true,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#0f5132',
      },
    ],
    'expo-speech-recognition',
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    apiUrl,
    eas: {
      // Filled in by `eas init`; without it a build has no project to attach to.
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
};

export default config;
