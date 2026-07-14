import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Receipt, Zap } from "lucide-react-native";

const VAT_RATE = 0.12;

export function formatCurrency(value: number): string {
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function VatBreakdownCard({
  basePrice,
  theme,
  isFastMoving,
  vatMode,
}: {
  basePrice: string;
  theme: any;
  isFastMoving: boolean;
  vatMode?: "excluded" | "included";
}) {
  const numericPrice = parseFloat(basePrice) || 0;
  const isIncluded = vatMode === "included";

  let netPrice = numericPrice;
  let vatAmount = numericPrice * VAT_RATE;
  let total = numericPrice + vatAmount;

  if (isIncluded) {
    netPrice = numericPrice / (1 + VAT_RATE);
    vatAmount = numericPrice - netPrice;
    total = numericPrice;
  }

  const hasValue = numericPrice > 0;

  return (
    <View
      style={[
        vatStyles.card,
        {
          backgroundColor: theme.card,
          borderColor: hasValue ? theme.primary + "40" : theme.border,
        },
      ]}
    >
      {/* Header */}
      <View style={vatStyles.cardHeader}>
        <Receipt size={14} color={theme.primary} />
        <Text style={[vatStyles.cardTitle, { color: theme.primary }]}>
          VAT BREAKDOWN
        </Text>
        {isFastMoving && (
          <View
            style={[
              vatStyles.fastMovingBadge,
              { backgroundColor: "#f59e0b18", borderColor: "#f59e0b40" },
            ]}
          >
            <Zap size={10} color="#f59e0b" />
            <Text style={vatStyles.fastMovingText}>FAST MOVING</Text>
          </View>
        )}
      </View>

      {/* Rows */}
      <View style={vatStyles.row}>
        <Text style={[vatStyles.rowLabel, { color: theme.textSecondary }]}>
          Selling Price
        </Text>
        <Text style={[vatStyles.rowValue, { color: theme.text }]}>
          {hasValue ? formatCurrency(netPrice) : "—"}
        </Text>
      </View>

      <View style={[vatStyles.divider, { backgroundColor: theme.border }]} />

      <View style={vatStyles.row}>
        <View style={vatStyles.rowLabelGroup}>
          <Text style={[vatStyles.rowLabel, { color: theme.textSecondary }]}>
            VAT
          </Text>
          <View
            style={[
              vatStyles.rateBadge,
              { backgroundColor: theme.primary + "18" },
            ]}
          >
            <Text style={[vatStyles.rateText, { color: theme.primary }]}>
              12%
            </Text>
          </View>
        </View>
        <Text style={[vatStyles.rowValue, { color: theme.textSecondary }]}>
          {hasValue ? formatCurrency(vatAmount) : "—"}
        </Text>
      </View>

      <View style={[vatStyles.divider, { backgroundColor: theme.border }]} />

      {/* Total */}
      <View
        style={[vatStyles.totalRow, { backgroundColor: theme.primary + "0C" }]}
      >
        <Text style={[vatStyles.totalLabel, { color: theme.text }]}>
          {isIncluded ? "TOTAL (ENTERED)" : "TOTAL (VAT-INC)"}
        </Text>
        <Text
          style={[
            vatStyles.totalValue,
            { color: hasValue ? theme.primary : theme.textSecondary },
          ]}
        >
          {hasValue ? formatCurrency(total) : "—"}
        </Text>
      </View>
    </View>
  );
}

const vatStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    flex: 1,
  },
  fastMovingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  fastMovingText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  rowLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  rateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rateText: {
    fontSize: 10,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    marginHorizontal: 18,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
});
