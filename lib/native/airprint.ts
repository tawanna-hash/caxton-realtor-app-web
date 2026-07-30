// lib/native/airprint.ts
//
// TypeScript interface for the native AirPrint plugin (AirPrintPlugin.swift).
// Uses Capacitor's registerPlugin to create a proxy that calls the native
// UIPrintInteractionController when running inside the iOS app.

import { registerPlugin } from '@capacitor/core';

export interface AirPrintPlugin {
  /**
   * Present the native iOS print dialog using the current WebView's
   * content as the print source. One tap → AirPrint dialog, no
   * SFSafariViewController needed.
   */
  printWebView(options?: { jobName?: string }): Promise<void>;
}

// 'AirPrint' matches the @objc(AirPrint) class name in Swift.
const AirPrint = registerPlugin<AirPrintPlugin>('AirPrint');

export default AirPrint;
