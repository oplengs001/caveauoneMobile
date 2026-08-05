import { useAuth } from "@/context/AuthContext";
import { saveToken } from "@/lib/auth";

import { useRouter } from "expo-router";
import { Lock, LogIn, Mail, ShieldCheck, Warehouse } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://pre-caveauone.vercel.app";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  const router = useRouter();


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

  const quickLogin = (email: string, pass: string) => {
    setEmail(email);
    setPassword(pass);
    handleLogin(email, pass);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBox}>
            <Warehouse size={48} color="#6366f1" strokeWidth={1.5} />
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
                placeholderTextColor="#334155"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
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
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#334155"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
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
                <LogIn size={20} color="#fff" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.testButtonsContainer}>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => quickLogin("gadmin@gmail.com", "123456")}
            >
              <Text style={styles.testButtonText}>Login as Admin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => quickLogin("gwarehouse@gmail.com", "123456")}
            >
              <Text style={styles.testButtonText}>Login as Warehouse</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => quickLogin("gstore@gmail.com", "123456")}
            >
              <Text style={styles.testButtonText}>Login as Store</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => quickLogin("gstaff@gmail.com", "123456")}
            >
              <Text style={styles.testButtonText}>Login as Staff</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <ShieldCheck size={16} color="#334155" />
          <Text style={styles.footerText}>SECURE TERMINAL ACCESS</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 64,
  },
  logoBox: {
    width: 80,
    height: 80,
    backgroundColor: "#1e293b",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  brandName: {
    fontSize: 28,
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
    marginTop: 8,
  },
  formContainer: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 24,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  input: {
    color: "#ffffff",
    fontSize: 16,
    padding: 20,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#4f46e5",
    padding: 24,
    borderRadius: 20,
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  testButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 24,
  },
  testButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  testButtonText: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 12,
  },
});
