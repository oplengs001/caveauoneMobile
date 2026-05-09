import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { MasterWine } from '@/types';
import { Stack, useRouter } from 'expo-router';
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import {
  ChevronLeft,
  Minus,
  Plus,
  Search,
  Send,
  Trash2,
  Wine,
  X
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function CreateWineRequest() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = Colors.store;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MasterWine[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Array<{ wine: MasterWine, qty: number }>>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchWines();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const searchWines = async () => {
    setSearching(true);
    try {
      const winesRef = collection(db, 'master_wines');
      const q = query(
        winesRef,
        where('name', '>=', searchQuery),
        where('name', '<=', searchQuery + '\uf8ff'),
        limit(10)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterWine));
      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  const addItem = (wine: MasterWine) => {
    const existing = selectedItems.find(i => i.wine.id === wine.id);
    if (existing) {
      updateQty(wine.id, 1);
    } else {
      setSelectedItems([...selectedItems, { wine, qty: 1 }]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const updateQty = (wineId: string, delta: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.wine.id === wineId) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const removeItem = (wineId: string) => {
    setSelectedItems(prev => prev.filter(i => i.wine.id !== wineId));
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) return;

    setSubmitting(true);
    try {
      const requestData = {
        storeId: profile?.id || 'anonymous',
        storeEmail: profile?.email || 'unknown',
        status: 'pending',
        items: selectedItems.map(item => ({
          masterWineId: item.wine.id,
          wineName: item.wine.name,
          vintage: item.wine.vintage,
          requestedQty: item.qty,
          pulledQty: 0
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'wine_requests'), requestData);

      Alert.alert(
        "Success",
        "Your wine request has been sent to the warehouse.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.primary }]}>New Request</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.searchSection}>
          <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Search size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search wine name..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {searching && (
            <ActivityIndicator style={{ marginTop: 12 }} color={theme.primary} />
          )}

          {searchResults.length > 0 && (
            <View style={[styles.resultsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {searchResults.map(wine => (
                <TouchableOpacity
                  key={wine.id}
                  style={styles.resultItem}
                  onPress={() => addItem(wine)}
                >
                  <Wine size={18} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultName, { color: theme.text }]}>{wine.name}</Text>
                    <Text style={[styles.resultVintage, { color: theme.textSecondary }]}>{wine.vintage} • {wine.producer}</Text>
                  </View>
                  <Plus size={20} color={theme.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <FlatList
          data={selectedItems}
          keyExtractor={item => item.wine.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: theme.text }]}>{item.wine.name}</Text>
                <Text style={[styles.itemVintage, { color: theme.textSecondary }]}>{item.wine.vintage} • {item.wine.producer}</Text>
              </View>

              <View style={styles.controls}>
                <View style={[styles.stepper, { borderColor: theme.border }]}>
                  <TouchableOpacity
                    onPress={() => updateQty(item.wine.id, -1)}
                    style={styles.stepBtn}
                  >
                    <Minus size={18} color={theme.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyText, { color: theme.text }]}>{item.qty}</Text>
                  <TouchableOpacity
                    onPress={() => updateQty(item.wine.id, 1)}
                    style={styles.stepBtn}
                  >
                    <Plus size={18} color={theme.primary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => removeItem(item.wine.id)}
                  style={styles.removeBtn}
                >
                  <Trash2 size={20} color={theme.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Wine size={64} color={theme.border} strokeWidth={1} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No wines selected for request.
              </Text>
            </View>
          }
        />

        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: theme.primary },
              (selectedItems.length === 0 || submitting) && { opacity: 0.5 }
            ]}
            disabled={selectedItems.length === 0 || submitting}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Send size={20} color="#fff" strokeWidth={2.5} />
                <Text style={styles.submitText}>SEND REQUEST</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  searchSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  resultsContainer: {
    position: 'absolute',
    top: 64,
    left: 24,
    right: 24,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    maxHeight: 300,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  resultName: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultVintage: {
    fontSize: 12,
  },
  listContent: {
    padding: 24,
    paddingTop: 0,
    paddingBottom: 100,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  itemVintage: {
    fontSize: 13,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    width: 30,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
  removeBtn: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    gap: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
  },
  submitButton: {
    height: 64,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
