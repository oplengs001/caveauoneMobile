import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  Award,
  ChevronRight,
  LogOut,
  Trophy,
  Wine,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

export default function StaffDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile, refreshProfile } = useAuth();
  const theme = Colors.store;

  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "all">("today");
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<"fast" | "fine" | "reserve" | "standard">("fast");
  const [loadingSales, setLoadingSales] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [salesDashboardMetrics, setSalesDashboardMetrics] = useState({
    soldCount: 0,
    categoryCounts: { fast: 0, fine: 0, reserve: 0, standard: 0 },
    portionCounts: { bottle: 0, glass: 0, carafe: 0 },
    top5WinesByCategory: {
      fast: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
      fine: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
      reserve: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
      standard: [] as Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>,
    },
    staffRankings: [] as Array<{
      id: string;
      name: string;
      email: string;
      volume: number;
      salesCount: number;
      rank: number;
      isMe: boolean;
    }>,
    myRankInfo: {
      rank: 0,
      totalStaff: 0,
      volume: 0,
      salesCount: 0,
    },
  });

  const fetchSalesMetrics = useCallback(async () => {
    const storeId = profile?.locationId;
    if (!storeId) {
      setLoadingSales(false);
      return;
    }

    try {
      setLoadingSales(true);
      let startDate: Date;
      if (salesPeriod === "today") {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      } else if (salesPeriod === "week") {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(0);
      }

      const params = new URLSearchParams({
        storeId,
        from: startDate.toISOString(),
        to: new Date().toISOString(),
      });
      const data = await apiFetch(`/sales?${params}`);
      const salesList = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];

      // Filter sales to logged-in user for individual breakdown
      const mySales = salesList.filter(
        (s: any) =>
          s.soldById === profile?.id ||
          (s.soldByEmail && profile?.email && s.soldByEmail.toLowerCase() === profile.email.toLowerCase())
      );

      let totalVolume = 0;
      const catCounts = { fast: 0, fine: 0, reserve: 0, standard: 0 };
      const portionCounts = { bottle: 0, glass: 0, carafe: 0 };

      const wineAggByCategory: Record<
        string,
        Record<string, { id: string; name: string; vintage?: string; volume: number }>
      > = {
        fast: {},
        fine: {},
        reserve: {},
        standard: {},
      };

      mySales.forEach((item: any) => {
        const st = (item.saleType || "bottle").toLowerCase();
        let vol = 1;
        if (st === "glass") {
          vol = 1 / 6;
          portionCounts.glass += 1;
        } else if (st === "carafe") {
          vol = 2 / 6;
          portionCounts.carafe += 1;
        } else {
          vol = Number(item.quantity || 1);
          portionCounts.bottle += 1;
        }
        totalVolume += vol;

        const cat = (item.wineCategory || item.masterWine?.wineCategory || "standard").toLowerCase();
        const cKey = cat in catCounts ? cat : "standard";
        catCounts[cKey as keyof typeof catCounts] += vol;

        const wId = item.masterWineId || item.wineName || item.bottleId || "unknown";
        const wName = item.wineName || item.masterWine?.name || "Unknown Wine";
        const wVintage = item.vintage || item.masterWine?.vintage || "";

        if (!wineAggByCategory[cKey][wId]) {
          wineAggByCategory[cKey][wId] = {
            id: wId,
            name: wName,
            vintage: wVintage,
            volume: 0,
          };
        }
        wineAggByCategory[cKey][wId].volume += vol;
      });

      // Round category volumes
      Object.keys(catCounts).forEach((key) => {
        const k = key as keyof typeof catCounts;
        catCounts[k] = Math.round(catCounts[k] * 100) / 100;
      });

      // Extract Top 5 per category
      const top5ByCategory: {
        fast: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        fine: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        reserve: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
        standard: Array<{ name: string; vintage?: string; volume: number; pctOfTotal: number }>;
      } = {
        fast: [],
        fine: [],
        reserve: [],
        standard: [],
      };

      (Object.keys(wineAggByCategory) as Array<keyof typeof top5ByCategory>).forEach((cKey) => {
        const wines = Object.values(wineAggByCategory[cKey]);
        wines.forEach((w) => {
          w.volume = Math.round(w.volume * 100) / 100;
        });
        wines.sort((a, b) => b.volume - a.volume);

        top5ByCategory[cKey] = wines.slice(0, 5).map((w) => ({
          name: w.name,
          vintage: w.vintage,
          volume: w.volume,
          pctOfTotal: totalVolume > 0 ? Math.round((w.volume / totalVolume) * 1000) / 10 : 0,
        }));
      });

      // Calculate Staff Rankings across ALL store sales
      const staffMap: Record<
        string,
        { id: string; name: string; email: string; volume: number; salesCount: number }
      > = {};

      salesList.forEach((item: any) => {
        const stId = item.soldById || item.soldByEmail || item.soldByName || "unknown";
        const stName =
          item.soldByName || (item.soldByEmail ? item.soldByEmail.split("@")[0] : "Staff Member");
        const stEmail = item.soldByEmail || "";

        const st = (item.saleType || "bottle").toLowerCase();
        let vol = 1;
        if (st === "glass") vol = 1 / 6;
        else if (st === "carafe") vol = 2 / 6;
        else vol = Number(item.quantity || 1);

        if (!staffMap[stId]) {
          staffMap[stId] = {
            id: stId,
            name: stName,
            email: stEmail,
            volume: 0,
            salesCount: 0,
          };
        }
        staffMap[stId].volume += vol;
        staffMap[stId].salesCount += 1;
      });

      const sortedStaffList = Object.values(staffMap)
        .map((s) => ({
          ...s,
          volume: Math.round(s.volume * 100) / 100,
        }))
        .sort((a, b) => b.volume - a.volume);

      let myRankNum = 0;
      let myStaffVol = 0;
      let mySalesCount = 0;

      const staffRankingsList = sortedStaffList.map((s, idx) => {
        const isMe = Boolean(
          (profile?.id && s.id === profile.id) ||
          (profile?.email && s.email && s.email.toLowerCase() === profile.email.toLowerCase())
        );
        if (isMe) {
          myRankNum = idx + 1;
          myStaffVol = s.volume;
          mySalesCount = s.salesCount;
        }
        return {
          ...s,
          rank: idx + 1,
          isMe,
        };
      });

      setSalesDashboardMetrics({
        soldCount: Math.round(totalVolume * 100) / 100,
        categoryCounts: catCounts,
        portionCounts: portionCounts,
        top5WinesByCategory: top5ByCategory,
        staffRankings: staffRankingsList,
        myRankInfo: {
          rank: myRankNum,
          totalStaff: staffRankingsList.length,
          volume: myStaffVol,
          salesCount: mySalesCount,
        },
      });
    } catch (err) {
      console.error("Failed to fetch staff sales metrics:", err);
    } finally {
      setLoadingSales(false);
    }
  }, [profile, salesPeriod]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSalesMetrics();
    setRefreshing(false);
  }, [fetchSalesMetrics]);

  useFocusEffect(
    useCallback(() => {
      fetchSalesMetrics();
    }, [fetchSalesMetrics])
  );

  useEffect(() => {
    fetchSalesMetrics();
  }, [salesPeriod, fetchSalesMetrics]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of the POS terminal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await clearToken();
            await refreshProfile();
            router.replace("/login");
          } catch (error) {
            console.error("Sign out error:", error);
          }
        },
      },
    ]);
  };

  const isTablet = width >= 768;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
      >
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.titleContainer}>
              <View style={[styles.badgeIcon, { backgroundColor: theme.primary }]}>
                <Trophy size={20} color="#fff" strokeWidth={2.5} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Staff Performance</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {profile?.email?.split("@")[0] || "Staff"} · Boutique Sales
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.signOutButton, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={handleSignOut}
            >
              <LogOut size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Time Period Filter Bar ──────────────────────────────────────────── */}
        <View style={[styles.periodBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
            <TouchableOpacity
              onPress={() => setSalesPeriod("today")}
              style={[
                styles.periodButton,
                salesPeriod === "today" && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  { color: salesPeriod === "today" ? "#fff" : theme.textSecondary },
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSalesPeriod("week")}
              style={[
                styles.periodButton,
                salesPeriod === "week" && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  { color: salesPeriod === "week" ? "#fff" : theme.textSecondary },
                ]}
              >
                This Week
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSalesPeriod("all")}
              style={[
                styles.periodButton,
                salesPeriod === "all" && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  { color: salesPeriod === "all" ? "#fff" : theme.textSecondary },
                ]}
              >
                All Time
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/sales")}
            style={[styles.viewSalesLink, { backgroundColor: theme.primary + "15" }]}
          >
            <Text style={[styles.viewSalesText, { color: theme.primary }]}>Store Sales →</Text>
          </TouchableOpacity>
        </View>

        {loadingSales && !refreshing ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ marginTop: 12, fontSize: 13, color: theme.textSecondary, fontWeight: "600" }}>
              Loading performance metrics...
            </Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {/* ── My Personal Highlights Card ─────────────────────────────────── */}
            <View style={[styles.myHighlightCard, { backgroundColor: theme.primary }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.myHighlightLabel}>MY ATTRIBUTED SALES</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                    <Text style={styles.myHighlightVolume}>
                      {salesDashboardMetrics.soldCount % 1 === 0
                        ? salesDashboardMetrics.soldCount
                        : salesDashboardMetrics.soldCount.toFixed(2)}
                    </Text>
                    <Text style={styles.myHighlightVolumeUnit}>bottles</Text>
                  </View>
                </View>

                <View style={styles.myRankBadge}>
                  <MaterialCommunityIcons
                    name={
                      salesDashboardMetrics.myRankInfo.rank === 1
                        ? "trophy"
                        : salesDashboardMetrics.myRankInfo.rank === 2
                          ? "medal"
                          : "star-circle"
                    }
                    size={20}
                    color="#ffffff"
                  />
                  <Text style={styles.myRankText}>
                    {salesDashboardMetrics.myRankInfo.rank > 0
                      ? `Rank #${salesDashboardMetrics.myRankInfo.rank}`
                      : "Active Staff"}
                  </Text>
                </View>
              </View>

              <View style={styles.myHighlightDivider} />

              <View style={styles.mySubStatsGrid}>
                <View style={styles.mySubStatItem}>
                  <Text style={styles.mySubStatLabel}>Transactions</Text>
                  <Text style={styles.mySubStatValue}>
                    {salesDashboardMetrics.myRankInfo.salesCount} sold
                  </Text>
                </View>
                <View style={styles.mySubStatItem}>
                  <Text style={styles.mySubStatLabel}>Store Standing</Text>
                  <Text style={styles.mySubStatValue}>
                    {salesDashboardMetrics.myRankInfo.rank > 0
                      ? `#${salesDashboardMetrics.myRankInfo.rank} of ${salesDashboardMetrics.myRankInfo.totalStaff}`
                      : "Staff"}
                  </Text>
                </View>
                <View style={styles.mySubStatItem}>
                  <Text style={styles.mySubStatLabel}>Period</Text>
                  <Text style={styles.mySubStatValue}>
                    {salesPeriod === "today"
                      ? "Today"
                      : salesPeriod === "week"
                        ? "This Week"
                        : "All Time"}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Leaderboard Section ────────────────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Award size={18} color={theme.accent} />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Store Staff Leaderboard</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textSecondary }}>
                  {salesDashboardMetrics.staffRankings.length} Active Staff
                </Text>
              </View>

              {salesDashboardMetrics.staffRankings.length === 0 ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                    No staff sales recorded for this period yet.
                  </Text>
                </View>
              ) : (
                <View style={[styles.leaderboardGrid, isTablet && styles.leaderboardGridTablet]}>
                  {salesDashboardMetrics.staffRankings.map((staff) => (
                    <View
                      key={staff.id}
                      style={[
                        styles.leaderboardRow,
                        isTablet && styles.leaderboardRowTablet,
                        {
                          backgroundColor: staff.isMe ? theme.primary + "10" : theme.background,
                          borderColor: staff.isMe ? theme.primary + "35" : theme.border,
                        },
                      ]}
                    >
                      {/* Left: Rank + Name + Txns */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 8 }}>
                        <View
                          style={[
                            styles.rankNumberBadge,
                            {
                              backgroundColor:
                                staff.rank === 1
                                  ? "#f59e0b"
                                  : staff.rank === 2
                                    ? "#94a3b8"
                                    : staff.rank === 3
                                      ? "#d97706"
                                      : "#e2e8f0",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "900",
                              color: staff.rank <= 3 ? "#ffffff" : "#475569",
                            }}
                          >
                            #{staff.rank}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text
                              style={[
                                styles.staffNameText,
                                { color: theme.text, fontWeight: staff.isMe ? "900" : "700" },
                              ]}
                              numberOfLines={1}
                            >
                              {staff.name}
                            </Text>
                            {staff.isMe && (
                              <View style={[styles.youBadge, { backgroundColor: theme.primary }]}>
                                <Text style={styles.youBadgeText}>YOU</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 1 }}>
                            {staff.salesCount} txn{staff.salesCount !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>

                      {/* Right: Bottle Count */}
                      <View style={styles.staffVolBadge}>
                        <MaterialCommunityIcons
                          name="bottle-wine"
                          size={14}
                          color={staff.isMe ? theme.primary : theme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.staffVolumeText,
                            { color: staff.isMe ? theme.primary : theme.text },
                          ]}
                        >
                          {staff.volume % 1 === 0 ? staff.volume : staff.volume.toFixed(2)} btls
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── Category Breakdown (Top 5 Sellers with Tabs) ──────────────── */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Wine size={18} color={theme.accent} />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>My Top Sellers by Category</Text>
                </View>
              </View>

              {/* Category Segmented Selector Tabs */}
              <View style={styles.catTabContainer}>
                {[
                  { key: "fast", label: "Fast", color: "#d97706", bg: "#fef3c7" },
                  { key: "fine", label: "Fine", color: "#be185d", bg: "#fce7f3" },
                  { key: "reserve", label: "Reserve", color: "#4338ca", bg: "#e0e7ff" },
                  { key: "standard", label: "Standard", color: "#475569", bg: "#f1f5f9" },
                ].map((tab) => {
                  const isSelected = selectedCategoryTab === tab.key;
                  const catVol =
                    salesDashboardMetrics.categoryCounts[tab.key as keyof typeof salesDashboardMetrics.categoryCounts] || 0;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setSelectedCategoryTab(tab.key as any)}
                      style={[
                        styles.catTabBtn,
                        isSelected
                          ? { backgroundColor: tab.color, borderColor: tab.color }
                          : { backgroundColor: tab.bg, borderColor: "transparent" },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.catTabLabel,
                          { color: isSelected ? "#ffffff" : tab.color },
                        ]}
                        numberOfLines={1}
                      >
                        {tab.label}
                      </Text>
                      <Text
                        style={[
                          styles.catTabVol,
                          { color: isSelected ? "#ffffff" : tab.color },
                        ]}
                      >
                        {catVol % 1 === 0 ? catVol : catVol.toFixed(1)} btl
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Top 5 Wine List for Selected Category */}
              {salesDashboardMetrics.top5WinesByCategory[selectedCategoryTab].length > 0 ? (
                <View style={[styles.topWineTable, isTablet && styles.topWineTableTablet]}>
                  {salesDashboardMetrics.top5WinesByCategory[selectedCategoryTab].map((w, idx) => (
                    <View
                      key={idx}
                      style={[styles.topWineTableRow, isTablet && styles.topWineTableRowTablet]}
                    >
                      <View style={styles.topWineRankCircle}>
                        <Text style={styles.topWineRankText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, paddingHorizontal: 8 }}>
                        <Text style={[styles.topWineNameText, { color: theme.text }]} numberOfLines={1}>
                          {w.name}
                        </Text>
                        {w.vintage ? (
                          <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: "600" }}>
                            Vintage {w.vintage}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.topWineVolBadge}>
                        <Text style={[styles.topWineVolText, { color: theme.primary }]}>
                          {w.volume} btls
                        </Text>
                        {w.pctOfTotal > 0 && (
                          <Text style={styles.topWinePctText}>{w.pctOfTotal}%</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ paddingVertical: 18, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontStyle: "italic" }}>
                    No sales recorded for this category in this period.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Portion Type Breakdown ─────────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>SALES BY PORTION TYPE</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.portionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.portionIconWrap, { backgroundColor: theme.primary + "15" }]}>
                    <MaterialCommunityIcons name="bottle-wine" size={18} color={theme.primary} />
                  </View>
                  <Text style={[styles.portionCount, { color: theme.text }]}>
                    {salesDashboardMetrics.portionCounts.bottle}
                  </Text>
                  <Text style={[styles.portionLabel, { color: theme.primary }]}>Full Bottle</Text>
                </View>

                <View style={[styles.portionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.portionIconWrap, { backgroundColor: "#05966915" }]}>
                    <MaterialCommunityIcons name="glass-wine" size={18} color="#059669" />
                  </View>
                  <Text style={[styles.portionCount, { color: theme.text }]}>
                    {salesDashboardMetrics.portionCounts.glass}
                  </Text>
                  <Text style={[styles.portionLabel, { color: "#059669" }]}>Glass (1/6)</Text>
                </View>

                <View style={[styles.portionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.portionIconWrap, { backgroundColor: "#d9770615" }]}>
                    <MaterialCommunityIcons name="cup-water" size={18} color="#d97706" />
                  </View>
                  <Text style={[styles.portionCount, { color: theme.text }]}>
                    {salesDashboardMetrics.portionCounts.carafe}
                  </Text>
                  <Text style={[styles.portionLabel, { color: "#d97706" }]}>Carafe (2/6)</Text>
                </View>
              </View>
            </View>

            {/* ── View Detailed Store Sales Button ───────────────────────────── */}
            <TouchableOpacity
              style={[styles.viewStoreSalesBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push("/sales")}
              activeOpacity={0.85}
            >
              <Wine size={18} color="#fff" />
              <Text style={styles.viewStoreSalesBtnText}>View Full Store Sales Log</Text>
              <ChevronRight size={16} color="#fff" />
            </TouchableOpacity>
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
    padding: 20,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  signOutButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  periodBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  viewSalesLink: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  viewSalesText: {
    fontSize: 12,
    fontWeight: "800",
  },
  myHighlightCard: {
    borderRadius: 18,
    padding: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  myHighlightLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 1,
  },
  myHighlightVolume: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
  },
  myHighlightVolumeUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
  },
  myRankBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    gap: 2,
  },
  myRankText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },
  myHighlightDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginVertical: 12,
  },
  mySubStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  mySubStatItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  mySubStatLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
  },
  mySubStatValue: {
    fontSize: 12,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  leaderboardGrid: {
    gap: 6,
  },
  leaderboardGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  leaderboardRowTablet: {
    flex: 1,
    minWidth: "48%",
    maxWidth: "50%",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rankNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  staffNameText: {
    fontSize: 13,
  },
  youBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  youBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  staffVolBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  staffVolumeText: {
    fontSize: 13,
    fontWeight: "900",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  catTabContainer: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  catTabBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  catTabLabel: {
    fontSize: 10,
    fontWeight: "800",
  },
  catTabVol: {
    fontSize: 9,
    fontWeight: "900",
    marginTop: 1,
  },
  topWineTable: {
    gap: 5,
  },
  topWineTableTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  topWineTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  topWineTableRowTablet: {
    flex: 1,
    minWidth: "48%",
    maxWidth: "50%",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  topWineRankCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  topWineRankText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
  },
  topWineNameText: {
    fontSize: 12,
    fontWeight: "700",
  },
  topWineVolBadge: {
    alignItems: "flex-end",
  },
  topWineVolText: {
    fontSize: 12,
    fontWeight: "900",
  },
  topWinePctText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
  },
  portionCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  portionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  portionLabel: {
    fontSize: 10,
    fontWeight: "800",
  },
  portionCount: {
    fontSize: 17,
    fontWeight: "900",
    marginVertical: 2,
  },
  viewStoreSalesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 13,
    borderRadius: 14,
    gap: 8,
    marginTop: 2,
  },
  viewStoreSalesBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
});
