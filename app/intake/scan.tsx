import { IconSymbol } from '@/components/ui/icon-symbol';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();

  if (!permission) {
    // Camera permissions are still loading.
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.permissionContainer}>
        <IconSymbol name="camera.fill" size={64} color="#9ca3af" />
        <Text style={styles.permissionText}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      // Navigate to review screen, passing the URI
      if (photo && photo.uri) {
        router.push({
          pathname: '/intake/review',
          params: { imageUri: photo.uri },
        });
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.header}>
            <Text style={styles.instructionText}>Snap a photo of the supplier receipt</Text>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.captureButtonOuter}
              onPress={handleCapture}
              disabled={isCapturing}
            >
              <View style={styles.captureButtonInner}>
                {isCapturing && <ActivityIndicator color="#000" size="large" />}
              </View>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 24,
  },
  permissionText: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 40,
    fontWeight: '600',
  },
  permissionButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
    alignItems: 'center',
    marginTop: 40,
  },
  instructionText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  footer: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  captureButtonOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 6,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
