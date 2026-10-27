import SwiftUI

@main
struct DuoReadyApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Sidebar + detail. On the outer display (compact width) NavigationSplitView collapses
/// to a stack; on Duo's inner display (regular width) the detail gets its own pane.
struct RootView: View {
    // Survives fold/unfold and scene restoration.
    @SceneStorage("selection") private var selection: String = "lab"
    @SceneStorage("draft") private var draft: String = ""
    @AppStorage("history") private var historyRaw: String = "[]"
    @AppStorage("checklist") private var checklistRaw: String = ""
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    private var history: [AppReport] { History.decode(historyRaw) }

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            Sidebar(selection: Binding(get: { Optional(selection) }, set: { selection = $0 ?? "lab" }),
                    draft: $draft, history: history, onChecked: record)
        } detail: {
            NavigationStack { detail }
        }
        .navigationSplitViewStyle(.balanced)
        .tint(Color(red: 0.89, green: 0.64, blue: 0.17))
    }

    @ViewBuilder private var detail: some View {
        switch selection {
        case "checklist":
            ChecklistView(raw: $checklistRaw)
        case "lab":
            LayoutLabView()
        default:
            if let app = history.first(where: { $0.id == selection }) {
                ReportView(app: app)
            } else {
                ContentUnavailableView("Check an app", systemImage: "rectangle.split.2x1",
                                       description: Text("Paste an App Store link in the sidebar."))
            }
        }
    }

    private func record(_ app: AppReport) {
        var list = history.filter { $0.id != app.id }
        list.insert(app, at: 0)
        historyRaw = History.encode(Array(list.prefix(20)))
        selection = app.id
    }
}

struct Sidebar: View {
    @Binding var selection: String?
    @Binding var draft: String
    let history: [AppReport]
    let onChecked: (AppReport) -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        List(selection: $selection) {
            Section {
                HStack {
                    TextField("App Store link or name", text: $draft)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit(run)
                    if busy { ProgressView() } else {
                        Button("Check", action: run).disabled(draft.isEmpty)
                    }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            } header: { Text("Is it letterboxed?") }

            Section("Tools") {
                Label("Layout lab", systemImage: "rectangle.split.2x1").tag("lab")
                Label("Readiness checklist", systemImage: "checklist").tag("checklist")
            }

            if !history.isEmpty {
                Section("Checked") {
                    ForEach(history) { app in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(app.name).lineLimit(1)
                                Text(app.released, style: .date).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            LevelBadge(level: app.assessment.level)
                        }
                        .tag(app.id)
                    }
                }
            }
        }
        .navigationTitle("DuoReady")
    }

    private func run() {
        let input = draft
        guard !input.isEmpty else { return }
        busy = true; error = nil
        Task {
            do { onChecked(try await Lookup.check(input)) }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

struct LevelBadge: View {
    let level: Assessment.Level
    var body: some View {
        Text(level == .bad ? "BARS" : level == .good ? "READY" : "CHECK")
            .font(.caption2.monospaced().weight(.semibold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
    private var color: Color { level == .bad ? .red : level == .good ? .green : .orange }
}

struct ReportView: View {
    let app: AppReport

    var body: some View {
        let a = app.assessment
        ScrollView {
            // Inner display: facts sit beside the verdict. Outer display: stacked.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 24) { verdict(a).frame(minWidth: 320); facts.frame(minWidth: 280) }
                VStack(alignment: .leading, spacing: 20) { verdict(a); facts }
            }
            .padding()
            .frame(maxWidth: 900)
        }
        .navigationTitle(app.name)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if let url = URL(string: app.url) {
                    ShareLink(item: url)
                    Link(destination: url) { Image(systemName: "arrow.up.forward.app") }
                }
            }
        }
    }

    private func verdict(_ a: Assessment) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                AsyncImage(url: URL(string: app.icon)) { $0.resizable() } placeholder: { Color.secondary.opacity(0.2) }
                    .frame(width: 60, height: 60).clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading) {
                    Text(app.name).font(.title2.bold())
                    Text(app.seller).foregroundStyle(.secondary)
                }
            }
            FoldGlyph(letterboxed: a.level == .bad).frame(height: 110)
            Text(a.title).font(.title3.bold())
            Text(a.detail).foregroundStyle(.secondary)
        }
    }

    private var facts: some View {
        VStack(alignment: .leading, spacing: 10) {
            LabeledContent("Version", value: app.version)
            LabeledContent("Last release") { Text(app.released, style: .date) }
            LabeledContent("Ratings", value: app.ratings.formatted(.number.notation(.compactName)))
            LabeledContent("Category", value: app.genre)
            if !app.notes.isEmpty {
                Text("Release notes").font(.headline).padding(.top, 6)
                Text(app.notes).font(.callout).foregroundStyle(.secondary)
            }
        }
    }
}

