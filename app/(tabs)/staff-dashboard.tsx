import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";
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
          <View style={{ gap: 20 }}>
            {/* ── My Personal Highlights Card ─────────────────────────────────── */}
            <View style={[styles.myHighlightCard, { backgroundColor: theme.primary }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.myHighlightLabel}>MY ATTRIBUTED SALES</Text>
                  <Text style={styles.myHighlightVolume}>
                    {salesDashboardMetrics.soldCount % 1 === 0
                      ? salesDashboardMetrics.soldCount
                      : salesDashboardMetrics.soldCount.toFixed(2)}{" "}
                    <Text style={{ fontSize: 20, fontWeight: "700" }}>bottles</Text>
                  </Text>
                </View>
                <View style={styles.myRankBadge}>
                  <Text style={styles.myRankEmoji}>
                    {salesDashboardMetrics.myRankInfo.rank === 1
                      ? "🥇"
                      : salesDashboardMetrics.myRankInfo.rank === 2
                      ? "🥈"
                      : salesDashboardMetrics.myRankInfo.rank === 3
                      ? "🥉"
                      : "🎖️"}
                  </Text>
                  <Text style={styles.myRankText}>
                    {salesDashboardMetrics.myRankInfo.rank > 0
                      ? `Rank #${salesDashboardMetrics.myRankInfo.rank}`
                      : "Unranked"}
                  </Text>
                </View>
              </View>

              <View style={styles.myHighlightDivider} />

              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={styles.mySubStatLabel}>Transactions</Text>
                  <Text style={styles.mySubStatValue}>
                    {salesDashboardMetrics.myRankInfo.salesCount} sold
                  </Text>
                </View>
                <View>
                  <Text style={styles.mySubStatLabel}>Store Standing</Text>
                  <Text style={styles.mySubStatValue}>
                    {salesDashboardMetrics.myRankInfo.rank > 0
                      ? `Top #${salesDashboardMetrics.myRankInfo.rank} of ${salesDashboardMetrics.myRankInfo.totalStaff}`
                      : "Active Staff"}
                  </Text>
                </View>
                <View>
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
                  {salesDashboardMetrics.staffRankings.length} Staff Active
                </Text>
              </View>

              {salesDashboardMetrics.staffRankings.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                    No staff sales recorded for this period yet.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {salesDashboardMetrics.staffRankings.map((staff) => (
                    <View
                      key={staff.id}
                      style={[
                        styles.leaderboardRow,
                        {
                          backgroundColor: staff.isMe ? theme.primary + "12" : theme.background,
                          borderColor: staff.isMe ? theme.primary + "40" : theme.border,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
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
                                  : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "900",
                              color: staff.rank <= 3 ? "#ffffff" : theme.textSecondary,
                            }}
                          >
                            #{staff.rank}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.staffNameText,
                              { color: theme.text, fontWeight: staff.isMe ? "900" : "700" },
                            ]}
                            numberOfLines={1}
                          >
                            {staff.name} {staff.isMe ? "★ (You)" : ""}
                          </Text>
                          <Text style={{ fontSize: 10, color: theme.textSecondary }}>
                            {staff.salesCount} transaction{staff.salesCount !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={[
                            styles.staffVolumeText,
                            { color: staff.isMe ? theme.primary : theme.text },
                          ]}
                        >
                          {staff.volume % 1 === 0 ? staff.volume : staff.volume.toFixed(2)} btl
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── Category Breakdown (Top 5 Sellers) ─────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                MY TOP SELLERS BY CATEGORY
              </Text>

              <View style={styles.categoryGrid}>
                {/* Fast Moving */}
                <View
                  style={[
                    styles.categoryCard,
                    { backgroundColor: "#f59e0b12", borderColor: "#f59e0b35" },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.categoryCardTag, { color: "#d97706" }]}>⚡ FAST MOVING</Text>
                    <Text style={[styles.categoryVolumeBadge, { color: "#b45309" }]}>
                      {salesDashboardMetrics.categoryCounts.fast % 1 === 0
                        ? `${salesDashboardMetrics.categoryCounts.fast} btl`
                        : `${salesDashboardMetrics.categoryCounts.fast.toFixed(2)} btl`}
                    </Text>
                  </View>
                  {salesDashboardMetrics.top5WinesByCategory.fast.length > 0 ? (
                    <View style={styles.topWineList}>
                      {salesDashboardMetrics.top5WinesByCategory.fast.map((w, idx) => (
                        <View key={idx} style={styles.topWineRow}>
                          <Text style={[styles.topWineName, { color: "#b45309" }]} numberOfLines={1}>
                            #{idx + 1} {w.name} {w.vintage ? `(${w.vintage})` : ""}
                          </Text>
                          <Text style={[styles.topWineVol, { color: "#d97706" }]}>
                            {w.volume} btl
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyCategoryText}>No sales recorded</Text>
                  )}
                </View>

                {/* Fine Wine */}
                <View
                  style={[
                    styles.categoryCard,
                    { backgroundColor: "#ec489912", borderColor: "#ec489935" },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.categoryCardTag, { color: "#be185d" }]}>⭐ FINE WINE</Text>
                    <Text style={[styles.categoryVolumeBadge, { color: "#9d174d" }]}>
                      {salesDashboardMetrics.categoryCounts.fine % 1 === 0
                        ? `${salesDashboardMetrics.categoryCounts.fine} btl`
                        : `${salesDashboardMetrics.categoryCounts.fine.toFixed(2)} btl`}
                    </Text>
                  </View>
                  {salesDashboardMetrics.top5WinesByCategory.fine.length > 0 ? (
                    <View style={styles.topWineList}>
                      {salesDashboardMetrics.top5WinesByCategory.fine.map((w, idx) => (
                        <View key={idx} style={styles.topWineRow}>
                          <Text style={[styles.topWineName, { color: "#9d174d" }]} numberOfLines={1}>
                            #{idx + 1} {w.name} {w.vintage ? `(${w.vintage})` : ""}
                          </Text>
                          <Text style={[styles.topWineVol, { color: "#be185d" }]}>
                            {w.volume} btl
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyCategoryText}>No sales recorded</Text>
                  )}
                </View>

                {/* Reserve */}
                <View
                  style={[
                    styles.categoryCard,
                    { backgroundColor: "#6366f112", borderColor: "#6366f135" },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.categoryCardTag, { color: "#4338ca" }]}>🔒 RESERVE</Text>
                    <Text style={[styles.categoryVolumeBadge, { color: "#3730a3" }]}>
                      {salesDashboardMetrics.categoryCounts.reserve % 1 === 0
                        ? `${salesDashboardMetrics.categoryCounts.reserve} btl`
                        : `${salesDashboardMetrics.categoryCounts.reserve.toFixed(2)} btl`}
                    </Text>
                  </View>
                  {salesDashboardMetrics.top5WinesByCategory.reserve.length > 0 ? (
                    <View style={styles.topWineList}>
                      {salesDashboardMetrics.top5WinesByCategory.reserve.map((w, idx) => (
                        <View key={idx} style={styles.topWineRow}>
                          <Text style={[styles.topWineName, { color: "#3730a3" }]} numberOfLines={1}>
                            #{idx + 1} {w.name} {w.vintage ? `(${w.vintage})` : ""}
                          </Text>
                          <Text style={[styles.topWineVol, { color: "#4338ca" }]}>
                            {w.volume} btl
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyCategoryText}>No sales recorded</Text>
                  )}
                </View>

                {/* Standard */}
                <View
                  style={[
                    styles.categoryCard,
                    { backgroundColor: "#64748b12", borderColor: "#64748b35" },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.categoryCardTag, { color: "#475569" }]}>🍷 STANDARD</Text>
                    <Text style={[styles.categoryVolumeBadge, { color: "#334155" }]}>
                      {salesDashboardMetrics.categoryCounts.standard % 1 === 0
                        ? `${salesDashboardMetrics.categoryCounts.standard} btl`
                        : `${salesDashboardMetrics.categoryCounts.standard.toFixed(2)} btl`}
                    </Text>
                  </View>
                  {salesDashboardMetrics.top5WinesByCategory.standard.length > 0 ? (
                    <View style={styles.topWineList}>
                      {salesDashboardMetrics.top5WinesByCategory.standard.map((w, idx) => (
                        <View key={idx} style={styles.topWineRow}>
                          <Text style={[styles.topWineName, { color: "#334155" }]} numberOfLines={1}>
                            #{idx + 1} {w.name} {w.vintage ? `(${w.vintage})` : ""}
                          </Text>
                          <Text style={[styles.topWineVol, { color: "#475569" }]}>
                            {w.volume} btl
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyCategoryText}>No sales recorded</Text>
                  )}
                </View>
              </View>
            </View>

            {/* ── Portion Type Breakdown ─────────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>SALES BY PORTION TYPE</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={[styles.portionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.portionLabel, { color: theme.primary }]}>🍾 BOTTLE</Text>
                  <Text style={[styles.portionCount, { color: theme.text }]}>
                    {salesDashboardMetrics.portionCounts.bottle}
                  </Text>
                  <Text style={styles.portionSub}>Full Bottles</Text>
                </View>

                <View style={[styles.portionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.portionLabel, { color: "#059669" }]}>🍷 GLASS</Text>
                  <Text style={[styles.portionCount, { color: theme.text }]}>
                    {salesDashboardMetrics.portionCounts.glass}
                  </Text>
                  <Text style={styles.portionSub}>1/6 Bottle Each</Text>
                </View>

                <View style={[styles.portionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.portionLabel, { color: "#d97706" }]}>🫗 CARAFE</Text>
                  <Text style={[styles.portionCount, { color: theme.text }]}>
                    {salesDashboardMetrics.portionCounts.carafe}
                  </Text>
                  <Text style={styles.portionSub}>2/6 Bottle Each</Text>
                </View>
              </View>
            </View>

            {/* ── View Detailed Store Sales Button ───────────────────────────── */}
            <TouchableOpacity
              style={[styles.viewStoreSalesBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push("/sales")}
              activeOpacity={0.85}
            >
              <Wine size={20} color="#fff" />
              <Text style={styles.viewStoreSalesBtnText}>View Full Store Sales Log</Text>
              <ChevronRight size={18} color="#fff" />
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
    borderRadius: 20,
    padding: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  myHighlightLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 1,
  },
  myHighlightVolume: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 4,
  },
  myRankBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: "center",
  },
  myRankEmoji: {
    fontSize: 22,
  },
  myRankText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
  },
  myHighlightDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginVertical: 14,
  },
  mySubStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
  },
  mySubStatValue: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  rankNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  staffNameText: {
    fontSize: 13,
  },
  staffVolumeText: {
    fontSize: 14,
    fontWeight: "900",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  categoryGrid: {
    gap: 10,
  },
  categoryCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryCardTag: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  categoryVolumeBadge: {
    fontSize: 15,
    fontWeight: "900",
  },
  topWineList: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 8,
    gap: 6,
  },
  topWineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topWineName: {
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
  },
  topWineVol: {
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 6,
  },
  emptyCategoryText: {
    fontSize: 11,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 6,
  },
  portionCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  portionLabel: {
    fontSize: 10,
    fontWeight: "900",
  },
  portionCount: {
    fontSize: 20,
    fontWeight: "900",
    marginVertical: 4,
  },
  portionSub: {
    fontSize: 9,
    color: "#94a3b8",
    fontWeight: "600",
  },
  viewStoreSalesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 16,
    gap: 10,
    marginTop: 4,
  },
  viewStoreSalesBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
});
