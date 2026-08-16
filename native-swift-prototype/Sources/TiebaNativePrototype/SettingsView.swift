import Foundation
import SwiftUI

// MARK: - Settings root

public struct SettingsView: View {
    @AppStorage("followSystemDarkMode") private var followSystemDarkMode = true
    @AppStorage("darkMode") private var darkMode = false
    @AppStorage("hapticFeedback") private var hapticFeedback = true
    @AppStorage("incognitoMode") private var incognitoMode = false
    @AppStorage("useBuiltInBrowser") private var useBuiltInBrowser = true
    @AppStorage("exploreAutoRefresh") private var exploreAutoRefresh = true
    @AppStorage("defaultStartTab") private var defaultStartTab = "home"
    @AppStorage("homePageShowHistoryForum") private var showHistoryForum = true
    @AppStorage("hideExplore") private var hideExplore = false
    @AppStorage("showFollowedOnly") private var showFollowedOnly = false
    @AppStorage("forumSingleColumn") private var forumSingleColumn = false
    @AppStorage("imageLoadType") private var imageLoadType = "auto"
    @AppStorage("imageWatermark") private var imageWatermark = "none"
    @AppStorage("darkenImageInDarkMode") private var darkenImageInDarkMode = false
    @AppStorage("showBothUsername") private var showBothUsername = true
    @AppStorage("showShortcutInThread") private var showShortcutInThread = true
    @AppStorage("hideReply") private var hideReply = false
    @AppStorage("defaultSort") private var defaultSort = "reply"
    @AppStorage("hideBlockedContent") private var hideBlockedContent = true
    @AppStorage("blockVideo") private var blockVideo = false

    @Environment(\.appTheme) private var theme
    @StateObject private var themeStore = ThemeStore.shared

    public init() {}

    public var body: some View {
        NavigationStack {
            Form {
                Section("外观") {
                    Toggle("跟随系统深色模式", isOn: $followSystemDarkMode)
                    Toggle("深色模式", isOn: Binding(
                        get: { themeStore.isDark },
                        set: { themeStore.setDarkMode($0) }
                    ))
                        .disabled(followSystemDarkMode)
                    NavigationLink {
                        ThemeSettingsView()
                    } label: {
                        Label("主题设置", systemImage: "paintpalette")
                    }
                    NavigationLink {
                        CustomThemeSettingsView()
                    } label: {
                        Label("自定义主题", systemImage: "paintbrush.pointed")
                    }
                }

                Section("通用") {
                    Toggle("震动反馈", isOn: $hapticFeedback)
                    Toggle("无痕模式", isOn: $incognitoMode)
                    Toggle("使用内置浏览器", isOn: $useBuiltInBrowser)
                    Toggle("自动刷新动态", isOn: $exploreAutoRefresh)
                    Picker("默认启动页", selection: $defaultStartTab) {
                        Text("首页").tag("home")
                        Text("动态").tag("explore")
                        Text("消息").tag("notifications")
                        Text("我的").tag("profile")
                    }
                }

                Section("首页") {
                    Toggle("显示历史吧", isOn: $showHistoryForum)
                    Toggle("隐藏发现页", isOn: $hideExplore)
                    Toggle("只显示关注", isOn: $showFollowedOnly)
                    Toggle("贴吧单列布局", isOn: $forumSingleColumn)
                }

                Section("浏览") {
                    Picker("图片加载策略", selection: $imageLoadType) {
                        Text("智能").tag("auto")
                        Text("原图").tag("original")
                        Text("省流量").tag("low")
                    }
                    Picker("图片水印", selection: $imageWatermark) {
                        Text("无").tag("none")
                        Text("用户名").tag("user")
                        Text("时间").tag("time")
                    }
                    Toggle("暗色模式暗化图片", isOn: $darkenImageInDarkMode)
                }

                Section("贴子") {
                    Picker("默认排序", selection: $defaultSort) {
                        Text("回复时间").tag("reply")
                        Text("发帖时间").tag("time")
                        Text("热门").tag("hot")
                    }
                    Toggle("显示两个用户名", isOn: $showBothUsername)
                    Toggle("贴内显示快捷按钮", isOn: $showShortcutInThread)
                    Toggle("隐藏回复框", isOn: $hideReply)
                }

                Section("内容") {
                    Toggle("隐藏屏蔽内容", isOn: $hideBlockedContent)
                    Toggle("屏蔽视频", isOn: $blockVideo)
                    NavigationLink {
                        BlockSettingsView()
                    } label: {
                        Label("屏蔽设置", systemImage: "hand.raised")
                    }
                }

                Section("账号") {
                    NavigationLink {
                        AccountSettingsView()
                    } label: {
                        Label("账号管理", systemImage: "person.crop.circle")
                            .glassCard(padding: 8)
                    }
                }

                Section("功能") {
                    NavigationLink {
                        HabitSettingsView()
                    } label: {
                        Label("使用习惯", systemImage: "list.bullet.rectangle")
                            .glassCard(padding: 8)
                    }
                    NavigationLink {
                        OKSignSettingsView()
                    } label: {
                        Label("一键签到", systemImage: "checkmark.circle")
                            .glassCard(padding: 8)
                    }
                }
            }
            .navigationTitle("设置")
            .navigationBarTitleDisplayMode(.inline)
            .tint(theme.primary)
        }
        .preferredColorScheme(followSystemDarkMode ? nil : (darkMode ? .dark : .light))
    }
}

