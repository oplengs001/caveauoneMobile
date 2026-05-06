import { IconSymbol } from '@/components/ui/icon-symbol';
import { printLabels } from '@/utils/printLabels';
// 1. UPDATED: Import from 'expo-file-system/legacy'
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const NEXT_JS_API_URL = 'http://192.168.1.16:3000';

interface ExtractedWine {
  id: string;
  wineName: string;
  quantity: number;
}

export default function ReviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const router = useRouter();

  const [wines, setWines] = useState<ExtractedWine[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(true);

  useEffect(() => {
    if (imageUri) {
      analyzeReceipt(imageUri);
    }
  }, [imageUri]);

  const analyzeReceipt = async (uri: string) => {
    try {
      setIsAnalyzing(true);

      // 2. FIXED: This now works correctly using the legacy import
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(`${NEXT_JS_API_URL}/api/analyze-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: base64 }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Request Failed: ${errorText}`);
      }

      const data = await response.json();
      console.log(data, "Data")
      if (Array.isArray(data)) {
        setWines(data.map((item: any, index: number) => ({
          id: `${Date.now()}-${index}`,
          wineName: item.wineName || 'Unknown Wine',
          quantity: item.quantity || 1,
        })));
      } else {
        setWines([{
          id: `${Date.now()}-0`,
          wineName: data.wineName || 'Unknown Wine',
          quantity: data.quantity || 1,
        }]);
      }

    } catch (error) {
      console.error('Analysis Error:', error);
      Alert.alert('Extraction Failed', 'Could not read the receipt. Please enter manually.');
      setWines([{
        id: 'manual-0',
        wineName: 'Manual Entry Required',
        quantity: 1,
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setWines(prev => prev.map(wine =>
      wine.id === id ? { ...wine, quantity: Math.max(1, wine.quantity + delta) } : wine
    ));
  };

  const handleRemoveWine = (id: string) => {
    setWines(prev => prev.filter(wine => wine.id !== id));
  };

  const handleConfirmAndPrint = async () => {
    if (wines.length === 0) return;

    setIsPrinting(true);
    try {
      const today = new Date();
      const dateStr = `${today.getMonth() + 1}${today.getDate()}${today.getFullYear().toString().slice(2)}`;

      for (const wine of wines) {
        await printLabels(wine.wineName, wine.quantity, dateStr);
      }

      Alert.alert(
        'Success',
        `${wines.length} label(s) sent to printer successfully.`,
        [{ text: 'Return to Dashboard', onPress: () => router.replace('/(tabs)/home') }]
      );
    } catch (error) {
      console.error('Print Error:', error);
      Alert.alert('Printing Failed', 'There was an issue generating the labels.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {imageUri && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUri }} style={styles.receiptImage} resizeMode="cover" />
            <View style={styles.imageOverlay}>
              <Text style={styles.imageOverlayText}>RECEIPT CAPTURED</Text>
            </View>
          </View>
        )}

        <View style={styles.extractionCard}>
          <Text style={styles.cardHeader}>AI Extraction Result</Text>

          {isAnalyzing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.loadingText}>Reading receipt...</Text>
            </View>
          ) : (
            wines.map((wine, index) => (
              <View key={wine.id} style={[styles.wineItem, index > 0 && styles.wineItemBorder]}>
                <View style={styles.wineHeader}>
                  <Text style={styles.label}>WINE {wines.length > 1 ? index + 1 : ''}</Text>
                  {wines.length > 1 && (
                    <TouchableOpacity onPress={() => handleRemoveWine(wine.id)}>
                      <IconSymbol name="trash.fill" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.value}>{wine.wineName}</Text>

                <View style={styles.quantitySection}>
                  <Text style={styles.label}>QUANTITY</Text>
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => handleUpdateQuantity(wine.id, -1)}
                    >
                      <IconSymbol name="minus" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.quantityValue}>{wine.quantity}</Text>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => handleUpdateQuantity(wine.id, 1)}
                    >
                      <IconSymbol name="plus" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, (isPrinting || isAnalyzing) && styles.confirmButtonDisabled]}
          onPress={handleConfirmAndPrint}
          disabled={isPrinting || isAnalyzing}
        >
          <IconSymbol name="printer.fill" size={28} color="#fff" />
          <Text style={styles.confirmButtonText}>
            {isPrinting ? 'PRINTING...' : 'CONFIRM & PRINT LABELS'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollContent: { padding: 24, paddingBottom: 40 },
  imageContainer: { width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', marginBottom: 32, borderWidth: 2, borderColor: '#374151', position: 'relative' },
  receiptImage: { width: '100%', height: '100%' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', padding: 8, alignItems: 'center' },
  imageOverlayText: { color: '#10b981', fontWeight: '800', letterSpacing: 1, fontSize: 12 },
  extractionCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#374151' },
  cardHeader: { color: '#9ca3af', fontSize: 14, fontWeight: '800', letterSpacing: 1, marginBottom: 24, textAlign: 'center' },
  wineItem: { marginBottom: 24 },
  wineItemBorder: { borderTopWidth: 1, borderTopColor: '#374151', paddingTop: 24 },
  wineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#9ca3af', fontSize: 14, fontWeight: '700', marginBottom: 8, letterSpacing: 1 },
  value: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 20 },
  quantitySection: { marginTop: 0 },
  stepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111827', borderRadius: 12, padding: 8 },
  stepperButton: { backgroundColor: '#374151', width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  quantityValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  loadingContainer: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: '#9ca3af', marginTop: 12, fontSize: 16 },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#1f2937', backgroundColor: '#111827' },
  confirmButton: { backgroundColor: '#10b981', flexDirection: 'row', height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 12 },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  emptyText: { color: '#9ca3af', textAlign: 'center', marginTop: 20 }
});
