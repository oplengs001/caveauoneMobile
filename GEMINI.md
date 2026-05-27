# Gemini Workspace Instructions: warehouse-app

This document provides conventions and instructions for working on the `warehouse-app` project.

## Project Overview

This is a React Native mobile application built with Expo for warehouse management. It is designed to run on iOS, Android, and web platforms. The app includes features for camera interaction, local storage, and Firebase integration.

## Tech Stack

- **Framework**: [Expo](https://expo.dev/) / [React Native](https://reactnative.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/)
- **Backend Services**: [Firebase](https://firebase.google.com/)
- **Linting**: [ESLint](https://eslint.org/) with Expo configuration
- **Icons**: [Lucide React Native](https://github.com/lucide-icons/lucide/tree/main/packages/lucide-react-native)

## Project Structure

- **`app/`**: This directory likely contains all the routes and screens of the application, following the file-based routing convention of Expo Router.
- **`components/`**: This is the recommended location for reusable React components used across different screens.
- **`assets/`**: Should contain static assets like fonts, images, and icons.
- **`constants/`**: For storing constant values like colors, styles, or configuration variables.
- **`lib/` or `utils/`**: Intended for shared utility functions, such as Firebase initialization or helper functions.

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Configure Environment**:
    - If your app uses Firebase or other services requiring API keys, create a `.env` file in the root directory to store them.
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