/// A tiny inner-display drawing: phone-width window with bars, or a full-width app.
struct FoldGlyph: View {
    let letterboxed: Bool
    var body: some View {
        GeometryReader { geo in
            let h = geo.size.height, w = h * 1.1
            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(.black)
                RoundedRectangle(cornerRadius: letterboxed ? 2 : 10)
                    .fill(LinearGradient(colors: [.orange, .yellow.opacity(0.7)], startPoint: .top, endPoint: .bottom))
                    .frame(width: letterboxed ? w * 0.42 : w - 8, height: h - 8)
            }
            .frame(width: w, height: h)
        }
        .accessibilityLabel(letterboxed ? "Letterboxed: black bars on both sides" : "Fills the inner display")
    }
}

struct ChecklistView: View {
    @Binding var raw: String
    private var done: Set<String> { Set(raw.split(separator: ",").map(String.init)) }

    var body: some View {
        List {
            Section {
                ProgressView(value: Double(done.count), total: Double(ChecklistItem.all.count)) {
                    Text("\(done.count) of \(ChecklistItem.all.count) ready")
                }
            }
            ForEach(ChecklistItem.all) { item in
                Button { toggle(item.id) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: done.contains(item.id) ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(done.contains(item.id) ? Color.green : Color.secondary)
                            .font(.title3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).foregroundStyle(.primary)
                            Text(item.why).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Readiness checklist")
    }

    private func toggle(_ id: String) {
        var s = done
        if s.contains(id) { s.remove(id) } else { s.insert(id) }
        raw = s.sorted().joined(separator: ",")
    }
}

/// Live readout of what the current display gives the app. Fold the phone to watch it change.
struct LayoutLabView: View {
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.verticalSizeClass) private var vSize
    @SceneStorage("labCounter") private var counter = 0

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(hSize == .regular ? "Regular width: you have room for two panes."
                                           : "Compact width: one column, like the outer display.")
                        .font(.title3.bold())
                    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                        row("Horizontal size class", hSize == .regular ? "regular" : "compact")
                        row("Vertical size class", vSize == .regular ? "regular" : "compact")
                        row("Width × height", "\(Int(geo.size.width)) × \(Int(geo.size.height)) pt")
                        row("Aspect", String(format: "%.2f", geo.size.width / max(geo.size.height, 1)))
                        row("Safe area L / R", "\(Int(geo.safeAreaInsets.leading)) / \(Int(geo.safeAreaInsets.trailing))")
                        row("Safe area T / B", "\(Int(geo.safeAreaInsets.top)) / \(Int(geo.safeAreaInsets.bottom))")
                    }
                    .font(.body.monospacedDigit())
                    Divider()
                    Text("State test").font(.headline)
                    Text("Tap a few times, then fold or unfold. If the count survives, @SceneStorage is doing its job.")
                        .foregroundStyle(.secondary)
                    Button("Count: \(counter)") { counter += 1 }.buttonStyle(.borderedProminent)
                }
                .padding()
            }
        }
        .navigationTitle("Layout lab")
    }

    private func row(_ k: String, _ v: String) -> some View {
        GridRow { Text(k).foregroundStyle(.secondary); Text(v).bold() }
    }
}
