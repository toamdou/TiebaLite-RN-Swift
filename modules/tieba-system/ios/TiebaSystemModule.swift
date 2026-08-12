import ExpoModulesCore
import Foundation
import UIKit

public final class TiebaSystemModule: Module {
  private var powerStateObserver: NSObjectProtocol?
  private var memoryWarningObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("TiebaSystem")

    Events("onLowPowerModeChange", "onMemoryWarning")

    // Snapshot read — the current low power state. The event stream below
    // keeps JS subscribers in sync afterwards, so JS never needs to poll.
    AsyncFunction("getLowPowerMode") { () -> Bool in
      ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    // Observers are attached only while at least one JS listener exists
    // (StartObserving/StopObserving pair), so a silent app holds no
    // NotificationCenter slots. All notifications are delivered on the main
    // thread, which matches the JS event delivery path.
    StartObserving {
      // Low Power Mode toggle: Settings → Battery, Control Center, or the
      // automatic 20% / 80% prompt. NSProcessInfo is the single source of
      // truth for the state.
      self.powerStateObserver = NotificationCenter.default.addObserver(
        forName: NSProcessInfo.powerStateDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent(
          "onLowPowerModeChange",
          ["enabled": ProcessInfo.processInfo.isLowPowerModeEnabled]
        )
      }

      // iOS memory warning — the system asks for a cooperative purge before
      // it starts terminating our app. JS responds by clearing the
      // expo-image memory cache (see src/app/_layout.tsx).
      self.memoryWarningObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didReceiveMemoryWarningNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onMemoryWarning")
      }
    }

    StopObserving {
      stopObserving(&self.powerStateObserver)
      stopObserving(&self.memoryWarningObserver)
    }
  }

  private func stopObserving(_ observer: inout NSObjectProtocol?) {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
    }
    observer = nil
  }
}
