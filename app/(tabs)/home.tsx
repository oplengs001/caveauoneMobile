import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { Stack, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ClipboardList,
  FileDown,
  LayoutList,
  LogOut,
  MapPin,
  Search,
  Truck,
  Wine,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function HomeScreen() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [dashboardMetrics, setDashboardMetrics] = useState({ stockout: 0, parAlert: 0, underSafety: 0, overstock: 0 });

  useEffect(() => {
    const fetchMetrics = async () => {
      const storeId = profile?.locationId;
      if (profile?.role !== "store" || !storeId) return;

      try {
        const settingsSnap = await getDocs(
          query(
            collection(db, "store_wine_settings"),
            where("storeId", "==", storeId),
            where("discontinued", "==", false),
          ),
        );

        let stockout = 0;
        let parAlert = 0;
        let underSafety = 0;
        let overstock = 0;

        await Promise.all(
          settingsSnap.docs.map(async (d) => {
            const { masterWineId, parLevel, safetyStock } = d.data();
            const wineRef = doc(db, "master_wines", masterWineId);
            const snap = await getCountFromServer(
              query(
                collection(db, "inventory_bottles"),
                where("storeRef", "==", doc(db, "stores", storeId)),
                where("masterWineRef", "==", wineRef),
                where("status", "in", ["received", "shelved"]),
              ),
            );
            const count = snap.data().count;
            if (count === 0) stockout++;
            else if (count > (safetyStock || 0)) overstock++;
            else if (count <= (parLevel || 0)) parAlert++;
            else if (count < (safetyStock || 0)) underSafety++;
          })
        );
        setDashboardMetrics({ stockout, parAlert, underSafety, overstock });
      } catch (err) {
        console.error("Failed to fetch dashboard metrics:", err);
      }
    };
    if (!loading) fetchMetrics();
  }, [profile, loading]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to exit the system?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit System",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace("/login");
          } catch (error) {
            console.error("Sign out error:", error);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <View style={styles.logoBadge}>
          <Wine size={32} color="#ffffff" strokeWidth={2.5} />
        </View>
      </View>
    );
  }

  const role = profile?.role || "warehouse";
  const theme = role === "store" ? Colors.store : Colors.warehouse;
  const isStore = role === "store";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoContainer}>
              <View
                style={[
                  styles.logoBadge,
                  {
                    backgroundColor: theme.logoBg,
                    borderRadius: isStore ? 20 : 10,
                  },
                ]}
              >
                <Wine
                  size={24}
                  color={isStore ? "#fff" : "#fff"}
                  strokeWidth={2.5}
                />
              </View>
              <Text
                style={[
                  styles.title,
                  {
                    color: theme.text,
                    fontFamily: isStore ? "System" : undefined,
                    letterSpacing: isStore ? 2 : -1,
                  },
                ]}
              >
                {isStore ? "Caveau" : "CaveauOne"}
                {isStore && (
                  <Text style={{ color: theme.accent, fontWeight: "300" }}>
                    One
                  </Text>
                )}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.signOutButton,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={handleSignOut}
            >
              <LogOut size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isStore
              ? "Boutique Sommelier Terminal"
              : "Warehouse Management System"}
          </Text>
        </View>

        {isStore && (
          <View style={styles.metricsDashboard}>
            <Text style={styles.metricsTitle}>Inventory Health</Text>
            <View style={styles.metricsGrid}>
              <TouchableOpacity 
                style={[styles.metricCard, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]} 
                onPress={() => router.push({ pathname: "/store-master-list", params: { filter: 'stockout' } })}
              >
                <AlertOctagon size={28} color="#991b1b" strokeWidth={2.5} />
                <Text style={[styles.metricCount, { color: '#991b1b' }]}>{dashboardMetrics.stockout}</Text>
                <Text style={[styles.metricLabel, { color: '#991b1b' }]}>Stockout</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.metricCard, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]} 
                onPress={() => router.push({ pathname: "/store-master-list", params: { filter: 'alerts' } })}
              >
                <AlertTriangle size={28} color="#92400e" strokeWidth={2.5} />
                <Text style={[styles.metricCount, { color: '#92400e' }]}>{dashboardMetrics.parAlert}</Text>
                <Text style={[styles.metricLabel, { color: '#92400e' }]}>PAR Alert</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.metricCard, { backgroundColor: '#ffedd5', borderColor: '#fdba74' }]} 
                onPress={() => router.push({ pathname: "/store-master-list", params: { filter: 'under_safety' } })}
              >
                <AlertTriangle size={28} color="#9a3412" strokeWidth={2.5} />
                <Text style={[styles.metricCount, { color: '#9a3412' }]}>{dashboardMetrics.underSafety}</Text>
                <Text style={[styles.metricLabel, { color: '#9a3412' }]}>Under Safety</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.metricCard, { backgroundColor: '#dbeafe', borderColor: '#93c5fd' }]} 
                onPress={() => router.push({ pathname: "/store-master-list", params: { filter: 'overstock' } })}
              >
                <CheckCircle2 size={28} color="#1e40af" strokeWidth={2.5} />
                <Text style={[styles.metricCount, { color: '#1e40af' }]}>{dashboardMetrics.overstock}</Text>
                <Text style={[styles.metricLabel, { color: '#1e40af' }]}>Overstock</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {!isStore && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#4f46e5" }]}
              onPress={() => router.push("/onboarding")}
            >
              <View style={styles.buttonContent}>
                <FileDown size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>Onboarding Tasks</Text>
                  <Text style={styles.buttonDesc}>
                    Process new wine deliveries
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {isStore && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: theme.primary,
                  borderRadius: 24,
                  padding: 32,
                },
              ]}
              onPress={() => router.push("/wine-requests")}
            >
              <View style={styles.buttonContent}>
                <ClipboardList size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={[styles.buttonTitle, { fontSize: 24 }]}>
                    Wine Requests
                  </Text>
                  <Text style={styles.buttonDesc}>
                    Request stock from warehouse
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {isStore && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: "#0f766e", borderRadius: 24, padding: 32 },
              ]}
              onPress={() => router.push("/store-master-list")}
            >
              <View style={styles.buttonContent}>
                <LayoutList size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={[styles.buttonTitle, { fontSize: 24 }]}>
                    Master List
                  </Text>
                  <Text style={styles.buttonDesc}>
                    PAR levels & stock management
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: isStore ? theme.secondary : theme.secondary,
                borderRadius: isStore ? 24 : 24,
              },
            ]}
            onPress={() => router.push("/tagging")}
          >
            <View style={styles.buttonContent}>
              <MapPin size={42} color="#ffffff" strokeWidth={1.5} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>
                  {isStore ? "Bottle Management" : "Bottle Tagging"}
                </Text>
                <Text style={styles.buttonDesc}>
                  {isStore
                    ? "Update location or fulfill sales"
                    : "Assign bottles to bin locations"}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {!isStore && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={() => router.push("/pullout")}
            >
              <View style={styles.buttonContent}>
                <Truck size={42} color="#ffffff" strokeWidth={1.5} />
                <View style={styles.buttonTextContainer}>
                  <Text style={styles.buttonTitle}>Pullout Tasks</Text>
                  <Text style={styles.buttonDesc}>
                    Fulfill outbound requests
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: isStore ? theme.accent : theme.primary },
            ]}
            onPress={() => router.push("/inventory")}
          >
            <View style={styles.buttonContent}>
              <Search size={42} color="#ffffff" strokeWidth={1.5} />
              <View style={styles.buttonTextContainer}>
                <Text style={styles.buttonTitle}>Inventory Search</Text>
                <Text style={styles.buttonDesc}>
                  Search by SKU or Wine Name
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {isStore && (
          <View
            style={{
              marginTop: 40,
              padding: 24,
              backgroundColor: theme.primary + "10",
              borderRadius: 24,
              borderStyle: "dashed",
              borderWidth: 1,
              borderColor: theme.primary + "30",
            }}
          >
            <Text
              style={{
                color: theme.primary,
                fontWeight: "900",
                fontSize: 12,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Store Front Mode
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 14,
                fontStyle: "italic",
              }}
            >
              Authorized for inventory lookup, stock requisition, and sale
              fulfillment.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  header: {
    marginTop: 40,
    marginBottom: 48,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  signOutButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  logoBadge: {
    width: 40,
    height: 40,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  metricsDashboard: {
    marginBottom: 32,
  },
  metricsTitle: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "47%",
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 8,
  },
  metricCount: {
    fontSize: 28,
    fontWeight: "900",
    marginVertical: 8,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    textAlign: "center",
  },
  buttonContainer: {
    gap: 20,
  },
  actionButton: {
    borderRadius: 24,
    padding: 24,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 2,
  },
  buttonDesc: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
  },
});
