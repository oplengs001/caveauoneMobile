import { IconSymbol } from '@/components/ui/icon-symbol';
import { printLabels } from '@/utils/printLabels';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ReviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const router = useRouter();

  // Mock extracted data
  const [wineName, setWineName] = useState('Sassicaia 2018');
  const [quantity, setQuantity] = useState(12);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleIncrease = () => setQuantity(prev => prev + 1);
  const handleDecrease = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const handleConfirmAndPrint = async () => {
    setIsPrinting(true);
    try {
      const today = new Date();
      const dateStr = `${today.getMonth() + 1}${today.getDate()}${today.getFullYear().toString().slice(2)}`;

      await printLabels(wineName, quantity, dateStr);

      Alert.alert(
        'Success',
        'Labels sent to printer successfully.',
        [
          { text: 'Return to Dashboard', onPress: () => router.replace('/(tabs)/home') }
        ]
      );
    } catch (error) {
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

          <View style={styles.dataRow}>
            <Text style={styles.label}>WINE</Text>
            <Text style={styles.value}>{wineName}</Text>
          </View>

          <View style={styles.quantitySection}>
            <Text style={styles.label}>QUANTITY</Text>
            <View style={styles.stepperContainer}>
              <TouchableOpacity style={styles.stepperButton} onPress={handleDecrease}>
                <IconSymbol name="minus" size={32} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.quantityValue}>{quantity}</Text>

              <TouchableOpacity style={styles.stepperButton} onPress={handleIncrease}>
                <IconSymbol name="plus" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, isPrinting && styles.confirmButtonDisabled]}
          onPress={handleConfirmAndPrint}
          disabled={isPrinting}
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
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 32,
    borderWidth: 2,
    borderColor: '#374151',
    position: 'relative',
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    alignItems: 'center',
  },
  imageOverlayText: {
    color: '#10b981',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 12,
  },
  extractionCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cardHeader: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 24,
    textAlign: 'center',
  },
  dataRow: {
    marginBottom: 32,
  },
  label: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  value: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  quantitySection: {
    marginTop: 8,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 8,
    marginTop: 8,
  },
  stepperButton: {
    backgroundColor: '#374151',
    width: 64,
    height: 64,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityValue: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
  },
  footer: {
    padding: 24,
    paddingBottom: 36, // Extra padding for safe area / home indicator
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  confirmButton: {
    backgroundColor: '#10b981', // High contrast green
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
