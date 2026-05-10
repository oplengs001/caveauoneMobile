# CaveauOne Mobile (Warehouse & Store)

The universal mobile companion for the CaveauOne Wine Inventory Management System. This cross-platform application (iOS/Android) provides specialized workflows for both warehouse logistics and boutique sommelier operations.

## 🌟 Dual-Role Experience

CaveauOne Mobile dynamically adapts its entire UI/UX based on the user's role:

### 🏭 Warehouse Mode (Industrial Aesthetic)
High-contrast, utility-focused interface designed for rapid warehouse operations.
- **Intake Scanning:** Camera-powered delivery reception with real-time data extraction.
- **Pullout Fulfillment:** Digital task lists for picking and preparing outbound orders.
- **Location Tagging:** Assign physical bottles to bin locations via QR scanning.
- **QR Label Printing:** On-the-spot thermal label generation for newly received stock.

### 🍷 Store Mode (Boutique Aesthetic)
Elegant, premium "Sommelier" interface tailored for boutique storefronts.
- **Wine Requisitions:** Browseable warehouse catalog with real-time stock availability.
- **Request Portal:** Create and track sophisticated wine requisitions for the storefront.
- **Bottle Management:** Mark bottles as "Sold" or update their physical boutique location.
- **Inventory Search:** High-fidelity search for vintages, producers, and SKUs.

## 🚀 Technical Stack

- **Framework:** [Expo 54](https://expo.dev/) & [React Native 0.81](https://reactnative.dev/)
- **Routing:** [Expo Router (File-based)](https://docs.expo.dev/router/introduction/)
- **Scanning:** [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- **Printing:** [Expo Print](https://docs.expo.dev/versions/latest/sdk/print/) (AirPrint/Thermal compatible)
- **Backend:** [Firebase 12](https://firebase.google.com/) (Auth & Firestore)
- **Animations:** [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- **Icons:** [Lucide React Native](https://lucide.dev/)

## 🛠️ Getting Started

### Prerequisites
- Node.js 18.x or later
- Expo Go (for quick testing) or Development Build
- Firebase Project configured for iOS/Android

### Installation

1. **Clone the repository:**
   ```bash
   cd warehouse-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory with your Firebase configuration.

4. **Start the development server:**
   ```bash
   npx expo start
   ```

5. **Run on a device:**
   - Press `i` for iOS Simulator or `a` for Android Emulator.
   - Scan the QR code with the Expo Go app for physical device testing.

## 📁 Project Structure

- `app/`: Expo Router application structure.
  - `(tabs)/`: Primary navigation (Home, Inventory, Scan).
  - `wine-requests/`: Store requisition management logic.
  - `intake/`: Delivery reception and scanning workflows.
  - `tagging/`: Location assignment and status management.
- `components/`: Specialized UI components for Warehouse and Store themes.
- `constants/`: Theme definitions, colors, and global configurations.
- `context/`: Global state management (Auth, Theme).
- `hooks/`: Custom React hooks for Firebase and device sensors.
- `types/`: Shared TypeScript definitions.

## 📄 License

Internal Project - All Rights Reserved © 2026 CaveauOne Logistics.
