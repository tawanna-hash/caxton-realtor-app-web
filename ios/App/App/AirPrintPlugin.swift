import Foundation
import Capacitor
import UIKit
import WebKit

/// AirPrint plugin for Capacitor.
///
/// Presents the native iOS print dialog (UIPrintInteractionController)
/// using the current WKWebView's content as the print source.
///
/// This bypasses the SFSafariViewController workaround — the print dialog
/// opens directly from the app with one tap, no browser redirect needed.
@objc(AirPrint)
class AirPrintPlugin: CAPPlugin {

    /// Present the native print dialog with the current WebView content.
    ///
    /// - Parameter call: CAPPluginCall. Options:
    ///   - jobName (String, optional): print job name shown in the dialog
    @objc func printWebView(_ call: CAPPluginCall) {
        let jobName = call.getString("jobName") ?? "Realty News Now"

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin instance deallocated")
                return
            }

            guard let webView = self.webView else {
                call.reject("WebView not available")
                return
            }

            let printController = UIPrintInteractionController.shared
            printController.printFormatter = webView.viewPrintFormatter()

            let printInfo = UIPrintInfo(dictionary: nil)
            printInfo.outputType = .general
            printInfo.jobName = jobName
            printController.printInfo = printInfo
            printController.showsPaperSelectionForLoadedPapers = true

            // Present from the root view controller
            guard let rootVC = self.getRootViewController() else {
                call.reject("Could not find root view controller")
                return
            }

            printController.present(animated: true) { (_, completed, error) in
                if let error = error {
                    call.reject("Print failed: \(error.localizedDescription)")
                } else if completed {
                    call.resolve()
                } else {
                    // User cancelled — not an error, just resolve
                    call.resolve()
                }
            }
        }
    }

    /// Find the topmost view controller to present the print dialog from.
    private func getRootViewController() -> UIViewController? {
        guard let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) else {
            return UIApplication.shared.keyWindow?.rootViewController
        }
        var root = window.rootViewController
        while let presented = root?.presentedViewController {
            root = presented
        }
        return root
    }
}
