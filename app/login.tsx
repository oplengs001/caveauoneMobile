import { useAuth } from "@/context/AuthContext";
import { saveToken } from "@/lib/auth";

import { useResponsivePadding } from "@/hooks/useResponsivePadding";
import { useRouter } from "expo-router";
import { Lock, LogIn, Mail, ShieldCheck, Warehouse } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://stg-caveauone.grapey.io";

export default function LoginScreen() {
  const { horizontalPadding } = useResponsivePadding(28);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  const router = useRouter();

  const passwordInputRef = useRef<TextInput>(null);

  const handleLogin = async (loginEmail?: string, loginPassword?: string) => {
    const finalEmail = loginEmail || email;
    const finalPassword = loginPassword || password;

    if (!finalEmail || !finalPassword) {
      Alert.alert(
        "Missing Credentials",
        "Please enter your warehouse email and security password.",
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v2/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: finalEmail,
          password: finalPassword,
        }),
      });
      if (!res.ok) {
        let msg = "Invalid credentials. Please contact your supervisor.";
        try {
          const json = await res.json();
          if (json.error) msg = json.error;
        } catch { /* ignore */ }
        Alert.alert("Access Denied", msg);
        return;
      }

      const { token } = await res.json();
      await saveToken(token);
      await refreshProfile();
      router.replace("/(tabs)/home");
    } catch (error: any) {
      Alert.alert(
        "Access Denied",
        error.message || "Invalid credentials. Please contact your supervisor.",
      );
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (emailStr: string, passStr: string) => {
    setEmail(emailStr);
    setPassword(passStr);
    handleLogin(emailStr, passStr);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Upper Left Version Tag for OTA Testing */}
      <View style={styles.topLeftVersionContainer}>
        <View style={styles.versionDot} />
        <Text style={styles.versionBadgeText}>v1.0.0 (OTA Test)</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingHorizontal: horizontalPadding },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandContainer}>
              <View style={styles.logoBox}>
                <Warehouse size={44} color="#6366f1" strokeWidth={1.5} />
              </View>
              <Text style={styles.brandName}>
                CAVEAU<Text style={styles.brandBold}>ONE</Text>
              </Text>
              <Text style={styles.subBrand}>WAREHOUSE MANAGEMENT</Text>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Mail size={12} color="#64748b" />
                  <Text style={styles.label}>EMAIL ADDRESS</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="worker@caveauone.com"
                    placeholderTextColor="#475569"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Lock size={12} color="#64748b" />
                  <Text style={styles.label}>SECURITY KEY</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#475569"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => handleLogin()}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => handleLogin()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>AUTHORIZE ACCESS</Text>
                    <LogIn size={18} color="#fff" strokeWidth={2.5} />
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.testButtonsContainer}>
                <Text style={styles.quickLoginHeader}>QUICK TEST LOGIN:</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={() => quickLogin("gadmin@gmail.com", "123456")}
                  >
                    <Text style={styles.testButtonText}>Admin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={() => quickLogin("gwarehouse@gmail.com", "123456")}
                  >
                    <Text style={styles.testButtonText}>Warehouse</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={() => quickLogin("gstore@gmail.com", "123456")}
                  >
                    <Text style={styles.testButtonText}>Store</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={() => quickLogin("gstaff@gmail.com", "123456")}
                  >
                    <Text style={styles.testButtonText}>Staff</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <ShieldCheck size={14} color="#475569" />
              <Text style={styles.footerText}>SECURE TERMINAL ACCESS</Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  topLeftVersionContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 14 : 16,
    left: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    borderWidth: 1,
    borderColor: "#334155",
  },
  versionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  versionBadgeText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoBox: {
    width: 76,
    height: 76,
    backgroundColor: "#1e293b",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  brandName: {
    fontSize: 26,
    color: "#94a3b8",
    letterSpacing: 2,
    fontWeight: "300",
  },
  brandBold: {
    fontWeight: "900",
    color: "#ffffff",
  },
  subBrand: {
    color: "#6366f1",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 4,
    marginTop: 6,
  },
  formContainer: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  label: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  inputWrapper: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  input: {
    color: "#ffffff",
    fontSize: 15,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#4f46e5",
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  testButtonsContainer: {
    marginTop: 28,
    alignItems: "center",
  },
  quickLoginHeader: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  testButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  testButtonText: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 36,
  },
  footerText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
