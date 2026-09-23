import XCTest

/// Uses the installed, bundled app and real WKWebView/Preferences plugins.
/// Run on a dedicated simulator; this flow changes sample data.
final class DrivePlusUITests: XCTestCase {
    @MainActor
    func testBundledApp() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let exact = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            let button = exact.exists ? exact : controls.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            if !button.exists { print(app.debugDescription) }
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<8 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) {
            capture("01-welcome")
            tap("まずは見てみる")
        }
        for tab in ["行きたい", "車を探す", "学ぶ", "講習", "見つける"] { tap(tab) }
        capture("02-discover")
        tap("探す地域を変更")
        tap("すべての地域")
        tap("この地域で探す")
        let unsave = controls.matching(NSPredicate(format: "label == %@", "富士山と、湖畔の小さな旅を保存解除")).firstMatch
        if !unsave.exists { tap("富士山と、湖畔の小さな旅を保存") }
        tap("行きたい")
        XCTAssertTrue(unsave.waitForExistence(timeout: 10))
        capture("03-saved")
        app.terminate()
        app.launch()
        tap("行きたい")
        XCTAssertTrue(unsave.waitForExistence(timeout: 10))
        tap("車を探す")
        let pin = controls.matching(NSPredicate(format: "label CONTAINS %@", "の詳細カード")).firstMatch
        XCTAssertTrue(pin.waitForExistence(timeout: 10))
        pin.tap()
        capture("04-map")
        tap("講習")
        tap("詳細を見る")
        tap("希望日時を相談")
        let memo = web.textViews.firstMatch
        XCTAssertTrue(memo.waitForExistence(timeout: 10))
        memo.tap()
        memo.typeText("Simulator memo ")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        capture("05-keyboard")
        let done = app.buttons["完了"].exists ? app.buttons["完了"] : app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
        tap("共有する内容を確認")
        XCTAssertTrue(web.staticTexts["共有内容の確認"].firstMatch.waitForExistence(timeout: 10))
        capture("06-sharing-review")
        tap("戻る")
        XCTAssertTrue((memo.value as? String ?? "").contains("Simulator memo"))
        app.terminate()
        app.launch()
        tap("講習")
        tap("詳細を見る")
        tap("希望日時を相談")
        XCTAssertTrue((memo.value as? String ?? "").contains("Simulator memo"))
        capture("07-memo-restored")
    }

    @MainActor
    func testExternalBrowserReturn() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        func tap(_ label: String) {
            let button = web.buttons[label].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 10), label)
            for _ in 0..<8 {
                if button.isHittable { break }
                web.swipeUp()
            }
            button.tap()
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("行きたい")
        tap("SNSで見つけた場所を追加")
        let url = web.textFields["投稿のURL"]
        XCTAssertTrue(url.waitForExistence(timeout: 10))
        url.tap()
        url.typeText("https://example.com/")
        let urlDone = app.buttons["完了"].exists ? app.buttons["完了"] : app.buttons["Done"]
        urlDone.tap()
        tap("行きたいに追加")
        if web.buttons["保存済みリンクを見る"].exists { tap("保存済みリンクを見る") }
        tap("元の投稿を確認")
        let link = web.links["元のページを開く"]
        XCTAssertTrue(link.waitForExistence(timeout: 10))
        link.tap()
        // Wait for the native browser toolbar; the React confirmation dialog
        // also has a Close button while the presentation is animating.
        let browserBar = app.otherElements["TopBrowserBar"]
        XCTAssertTrue(browserBar.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Example Domain"].waitForExistence(timeout: 15))
        let browserDone = browserBar.buttons.matching(NSPredicate(format: "label IN %@", ["閉じる", "完了", "Done", "Close"])).firstMatch
        XCTAssertTrue(browserDone.waitForExistence(timeout: 10))
        capture("08-external-browser")
        // Safari is a remote view; use its screen frame for the tap coordinate.
        let closeFrame = browserDone.frame
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: closeFrame.midX, dy: closeFrame.midY)).tap()
        XCTAssertTrue(browserBar.waitForNonExistence(timeout: 10))
        tap("アプリに戻る")
        XCTAssertTrue(web.buttons["SNSで見つけた場所を追加"].exists)
        capture("09-returned-to-app")
    }
}
