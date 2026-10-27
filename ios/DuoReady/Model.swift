import Foundation

/// One App Store app as returned by Apple's public iTunes lookup API.
struct AppReport: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var seller: String
    var url: String
    var icon: String
    var version: String
    var released: Date
    var ratings: Int
    var genre: String
    var notes: String
    var checkedAt: Date

    var assessment: Assessment { Assessment(for: self) }
}

/// Letterbox estimate from the release date vs the iOS 27.1 SDK timeline.
struct Assessment {
    enum Level: String { case bad, maybe, good }

    /// App Store began accepting builds from the Xcode 27.1 RC (iOS 27.1 SDK) on this date.
    static let sdkRC = ISO8601DateFormatter().date(from: "2026-10-05T00:00:00Z")!

    let level: Level
    let title: String
    let detail: String

    init(for app: AppReport) {
        let mentionsDuo = app.notes.range(
            of: #"\b(iphone\s*duo|duo|fold(able|ed|ing)?|inner (display|screen)|unfold)\b"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
        let days = Calendar.current.dateComponents([.day], from: app.released, to: .now).day ?? 0
        if mentionsDuo && app.released >= Self.sdkRC {
            level = .good
            title = "Duo update shipped"
            detail = "The latest release is on the 27.1 SDK timeline and its notes mention Duo or folding."
        } else if app.released < Self.sdkRC {
            level = .bad
            title = "Likely letterboxed"
            detail = "Last updated \(days) days ago, before the iOS 27.1 SDK was accepted. On the inner display it opens as a phone-sized window with black bars."
        } else {
            level = .maybe
            title = "Rebuilt, not confirmed"
            detail = "Updated after the 27.1 SDK shipped, but the notes don't mention Duo. Open it unfolded to confirm."
        }
    }
}

enum LookupError: LocalizedError {
    case notFound
    var errorDescription: String? { "No iOS app found for that link or name." }
}

/// Talks to https://itunes.apple.com (public, no key). Results are kept on device only.
enum Lookup {
    private struct Response: Decodable { let results: [Item] }
    private struct Item: Decodable {
        let trackId: Int
        let trackName: String
        let sellerName: String?
        let artistName: String?
        let trackViewUrl: String
        let artworkUrl100: String?
        let version: String?
        let currentVersionReleaseDate: Date?
        let userRatingCount: Int?
        let primaryGenreName: String?
        let releaseNotes: String?
    }

    static func check(_ raw: String) async throws -> AppReport {
        let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        var comps = URLComponents(string: "https://itunes.apple.com/lookup")!
        let country = input.firstMatch(of: #/apps\.apple\.com\/([a-z]{2})\//#)?.1 ?? "us"
        if let id = input.firstMatch(of: #/id(\d{6,12})/#)?.1 ?? input.wholeMatch(of: #/(\d{6,12})/#)?.1 {
            comps.queryItems = [.init(name: "id", value: String(id)), .init(name: "country", value: String(country))]
        } else {
            comps.path = "/search"
            comps.queryItems = [.init(name: "term", value: input), .init(name: "entity", value: "software"),
                                .init(name: "limit", value: "1"), .init(name: "country", value: "us")]
        }
        let (data, _) = try await URLSession.shared.data(from: comps.url!)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let item = try decoder.decode(Response.self, from: data).results.first else { throw LookupError.notFound }
        return AppReport(
            id: String(item.trackId),
            name: item.trackName,
            seller: item.sellerName ?? item.artistName ?? "",
            url: item.trackViewUrl,
            icon: item.artworkUrl100 ?? "",
            version: item.version ?? "?",
            released: item.currentVersionReleaseDate ?? .distantPast,
            ratings: item.userRatingCount ?? 0,
            genre: item.primaryGenreName ?? "",
            notes: String((item.releaseNotes ?? "").prefix(1200)),
            checkedAt: .now
        )
    }
}

/// Small JSON-in-AppStorage history so results survive relaunch and fold/unfold.
enum History {
    static func decode(_ raw: String) -> [AppReport] {
        guard let data = raw.data(using: .utf8) else { return [] }
        let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601
        return (try? d.decode([AppReport].self, from: data)) ?? []
    }
    static func encode(_ apps: [AppReport]) -> String {
        let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601
        return (try? e.encode(apps)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }
}

/// The readiness checklist from Apple's iPhone Duo guidance.
struct ChecklistItem: Identifiable {
    let id: String
    let title: String
    let why: String

    static let all: [ChecklistItem] = [
        .init(id: "sdk", title: "Build with Xcode 27.1 (iOS 27.1 SDK)", why: "Older SDKs run in a letterboxed compatibility window on the inner display."),
        .init(id: "sizeclass", title: "Lay out by size class, not orientation", why: "The inner display is near-square; orientation checks pick the wrong layout."),
        .init(id: "split", title: "Use NavigationSplitView or ViewThatFits", why: "Gives the 7.6\" screen a real detail pane instead of a stretched list."),
        .init(id: "state", title: "Preserve state across fold and unfold", why: "Use @SceneStorage / state restoration so the user lands where they were."),
        .init(id: "safearea", title: "Respect asymmetric safe areas", why: "Camera and hinge regions differ per side; never hard-code insets."),
        .init(id: "multiwindow", title: "Support Split View on iPhone", why: "Duo can show two apps side by side; fixed widths break."),
        .init(id: "sheets", title: "Check sheets, popovers and the tab bar", why: "Presentations resize; fixed-height sheets clip on the inner display."),
        .init(id: "screens", title: "Capture Duo screenshots", why: "Required for App Store submissions from April 2027."),
    ]
}
