import { IconSymbol } from '@/components/ui/icon-symbol';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Warehouse Operations</Text>
          <Text style={styles.subtitle}>Select a task to begin</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#3b82f6' }]}
            onPress={() => router.push('/intake/scan')}
          >
            <View style={styles.buttonContent}>
              <IconSymbol name="tray.and.arrow.down.fill" size={48} color="#ffffff" />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Receive Delivery</Text>
                <Text style={styles.buttonDesc}>Scan supplier receipts and intake wine</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#10b981' }]}
            onPress={() => router.push('/tagging')}
          >
            <View style={styles.buttonContent}>
              <IconSymbol name="location.fill" size={48} color="#ffffff" />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Location Tagging</Text>
                <Text style={styles.buttonDesc}>Update bottle storage locations</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
            onPress={() => router.push('/pullout')}
          >
            <View style={styles.buttonContent}>
              <IconSymbol name="tray.and.arrow.up.fill" size={48} color="#ffffff" />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Pullout Requests</Text>
                <Text style={styles.buttonDesc}>Prepare wines for outbound delivery</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#8b5cf6' }]}
            onPress={() => router.push('/inventory')}
          >
            <View style={styles.buttonContent}>
              <IconSymbol name="list.bullet.rectangle.portrait.fill" size={48} color="#ffffff" />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Inventory Lookup</Text>
                <Text style={styles.buttonDesc}>View and search for bottles in the warehouse</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  },
  header: {
    marginTop: 24,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#9ca3af',
  },
  buttonContainer: {
    gap: 24,
  },
  actionButton: {
    borderRadius: 16,
    padding: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  buttonDesc: {
    fontSize: 14,
    color: '#e5e7eb',
    fontWeight: '500',
  },
});
