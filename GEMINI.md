# Gemini Workspace Instructions: warehouse-app

This document provides conventions and instructions for working on the `warehouse-app` project.

## Project Overview

This is a comprehensive React Native mobile application built with Expo, designed to support intricate operations for both **warehouse management** and **store management**. It features a dynamic, role-based interface that adapts for "warehouse" or "store" users, running seamlessly on iOS, Android, and web platforms. The app integrates advanced inventory handling, location tracking, request processing, and sales fulfillment, all powered by Firebase Firestore and leveraging QR code scanning for efficient data input and management.

## Tech Stack

- **Framework**: [Expo](https://expo.dev/) / [React Native](https://reactnative.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/)
- **Backend Services**: [Firebase](https://firebase.google.com/) (Authentication, Firestore Database)
- **Linting**: [ESLint](https://eslint.org/) with Expo configuration
- **Icons**: [Lucide React Native](https://github.com/lucide-icons/lucide/tree/main/packages/lucide-react-native)
- **Theming/Constants**: Custom theme definitions (`@/constants/theme`)

## Key Functionalities

Based on the project's dependencies and the `home.tsx` component, the `warehouse-app` encompasses the following core functionalities, with a strong emphasis on role-based access and data management:

### Core Application Logic & User Experience

- **Role-Based Interface**: Dynamically adjusts the dashboard and available actions based on the authenticated user's role ("warehouse" or "store"), providing tailored experiences.
- **Authentication & Authorization**: Utilizes Firebase Authentication for user sign-in/out (`useAuth`, `signOut`) and `profile.role` for granular access control and UI rendering.
- **Dynamic Theming**: Applies distinct color themes (`Colors.store` vs. `Colors.warehouse`) to the UI based on the user's operational role.

### Warehouse Operations

- **Wine Intake & QR Scanning**: Supports processing new wine deliveries via "Onboarding Tasks" (`/onboarding`), likely involving scanning QR codes on bottles to add them to inventory.
- **Bottle Tagging & Location Management**: Enables assigning bottles to specific bin locations within the warehouse (`/tagging`).
- **Pullout Requests Fulfillment**: Manages outbound requests and fulfillment tasks for transferring wines from the warehouse to stores (`/pullout`).

### Store Operations

- **Wine Request Creation**: Allows store personnel to initiate requests for specific wines from the warehouse (`/wine-requests`).
- **Stock Management & Inventory Health**: Provides a dashboard for "store" users to monitor "Inventory Health," displaying metrics like:
  - **Stockout Wines**: Items completely out of stock.
  - **PAR Alert Wines**: Items below their predefined PAR levels.
  - **Under Safety Stock**: Items below critical safety stock levels.
    These metrics are calculated from Firestore collections (`wine_requests`, `store_wine_settings`, `master_wines`, `inventory_bottles`).
- **Bottle Sales**: Facilitates the process of selling bottles by scanning them (`/tagging?mode=sell`), likely updating inventory and sales records.
- **Receiving Wines from Pullout**: Handles the receipt and reconciliation of wines transferred from the warehouse.

### General & Technical Functionalities

- **Camera Integration**: Utilizes `expo-camera` for features like scanning QR codes and potentially capturing images of bottles or labels.
- **`QR Code Generation/Scanning`**: Implements QR code generation (using `qrcode`) for inventory items and robust scanning capabilities via the device camera.
- **Local Data Storage**: Leverages `@react-native-async-storage/async-storage` for persistent local data storage within the app, such as user preferences or offline data.
- **File System Operations**: Employs `expo-file-system` for reading, writing, and managing files on the device.
- **Printing Capabilities**: Provides printing functionality using `expo-print`, potentially for labels, reports, or pick lists.
- **Navigation**: Manages application navigation seamlessly across different screens using `expo-router` and `@react-navigation/*` libraries.
- **Backend Integration**: Connects with Firebase Firestore for real-time data synchronization and persistence across various collections (`e.g`., `inventory_bottles`, `master_wines`, `wine_requests`, `stores`, `store_wine_settings`).

## Project Structure

- **`app/`**: Contains all the routes and screens of the application, following Expo Router's file-based routing. Includes nested routes for different operational areas (e.g., `app/(tabs)/home.tsx`).
- **`components/`**: Location for reusable React Native components (e.g., Modals, custom buttons).
- **`context/`**: Houses React Context providers, notably `AuthContext.tsx` for managing authentication state and user profiles.
- **`constants/`**: Stores constant values, including application-wide themes (`theme.ts` or `theme.tsx` containing `Colors`), configuration variables, and magic strings.
- **`assets/`**: Should contain static assets like fonts, images, and icons.
- **`lib/` or `utils/`**: Intended for shared utility functions, such as Firebase initialization (`firebase.ts`), data helpers, or custom hooks.

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Configure Environment**:
    - Create a `.env` file in the root directory. This file should contain your Firebase configuration keys and any other environment-specific variables.
3.  **Run the Application**:
    ```bash
    # Start the development server (Metro)
    npm start
    ```
    After starting the server, use the QR code in the terminal to open the app on your device via the Expo Go app, or select a simulator/emulator.

## Development Workflow

- **Running on Simulators**:

  ```bash
  # Run on an iOS simulator
  npm run ios

  # Run on an Android emulator
  npm run android
  ```

- **Running on a Physical iOS Device**:
  ```bash
  npm run ios-device
  ```
- **Running for Web**:
  ```bash
  npm run web
  ```
- **Linting**: To check your code for style and syntax errors, run:
  ```bash
  npm run lint
  ```
- **Creating Production Builds**: To build the app for submission to the app stores, use EAS CLI:
  ```bash
  # This command builds for both platforms and can submit them automatically
  npm run submit-build
  ```

## Key Conventions

- **Routing**: Adhere strictly to Expo Router's file-based routing system. Define navigation flows by organizing files and folders within the `app/` directory.
- **State Management**: Global application state, particularly user authentication and profile data, is managed via `AuthContext`. Local component state uses React hooks (`useState`, `useReducer`).
- **Data Interaction**: Extensive use of Firebase Firestore for all backend data operations (queries, updates, aggregates). Ensure data models align with Firestore collection structures (`master_wines`, `inventory_bottles`, `wine_requests`, `stores`, `store_wine_settings`).
- **Theming**: Utilize the centralized `Colors` object from `@/constants/theme` to ensure consistent application theming across different user roles.
- **Storage**: `@react-native-async-storage/async-storage` is the preferred method for persisting data locally on the device.
- **Styling**: Use React Native's `StyleSheet.create` for component-specific styles, promoting modularity and readability. Keep styles co-located with their respective components.
