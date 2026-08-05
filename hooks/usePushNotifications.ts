import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { router } from "expo-router";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  expoPushToken?: Notifications.ExpoPushToken;
  notification?: Notifications.Notification;
}

export const usePushNotifications = (): PushNotificationState => {
  const [expoPushToken, setExpoPushToken] = useState<Notifications.ExpoPushToken | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();

  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    if (Device.isDevice) {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.log("Push Permission Denied", "Push notification permission was not granted.");
          return;
        }

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          Constants?.easConfig?.projectId;

        token = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        console.log("🟢 [PUSH TOKEN SUCCESS]:", token?.data);
        console.log("Push Token Success", `Token: ${token?.data}`);
      } catch (error: any) {
        console.error("🔴 [PUSH TOKEN ERROR]: Failed to get push token:", error);
        console.log("Push Token Error", error?.message || String(error));
      }
    } else {
      console.log("Push Notification", "Must use physical device for Push Notifications");
    }

    return token;
  }

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      setExpoPushToken(token);
    }).catch((err) => {
      console.log("Registration Error", String(err));
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("🔔 [PUSH NOTIFICATION] RECEIVED IN FOREGROUND:", JSON.stringify(notification, null, 2));
        setNotification(notification);
        console.log(
          notification.request.content.title || "Notification Received",
          notification.request.content.body || ""
        );
      }
    );

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("👆 [PUSH NOTIFICATION] TAPPED BY USER:", JSON.stringify(response, null, 2));
        const screen = response.notification.request.content.data?.screen;
        if (screen === "day-close") {
          router.push("/day-close");
        }
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return {
    expoPushToken,
    notification,
  };
};
