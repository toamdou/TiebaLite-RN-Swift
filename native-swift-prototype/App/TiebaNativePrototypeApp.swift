import SwiftUI
import TiebaNativePrototype

@main
struct TiebaNativePrototypeApp: App {
    var body: some Scene {
        WindowGroup {
            TiebaAppView()
                .reduceMotionEnvironment()
        }
    }
}
