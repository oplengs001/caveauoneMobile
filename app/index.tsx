import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken } from '@/lib/auth';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    getToken().then((token) => {
      if (token) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/login');
      }
    });
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
});
