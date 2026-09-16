import * as React from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { ApiClientError } from '@eisman/api-client';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { Body, Button, Card, ErrorNote, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { CompanyPicker } from '@/components/company-picker';

/**
 * Add a document: photograph a page, or choose a file already on the phone.
 *
 * A photographed page is downscaled and compressed before it is sent, because
 * a 12-megapixel capture of a sheet of A4 is a slow upload and no more
 * readable. The server does the text extraction, and says honestly when a
 * scan has no text layer to read.
 */
export default function CreateDocumentScreen() {
  const theme = useTheme();
  const router = useRouter();
  const camera = React.useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = React.useState<'choose' | 'camera'>('choose');
  const [capture, setCapture] = React.useState<{ uri: string; name: string; mime: string } | null>(null);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const takePhoto = async () => {
    const photo = await camera.current?.takePictureAsync({ quality: 0.9 });
    if (!photo?.uri) return;
    const processed = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ resize: { width: 1800 } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
    );
    const filename = `Scan ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.jpg`;
    setCapture({ uri: processed.uri, name: filename, mime: 'image/jpeg' });
    setName((current) => current || filename);
    setMode('choose');
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'text/*',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setCapture({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType ?? 'application/octet-stream',
    });
    setName((current) => current || asset.name);
  };

  const upload = async () => {
    setError(null);
    if (!capture) {
      setError('Photograph a page or choose a file first.');
      return;
    }
    if (!companyId) {
      setError('Choose a company.');
      return;
    }

    const form = new FormData();
    form.append('companyId', companyId);
    form.append('name', name.trim() || capture.name);
    form.append('accessLevel', 'company');
    // React Native's FormData takes this shape for a file on disk.
    form.append('file', {
      uri: capture.uri,
      name: capture.name,
      type: capture.mime,
    } as unknown as Blob);

    setBusy(true);
    try {
      await api.uploadDocument(form);
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.isOffline
            ? 'No connection. An upload needs one — the file is still on your phone, so try again when you are back online.'
            : err.message
          : 'Could not upload that.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'camera') {
    if (!permission?.granted) {
      return (
        <Screen>
          <View style={{ gap: theme.spacing.md }}>
            <Body>The camera is needed to photograph a document.</Body>
            <Button label="Allow the camera" onPress={() => void requestPermission()} />
            <Button label="Back" variant="ghost" onPress={() => setMode('choose')} />
          </View>
        </Screen>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
        <Row justify="space-around" style={{ padding: theme.spacing.xl, backgroundColor: '#000' }}>
          <Pressable
            onPress={() => setMode('choose')}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
          >
            <Body style={{ color: '#fff' }}>Cancel</Body>
          </Pressable>
          <Pressable
            onPress={takePhoto}
            accessibilityRole="button"
            accessibilityLabel="Take the photograph"
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: '#fff',
              borderWidth: 4,
              borderColor: theme.colors.accent,
            }}
          />
          <View style={{ width: 60 }} />
        </Row>
      </View>
    );
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing.lg }}>
        {error ? <ErrorNote message={error} /> : null}

        {capture ? (
          <Card>
            <Row gap={theme.spacing.md}>
              {capture.mime.startsWith('image/') ? (
                <Image
                  source={{ uri: capture.uri }}
                  style={{ width: 56, height: 72, borderRadius: 6, backgroundColor: theme.colors.surfaceSunken }}
                  accessibilityLabel="The page you photographed"
                />
              ) : (
                <Ionicons name="document-outline" size={32} color={theme.colors.accent} />
              )}
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }} numberOfLines={2}>
                  {capture.name}
                </Body>
                <Body subtle size="sm">
                  {capture.mime}
                </Body>
              </View>
            </Row>
          </Card>
        ) : (
          <>
            <SectionTitle>Add a document</SectionTitle>
            <Button label="Photograph a page" icon="camera-outline" onPress={() => setMode('camera')} />
            <Button
              label="Choose a file"
              icon="folder-open-outline"
              variant="secondary"
              onPress={pickFile}
            />
          </>
        )}

        {capture ? (
          <>
            <CompanyPicker value={companyId} onChange={setCompanyId} permission="knowledge:write" />
            <Field label="Name" value={name} onChangeText={setName} />
            <Button label="Upload" onPress={upload} loading={busy} icon="cloud-upload-outline" />
            <Button
              label="Choose something else"
              variant="ghost"
              onPress={() => setCapture(null)}
            />
            <Body subtle size="sm">
              Text is pulled out on the server so the document can be searched. A photograph of a
              page has no text layer, so it is stored and labelled as such rather than pretending to
              be searchable.
            </Body>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
