import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { MasterWine } from '@/types';
import { Stack, useRouter } from 'expo-router';
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import {
  ChevronLeft,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const { height } = Dimensions.get('window');

export default function CreateWineRequest() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = Colors.store;

  const [searchQuery, setSearchQuery] = useState('');
  const [masterWines, setMasterWines] = useState<(MasterWine & { stock: number })[]>([]);
  const [fetchingWines, setFetchingWines] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Array<{ wine: MasterWine & { stock: number }, qty: number }>>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchWines();
  }, []);

  const fetchWines = async () => {
    setFetchingWines(true);
    try {
      const [winesSnap, bottlesSnap] = await Promise.all([
        getDocs(collection(db, "master_wines")),
        getDocs(collection(db, "inventory_bottles")),
      ]);

      const bottlesData = bottlesSnap.docs.map((d) => d.data());

      const winesWithStock = winesSnap.docs.map((doc) => {
        const wine = { id: doc.id, ...doc.data() } as MasterWine;
        const stock = bottlesData.filter(
          (b) =>
            b.masterWineRef.id === doc.id &&
            (b.status === "received" || b.status === "shelved"),
        ).length;

        return { ...wine, stock };
      });

      setMasterWines(winesWithStock);
    } catch (error) {
      console.error("Error fetching wines:", error);
    } finally {
      setFetchingWines(false);
    }
  };

  const filteredWines = masterWines.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addItem = (wine: MasterWine & { stock: number }) => {
    if (wine.stock <= 0) {
      Alert.alert("Out of Stock", "This wine is currently unavailable in the warehouse.");
      return;
    }

    const existing = selectedItems.find(i => i.wine.id === wine.id);
    if (existing) {
      if (existing.qty + 1 > wine.stock) return;
      updateQty(wine.id, 1);
    } else {
      setSelectedItems([...selectedItems, { wine, qty: 1 }]);
    }
  };

  const updateQty = (wineId: string, delta: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.wine.id === wineId) {
        const newQty = Math.max(1, item.qty + delta);
        if (newQty > item.wine.stock) return item;
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const removeItem = (wineId: string) => {
    setSelectedItems(prev => prev.filter(i => i.wine.id !== wineId));
  };

  const totalQty = selectedItems.reduce((acc, item) => acc + item.qty, 0);

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
          sku: item.wine.sku || "N/A",
          qty: item.qty,
          pulledQty: 0
        })),
        totalAmount: 0, // Not used in mobile but for compatibility
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'wine_requests'), requestData);

      Alert.alert(
        "Request Sent",
        "Your requisition has been dispatched to the warehouse.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderWineItem = ({ item }: { item: MasterWine & { stock: number } }) => {
    const isOutOfStock = item.stock <= 0;
    const selectedCount = selectedItems.find(si => si.wine.id === item.id)?.qty || 0;

    return (
      <TouchableOpacity
        style={[styles.wineCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => addItem(item)}
        disabled={isOutOfStock}
      >
        <View style={styles.wineInfo}>
          <Text style={[styles.wineName, { color: theme.text }]}>{item.name}</Text>
          <View style={styles.wineMeta}>
            <Text style={[styles.wineSub, { color: theme.textSecondary }]}>{item.vintage} • {item.producer}</Text>
            <View style={[styles.stockBadge, { backgroundColor: isOutOfStock ? theme.danger + '15' : theme.secondary + '15' }]}>
              <Text style={[styles.stockText, { color: isOutOfStock ? theme.danger : theme.secondary }]}>
                {item.stock} IN STOCK
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.addIcon, { backgroundColor: isOutOfStock ? theme.border : theme.primary }]}>
          {selectedCount > 0 ? (
            <Text style={styles.countLabel}>{selectedCount}</Text>
          ) : (
            <Plus size={20} color="#fff" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color={theme.primary} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: theme.primary }]}>Create Requisition</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Browse Warehouse Stock</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.searchSection}>
        <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Search size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Find a wine..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {fetchingWines ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Syncing Vintages...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredWines}
          keyExtractor={item => item.id}
          renderItem={renderWineItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectedItems.length > 0 && (
        <View style={[styles.summaryFooter, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryLabelRow}>
              <ShoppingCart size={16} color={theme.primary} />
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>SELECTED ITEMS ({selectedItems.length})</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedItems([])}>
              <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 11 }}>CLEAR ALL</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cartItems}>
            {selectedItems.map(item => (
              <View key={item.wine.id} style={[styles.cartItem, { borderColor: theme.border }]}>
                <Text style={[styles.cartItemName, { color: theme.text }]} numberOfLines={1}>{item.wine.name}</Text>
                <View style={styles.cartControls}>
                  <TouchableOpacity onPress={() => updateQty(item.wine.id, -1)} style={styles.miniBtn}>
                    <Minus size={14} color={theme.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.cartQty, { color: theme.text }]}>{item.qty}</Text>
                  <TouchableOpacity onPress={() => updateQty(item.wine.id, 1)} style={styles.miniBtn}>
                    <Plus size={14} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeItem(item.wine.id)} style={[styles.miniBtn, { marginLeft: 4 }]}>
                    <Trash2 size={14} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.primary }, submitting && { opacity: 0.7 }]}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitText}>SUBMIT TO WAREHOUSE ({totalQty})</Text>
                <Send size={18} color="#fff" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
    padding: 24,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  searchSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 24,
    paddingTop: 0,
    paddingBottom: 200,
  },
  wineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
  },
  wineInfo: {
    flex: 1,
  },
  wineName: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  wineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wineSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  stockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockText: {
    fontSize: 9,
    fontWeight: '900',
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countLabel: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  summaryFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    borderTopWidth: 1,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cartItems: {
    maxHeight: 100,
    marginBottom: 16,
  },
  cartItem: {
    width: 140,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 10,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  cartItemName: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  cartControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniBtn: {
    padding: 4,
  },
  cartQty: {
    fontSize: 13,
    fontWeight: '900',
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