// MARK: - Theme settings

public struct ThemeSettingsView: View {
    @AppStorage("followSystemDarkMode") private var followSystemDarkMode = true
    @AppStorage("darkMode") private var darkMode = false
    @AppStorage("fontScale") private var fontScale = 1.0
    @AppStorage("lightTheme") private var lightTheme: ThemeName = .tieba
    @AppStorage("darkTheme") private var darkTheme: ThemeName = .blueDark

    @StateObject private var themeStore = ThemeStore.shared

    public init() {}

    public var body: some View {
        Form {
            Section("显示") {
                Toggle("跟随系统", isOn: $followSystemDarkMode)
                Toggle("深色模式", isOn: darkModeBinding)
                    .disabled(followSystemDarkMode)
            }

            Section("浅色主题") {
                Picker("主题", selection: $lightTheme) {
                    ForEach(ThemeName.lightOptions, id: \.self) { theme in
                        Text(theme.settingsTitle).tag(theme)
                    }
                }
                .pickerStyle(.inline)
                .onChange(of: lightTheme) { _, newValue in
                    if !followSystemDarkMode, !darkMode {
                        themeStore.setTheme(newValue)
                    }
                }
            }

            Section("暗色主题") {
                Picker("主题", selection: $darkTheme) {
                    ForEach(ThemeName.darkOptions, id: \.self) { theme in
                        Text(theme.settingsTitle).tag(theme)
                    }
                }
                .pickerStyle(.inline)
                .onChange(of: darkTheme) { _, newValue in
                    if !followSystemDarkMode, darkMode {
                        themeStore.setTheme(newValue)
                    }
                }
            }

            Section("阅读") {
                HStack {
                    Text("阅读字号")
                    Slider(value: $fontScale, in: 0.8...1.5, step: 0.05)
                    Text(String(format: "%.2f", fontScale))
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            Section("半透明") {
                HStack {
                    Text("毛玻璃透明度")
                    Slider(
                        value: Binding(
                            get: { themeStore.translucentAlpha },
                            set: { themeStore.setTranslucentAlpha($0) }
                        ),
                        in: 0.2...1.0,
                        step: 0.05
                    )
                    Text(String(format: "%.0f%%", themeStore.translucentAlpha * 100))
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            Section("自定义主题") {
                NavigationLink {
                    CustomThemeSettingsView()
                } label: {
                    Label("自定义主题", systemImage: "paintbrush.pointed")
                }
                Label("当前主色 \(themeStore.customPrimaryColor)", systemImage: "paintpalette")
                    .foregroundStyle(.secondary)
                Label("当前主题 \(themeStore.themeName.settingsTitle)", systemImage: "paintpalette")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("主题设置")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(followSystemDarkMode ? nil : (darkMode ? .dark : .light))
    }

    private var darkModeBinding: Binding<Bool> {
        Binding(
            get: { themeStore.isDark },
            set: { isOn in
                themeStore.setDarkMode(isOn)
                themeStore.setTheme(isOn ? darkTheme : lightTheme)
            }
        )
    }
}

fileprivate struct CustomThemeSettingsView: View {
    @AppStorage("toolbarPrimaryColor") private var toolbarPrimaryColor = false
    @AppStorage("statusBarFontDark") private var statusBarFontDark = false
    @State private var hexInput = "#2563EB"
    @State private var showInvalidColor = false
    @StateObject private var themeStore = ThemeStore.shared

    private let presets = [
        "#2563EB",
        "#007AFF",
        "#30D158",
        "#FF2D55",
        "#FF9500",
        "#AF52DE",
        "#3A3A3C",
        "#FFFFFF",
    ]

    var body: some View {
        Form {
            Section("主色") {
                TextField("颜色", text: $hexInput)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 40), spacing: 10)], spacing: 10) {
                    ForEach(presets, id: \.self) { hex in
                        Button {
                            hexInput = hex
                            themeStore.setCustomPrimaryColor(hex)
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(Color(hexString: hex) ?? .gray)
                                if hexInput.caseInsensitiveCompare(hex) == .orderedSame {
                                    Image(systemName: "checkmark")
                                        .font(.caption.bold())
                                        .foregroundStyle(.white)
                                }
                            }
                            .frame(width: 40, height: 40)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Section("工具栏") {
                Toggle("工具栏使用主色调", isOn: $toolbarPrimaryColor)
                Toggle("状态栏深色字体", isOn: $statusBarFontDark)
                    .disabled(!toolbarPrimaryColor)
            }

            Section {
                Button {
                    let trimmed = hexInput.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard Color(hexString: trimmed) != nil else {
                        showInvalidColor = true
                        return
                    }
                    themeStore.setCustomPrimaryColor(
                        trimmed.hasPrefix("#") ? trimmed : "#" + trimmed
                    )
                } label: {
                    Label("应用自定义主题", systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .navigationTitle("自定义主题")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            hexInput = themeStore.customPrimaryColor
        }
        .alert("颜色格式无效", isPresented: $showInvalidColor) {
            Button("好", role: .cancel) {}
        } message: {
            Text("请输入 #RRGGBB 格式的颜色。")
        }
    }
}

// MARK: - Account settings

public struct AccountSettingsView: View {
    @State private var accounts = [
        PreviewAccount(name: "apple_fan", displayName: "果粉小明"),
        PreviewAccount(name: "digi_user", displayName: "数码爱好者"),
    ]
    @State private var currentAccountID: UUID?
    @State private var accountToRemoveID: UUID?
    @State private var showRemoveConfirmation = false
    @State private var showLogoutConfirmation = false

    public init() {}

    public var body: some View {
        Form {
            Section("当前账号") {
                ForEach(accounts) { account in
                    Button {
                        currentAccountID = account.id
                    } label: {
                        HStack {
                            Image(systemName: "person.crop.circle")
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading) {
                                Text(account.displayName)
                                Text("@\(account.name)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if account.id == currentAccountID {
                                Image(systemName: "checkmark")
                                    .fontWeight(.semibold)
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            accountToRemoveID = account.id
                            showRemoveConfirmation = true
                        } label: {
                            Label("移除", systemImage: "trash")
                        }
                    }
                    .confirmationDialog(
                        "移除账号",
                        isPresented: $showRemoveConfirmation,
                        titleVisibility: .visible
                    ) {
                        Button("移除", role: .destructive) {
                            if let accountToRemoveID {
                                accounts.removeAll { $0.id == accountToRemoveID }
                                if currentAccountID == accountToRemoveID {
                                    currentAccountID = nil
                                }
                                self.accountToRemoveID = nil
                            }
                        }
                        Button("取消", role: .cancel) {
                            accountToRemoveID = nil
                        }
                    }
                }
            }

            Section {
                Button {
                    accounts.append(PreviewAccount(name: "new_user", displayName: "新用户"))
                } label: {
                    Label("添加账号", systemImage: "plus")
                }
            }

            Section {
                Button(role: .destructive) {
                    showLogoutConfirmation = true
                } label: {
                    Label("退出登录", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .confirmationDialog(
                    "退出登录",
                    isPresented: $showLogoutConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("退出登录", role: .destructive) {
                        currentAccountID = nil
                    }
                    Button("取消", role: .cancel) {}
                }
            }
        }
        .navigationTitle("账号管理")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if currentAccountID == nil, let first = accounts.first {
                currentAccountID = first.id
            }
        }
    }
}

fileprivate struct PreviewAccount: Identifiable {
    let id: UUID
    let name: String
    let displayName: String

    init(name: String, displayName: String) {
        self.id = UUID()
        self.name = name
        self.displayName = displayName
    }
}

// MARK: - Block settings

public struct BlockSettingsView: View {
    private enum BlockMode: String, CaseIterable, Identifiable, Hashable {
        case words
        case users

        var id: String { rawValue }

        var title: String {
            switch self {
            case .words:
                return "屏蔽词"
            case .users:
                return "屏蔽用户"
            }
        }
    }

    @State private var mode: BlockMode = .words
    @State private var input = ""
    @State private var useRegex = false
    @State private var whitelist = false
    @State private var words = ["广告", "引流"]
    @State private var users = ["user_1001", "user_1002"]
    @State private var showInvalidRegex = false

    public init() {}

    public var body: some View {
        Form {
            Section("过滤") {
                Picker("类型", selection: $mode) {
                    ForEach(BlockMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                Toggle("使用正则表达式", isOn: $useRegex)
                Toggle("白名单", isOn: $whitelist)
            }

            Section("添加") {
                TextField(mode == .words ? "屏蔽词" : "用户名或 UID", text: $input)
                    .autocorrectionDisabled()
                Button {
                    addItem()
                } label: {
                    Label("添加", systemImage: "plus.circle")
                }
            }

            Section(mode.title) {
                ForEach(currentItems, id: \.self) { item in
                    Label(item, systemImage: mode == .words ? "text.quote" : "person.crop.circle")
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                removeItem(item)
                            } label: {
                                Label("删除", systemImage: "trash")
                            }
                        }
                }
            }
        }
        .navigationTitle("屏蔽设置")
        .navigationBarTitleDisplayMode(.inline)
        .alert("正则表达式无效", isPresented: $showInvalidRegex) {
            Button("好", role: .cancel) {}
        } message: {
            Text("请输入有效的正则表达式。")
        }
    }

    private var currentItems: [String] {
        mode == .words ? words : users
    }

    private func addItem() {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if useRegex {
            do {
                _ = try NSRegularExpression(pattern: trimmed)
            } catch {
                showInvalidRegex = true
                return
            }
        }
        if mode == .words {
            words.append(trimmed)
        } else {
            users.append(trimmed)
        }
        input = ""
        useRegex = false
    }

    private func removeItem(_ item: String) {
        if mode == .words {
            words.removeAll { $0 == item }
        } else {
            users.removeAll { $0 == item }
        }
    }
}

// MARK: - Habit settings

public struct HabitSettingsView: View {
    @AppStorage("homePageShowHistoryForum") private var showHistoryForum = true
    @AppStorage("hideExplore") private var hideExplore = false
    @AppStorage("showFollowedOnly") private var showFollowedOnly = false
    @AppStorage("forumSingleColumn") private var forumSingleColumn = false
    @AppStorage("incognitoMode") private var incognitoMode = false
    @AppStorage("useBuiltInBrowser") private var useBuiltInBrowser = true
    @AppStorage("exploreAutoRefresh") private var exploreAutoRefresh = true
    @AppStorage("defaultStartTab") private var defaultStartTab = "home"
    @AppStorage("showBothUsername") private var showBothUsername = true
    @AppStorage("showShortcutInThread") private var showShortcutInThread = true
    @AppStorage("hideReply") private var hideReply = false
    @AppStorage("defaultSort") private var defaultSort = "reply"

    public init() {}

    public var body: some View {
        Form {
            Section("首页") {
                Toggle("显示历史吧", isOn: $showHistoryForum)
                Toggle("隐藏发现页", isOn: $hideExplore)
                Toggle("只显示关注", isOn: $showFollowedOnly)
                Toggle("贴吧单列布局", isOn: $forumSingleColumn)
            }

            Section("浏览") {
                Toggle("无痕模式", isOn: $incognitoMode)
                Toggle("使用内置浏览器", isOn: $useBuiltInBrowser)
                Toggle("自动刷新动态", isOn: $exploreAutoRefresh)
                Picker("默认启动页", selection: $defaultStartTab) {
                    Text("首页").tag("home")
                    Text("动态").tag("explore")
                    Text("消息").tag("notifications")
                    Text("我的").tag("profile")
                }
            }

            Section("贴子") {
                Picker("默认排序", selection: $defaultSort) {
                    Text("回复时间").tag("reply")
                    Text("发帖时间").tag("time")
                    Text("热门").tag("hot")
                }
                Toggle("显示两个用户名", isOn: $showBothUsername)
                Toggle("贴内显示快捷按钮", isOn: $showShortcutInThread)
                Toggle("隐藏回复框", isOn: $hideReply)
            }
        }
        .navigationTitle("使用习惯")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - One-tap sign-in settings

public struct OKSignSettingsView: View {
    @AppStorage("autoSign") private var autoSign = false
    @AppStorage("slowSignMode") private var slowSignMode = false
    @AppStorage("failAutoStop") private var failAutoStop = true
    @AppStorage("useOfficialBatchSign") private var useOfficialBatchSign = false
    @State private var signTime = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: Date()) ?? Date()

    public init() {}

    public var body: some View {
        Form {
            Section("自动签到") {
                Toggle("每日自动签到", isOn: $autoSign)
                DatePicker("签到时间", selection: $signTime, displayedComponents: .hourAndMinute)
                    .disabled(!autoSign)
                Toggle("慢速模式", isOn: $slowSignMode)
                Toggle("失败自动停止", isOn: $failAutoStop)
                Toggle("使用官方批量签到", isOn: $useOfficialBatchSign)
            }

            Section("立即签到") {
                Button("立即签到") {}
            }
        }
        .navigationTitle("一键签到")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Theme names

fileprivate extension ThemeName {
    static let lightOptions: [ThemeName] = [
        .tieba,
        .blue,
        .black,
        .pink,
        .red,
        .purple,
        .translucent,
        .custom,
    ]

    static let darkOptions: [ThemeName] = [
        .dark,
        .blueDark,
        .greyDark,
        .amoledDark,
        .custom,
    ]

    var settingsTitle: String {
        switch self {
        case .tieba:
            return "贴吧蓝"
        case .blue:
            return "蓝色"
        case .black:
            return "黑色"
        case .pink:
            return "粉色"
        case .red:
            return "红色"
        case .purple:
            return "紫色"
        case .dark:
            return "深色"
        case .blueDark:
            return "蓝色深色"
        case .greyDark:
            return "灰色深色"
        case .amoledDark:
            return "OLED 深色"
        case .translucent:
            return "半透明"
        case .custom:
            return "自定义"
        }
    }
}

// MARK: - Preview

#Preview("设置") {
    SettingsView()
        .environment(\.appTheme, .lightPalette)
}
