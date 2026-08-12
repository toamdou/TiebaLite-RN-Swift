"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.withWidgetFiles = void 0;
const config_plugins_1 = require("@expo/config-plugins");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
const plist_1 = require("./plist");
/**
 * Copy the canonical SwiftUI sources into `ios/<widgetName>/` and write the
 * extension's `Info.plist` + `<widgetName>.entitlements`.
 *
 * Uses `withDangerousMod('ios', ...)` because we're writing real files to the
 * prebuilt `ios/` directory (the `xcode` mod only edits the pbxproj, it can't
 * create the Swift files the Sources phase references). The mod runs BEFORE the
 * xcodeproj mod is committed — Expo orders `dangerous` mods ahead of the typed
 * `xcodeproj` mod within a platform — so by the time the target's Sources phase
 * is wired up, the files already exist on disk.
 *
 * Everything here is idempotent: copying overwrites with identical bytes and
 * `mkdir` is recursive, so re-running `expo prebuild` is a no-op in effect.
 */
const withWidgetFiles = (config, { widgetName, appGroup }) => (0, config_plugins_1.withDangerousMod)(config, [
    "ios",
    (cfg) => {
        const projectRoot = cfg.modRequest.projectRoot;
        const platformRoot = cfg.modRequest.platformProjectRoot; // <root>/ios
        const targetDir = path.join(platformRoot, widgetName);
        fs.mkdirSync(targetDir, { recursive: true });
        // 1. Copy the three first-party Swift sources into the extension.
        const packageRoot = (0, paths_1.getPackageRoot)();
        for (const source of (0, paths_1.getExtensionSwiftSources)(packageRoot)) {
            if (!fs.existsSync(source.absolutePath)) {
                throw new Error(`[tieba-live-activity] Expected Swift source not found: ${source.absolutePath}. ` +
                    `Check that 'modules/tieba-native/ios' and 'plugins/live-activity' are present.`);
            }
            fs.copyFileSync(source.absolutePath, path.join(targetDir, source.basename));
        }
        // 2. Write the extension Info.plist. We set the keys explicitly (rather
        //    than relying solely on GENERATE_INFOPLIST_FILE) so the NSExtension
        //    point is guaranteed correct — a wrong/absent NSExtensionPointIdentifier
        //    is the classic "extension builds but never renders" failure.
        const infoPlist = (0, plist_1.buildPlist)({
            CFBundleDevelopmentRegion: "$(DEVELOPMENT_LANGUAGE)",
            CFBundleDisplayName: widgetName,
            CFBundleExecutable: "$(EXECUTABLE_NAME)",
            CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
            CFBundleInfoDictionaryVersion: "6.0",
            CFBundleName: "$(PRODUCT_NAME)",
            CFBundlePackageType: "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
            CFBundleShortVersionString: "$(MARKETING_VERSION)",
            CFBundleVersion: "$(CURRENT_PROJECT_VERSION)",
            NSExtension: {
                NSExtensionPointIdentifier: "com.apple.widgetkit-extension",
            },
        });
        fs.writeFileSync(path.join(targetDir, "Info.plist"), infoPlist);
        // 3. Write the extension entitlements. App Groups only when requested;
        //    Live Activities themselves do not require an app group, so the file
        //    is an empty <dict/> otherwise (the build setting still references it).
        const entitlements = appGroup
            ? (0, plist_1.buildPlist)({
                "com.apple.security.application-groups": [appGroup],
            })
            : (0, plist_1.buildPlist)({});
        fs.writeFileSync(path.join(targetDir, `${widgetName}.entitlements`), entitlements);
        // Surface where things landed; helps when debugging an EAS prebuild log.
        void projectRoot;
        return cfg;
    },
]);
exports.withWidgetFiles = withWidgetFiles;
