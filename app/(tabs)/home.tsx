import { 
  PackageSearch, 
  MapPin, 
  Truck, 
  Search,
  PackageOpen,
  Wine
} from 'lucide-react-native';
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
          <View style={styles.logoContainer}>
            <View style={styles.logoBadge}>
              <Wine size={24} color="#ffffff" strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>CaveauOne</Text>
          </View>
          <Text style={styles.subtitle}>Warehouse Management System</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#4f46e5' }]}
            onPress={() => router.push('/intake/scan')}
          >
            <View style={styles.buttonContent}>
              <PackageSearch size={48} color="#ffffff" strokeWidth={2} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Receive Delivery</Text>
                <Text style={styles.buttonDesc}>Scan and intake new arrivals</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#10b981' }]}
            onPress={() => router.push('/tagging')}
          >
            <View style={styles.buttonContent}>
              <MapPin size={48} color="#ffffff" strokeWidth={2} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Location Tagging</Text>
                <Text style={styles.buttonDesc}>Assign bottles to bin locations</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
            onPress={() => router.push('/pullout')}
          >
            <View style={styles.buttonContent}>
              <Truck size={48} color="#ffffff" strokeWidth={2} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Pullout Tasks</Text>
                <Text style={styles.buttonDesc}>Fulfill outbound requests</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#6366f1' }]}
            onPress={() => router.push('/inventory')}
          >
            <View style={styles.buttonContent}>
              <Search size={48} color="#ffffff" strokeWidth={2} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Inventory Search</Text>
                <Text style={styles.buttonDesc}>Search by SKU or Wine Name</Text>
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
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    marginTop: 40,
    marginBottom: 48,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  logoBadge: {
    width: 40,
    height: 40,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  buttonContainer: {
    gap: 20,
  },
  actionButton: {
    borderRadius: 24,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
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
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  buttonDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
});
