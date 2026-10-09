import XCTest
import CoreLocation

/// Uses the installed, bundled app and real WKWebView/Preferences plugins.
/// Run on a dedicated simulator; this flow changes sample data.
final class DrivePlusUITests: XCTestCase {

    /// Dedicated simulator, Firebase build; stays signed out and never calls a paid API.
    @MainActor
    func testGenreSearchControls() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let exact = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            let button = exact.exists ? exact : controls.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<12 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("見つける")
        tap("探す地域を変更")
        tap("別の駅の周辺")
        let stationInput = web.textFields["探したい駅"]
        XCTAssertTrue(stationInput.waitForExistence(timeout: 10))
        if web.buttons["探したい駅をクリア"].exists { tap("探したい駅をクリア") }
        stationInput.tap()
        stationInput.typeText("しんじゅく")
        let stationOption = web.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "新宿駅（東京都）")).firstMatch
        XCTAssertTrue(stationOption.waitForExistence(timeout: 10))
        let visibleAboveKeyboard = NSPredicate { _, _ in
            stationOption.isHittable && stationOption.frame.maxY <= app.keyboards.firstMatch.frame.minY
        }
        expectation(for: visibleAboveKeyboard, evaluatedWith: stationOption)
        waitForExpectations(timeout: 10)
        let candidates = XCTAttachment(screenshot: app.screenshot())
        candidates.name = "station-autocomplete-native"
        candidates.lifetime = .keepAlways
        add(candidates)
        stationOption.tap()
        let done = app.buttons["完了"].exists ? app.buttons["完了"] : app.buttons["Done"]
        if done.exists { done.tap() }
        tap("この駅の周辺で探す")
        tap("お出かけの絞り込み")
        tap("自然")
        tap("この条件で表示")
        XCTAssertTrue(web.staticTexts["選択中：自然。追加の希望は任意です。"].waitForExistence(timeout: 10))
        tap("Webで候補を探す")
        let loginRequired = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "メール確認と参加コードの入力をしてください")).firstMatch
        XCTAssertTrue(loginRequired.waitForExistence(timeout: 15), "Genre-only input must pass validation and reach the login guard")
        for _ in 0..<3 { web.swipeDown() }
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "genre-only-native"
        shot.lifetime = .keepAlways
        add(shot)
        tap("学ぶ")
        tap("見つける")
    }

    /// Bundled Firebase/AI-search build. Does not log in or spend a search attempt.
    @MainActor
    func testPublicSearchLoginEntry() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let button = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<12 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("見つける")
        tap("AI検索の参加・ログイン")
        XCTAssertTrue(web.textFields["メールアドレス"].waitForExistence(timeout: 15))
        XCTAssertTrue(web.secureTextFields["パスワード"].waitForExistence(timeout: 15))
        tap("新規登録")
        XCTAssertTrue(web.staticTexts["8文字以上で設定してください。"].waitForExistence(timeout: 10))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "public-search-native-login"
        shot.lifetime = .keepAlways
        add(shot)
        web.swipeDown()
        tap("戻る")
        tap("学ぶ")
        tap("見つける")
    }

    /// Firebase build only. Checks the real WKWebView entry without submitting credentials.
    @MainActor
    func testCloudSharingLoginEntry() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let target = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(target.waitForExistence(timeout: 15), label)
            for _ in 0..<10 {
                if target.isHittable { break }
                if label == "ログイン" { web.swipeDown() } else { web.swipeUp() }
            }
            XCTAssertTrue(target.isHittable, label)
            target.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("行きたい")
        tap("リストを切り替える")
        if web.staticTexts["この端末だけの共有体験デモ"].waitForExistence(timeout: 2) {
            throw XCTSkip("Run npm run ios:copy:firebase to test the cloud entry")
        }
        XCTAssertTrue(web.staticTexts["行きたいを共有"].waitForExistence(timeout: 15))
        XCTAssertTrue(web.textFields["メールアドレス"].waitForExistence(timeout: 15))
        tap("新規登録")
        XCTAssertTrue(web.staticTexts["8文字以上で設定してください。"].waitForExistence(timeout: 10))
        web.swipeUp()
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "cloud-sharing-native-registration"
        shot.lifetime = .keepAlways
        add(shot)
        tap("ログイン")
        XCTAssertTrue(web.secureTextFields["パスワード"].waitForExistence(timeout: 10))
    }

    /// A real touch gesture, without tapping an off-screen element (which can auto-scroll).
    @MainActor
    func testHomeTouchScroll() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let exact = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            let button = exact.exists ? exact : controls.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 10), label)
            for _ in 0..<12 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("見つける")
        let title = web.staticTexts["今度の休日、どこに行く？"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        let before = title.frame.minY
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.75))
            .press(forDuration: 0.05, thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.25)))
        XCTAssertLessThan(title.frame.minY, before - 80, "Touch drag must move the page content")
        let bottom = controls.matching(NSPredicate(format: "label CONTAINS %@", "SNSで見つけた")).firstMatch
        for _ in 0..<10 {
            if bottom.isHittable { break }
            web.swipeUp()
        }
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "touch-scroll-home-bottom"
        shot.lifetime = .keepAlways
        add(shot)
        XCTAssertTrue(bottom.isHittable, "The bottom of the home screen must be reachable")
        tap("学ぶ")
    }

    /// Change an unsupported simulator position to a public Japanese station.
    /// XCTest refreshes timestamps itself; stale timestamps are injected in the bridge tests.
    @MainActor
    func testSimulatorLocationRecovery() throws {
        continueAfterFailure = false
        guard #available(iOS 16.4, *) else { throw XCTSkip("Requires location simulation") }
        func setPosition(inJapan: Bool) {
            XCUIDevice.shared.location = XCUILocation(location: CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: inJapan ? 35.6554 : 37.33, longitude: inJapan ? 139.7571 : -122.03),
                altitude: 0, horizontalAccuracy: 10, verticalAccuracy: 10,
                timestamp: Date()))
        }
        setPosition(inJapan: false)
        defer { XCUIDevice.shared.location = nil }
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let button = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 10), label)
            for _ in 0..<10 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("車を探す")
        tap("現在地から探す")
        tap("現在地を取得")
        let unavailable = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "国内の地図表示範囲外")).firstMatch
        XCTAssertTrue(unavailable.waitForExistence(timeout: 35))
        let point = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "取得した現在地")).firstMatch
        XCTAssertFalse(point.exists)
        let before = XCTAttachment(screenshot: app.screenshot())
        before.name = "location-unsupported-simulator"
        before.lifetime = .keepAlways
        add(before)
        setPosition(inJapan: true)
        tap("現在地を取得")
        XCTAssertTrue(point.waitForExistence(timeout: 35))
        let after = XCTAttachment(screenshot: app.screenshot())
        after.name = "location-refreshed-simulator"
        after.lifetime = .keepAlways
        add(after)
    }

    @MainActor
    func testNationwideStations() throws {
        continueAfterFailure = false
        guard #available(iOS 16.4, *) else { throw XCTSkip("Requires location simulation") }
        // Public Hamamatsucho station; never a user's actual location.
        XCUIDevice.shared.location = XCUILocation(location: CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 35.6554, longitude: 139.7571),
            altitude: 0, horizontalAccuracy: 10, verticalAccuracy: 10, timestamp: Date()))
        defer { XCUIDevice.shared.location = nil }
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let button = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<12 {
                if button.isHittable { break }
                if label == "戻る" { web.swipeDown() } else { web.swipeUp() }
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("車を探す")
        if controls.matching(NSPredicate(format: "label == %@", "地図で見る")).firstMatch.waitForExistence(timeout: 3) { tap("地図で見る") }
        tap("車の事業者フィルター")
        tap("条件をリセット")
        tap("この条件で表示")
        tap("浜松町")
        let pin = controls.matching(NSPredicate(format: "label CONTAINS %@", "の詳細カード")).firstMatch
        XCTAssertTrue(pin.waitForExistence(timeout: 20))
        capture("national-01-hamamatsucho")
        tap("全国")
        let cluster = controls.matching(NSPredicate(format: "label CONTAINS %@", "件の拠点を拡大して見る")).firstMatch
        XCTAssertTrue(cluster.waitForExistence(timeout: 20))
        capture("national-02-japan")
        tap("一覧で見る")
        XCTAssertTrue(web.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "件中")).firstMatch.waitForExistence(timeout: 10))
        capture("national-03-list")
        tap("地図で見る")
        tap("現在地から探す")
        tap("現在地を取得")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "アプリの使用中は許可", "Allow While Using App")).firstMatch
        if allow.waitForExistence(timeout: 5) { allow.tap() }
        let point = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "取得した現在地")).firstMatch
        XCTAssertTrue(point.waitForExistence(timeout: 30))
        XCTAssertTrue(pin.waitForExistence(timeout: 20))
        capture("national-04-hamamatsucho-gps")
        pin.tap()
        tap("拠点の詳細・保存へ")
        if controls.matching(NSPredicate(format: "label == %@", "車候補に保存")).firstMatch.waitForExistence(timeout: 3) { tap("車候補に保存") }
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", "車候補から外す")).firstMatch.waitForExistence(timeout: 10))
        capture("national-05-detail")
        tap("戻る")
        XCTAssertTrue(point.waitForExistence(timeout: 10))
    }

    @MainActor
    func testLearningColumns() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let button = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<16 {
                if button.isHittable { break }
                if label == "戻る" { web.swipeDown() } else { web.swipeUp() }
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("学ぶ")
        tap("道中の判断")
        let routeColumn = "曲がり損ねたら、予定を直せばいいを読む"
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", routeColumn)).firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(controls.matching(NSPredicate(format: "label == %@", "借りた車、走り出す前にどこを見る？を読む")).firstMatch.exists)
        capture("columns-01-filter")
        tap(routeColumn)
        XCTAssertTrue(web.staticTexts["こんな場面、ありませんか？"].firstMatch.waitForExistence(timeout: 10))
        capture("columns-02-detail")
        tap("コラム一覧へ戻る")
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", routeColumn)).firstMatch.waitForExistence(timeout: 10))
        tap("同乗者との過ごし方")
        let focusColumn = "「いま集中するね」を、ふたりの合図にを読む"
        tap(focusColumn)
        XCTAssertTrue(web.staticTexts["気づきコラム"].firstMatch.waitForExistence(timeout: 10))
        capture("columns-03-companions")
        tap("戻る")
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", focusColumn)).firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(controls.matching(NSPredicate(format: "label == %@", routeColumn)).firstMatch.exists)
        capture("columns-04-back")
    }

    /// Device-only sharing demo. Run on a dedicated simulator with synthetic data.
    @MainActor
    func testSharedWishlistDemo() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let button = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<18 {
                if button.isHittable { break }
                if label == "戻る" || label == "リストの設定とメンバー" { web.swipeDown() }
                else { web.swipeUp() }
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("行きたい")
        tap("リストを切り替える")
        tap("新しいリストを作る")
        let name = web.textFields["リストの名前"].firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        name.tap()
        name.typeText("Simulator休日")
        // Dismiss the keyboard without submitting a different field.
        web.swipeUp()
        tap("リストを作成")
        tap("リストの設定とメンバー")
        tap("デモの招待を作る")
        tap("招待される側を試す")
        tap("説明を確認して参加申請")
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "候補はまだ見られません")).firstMatch.waitForExistence(timeout: 10))
        tap("作成者として承認を試す")
        tap("参加を承認")
        tap("リストを開く")
        XCTAssertTrue(controls.matching(NSPredicate(format: "label CONTAINS %@", "2人で持ち寄る行きたい")).firstMatch.waitForExistence(timeout: 10))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shared-wishlist-native-approved"
        shot.lifetime = .keepAlways
        add(shot)
        app.terminate()
        app.launch()
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        tap("行きたい")
        tap("リストを切り替える")
        let savedList = controls.matching(NSPredicate(format: "label CONTAINS %@", "Simulator休日")).firstMatch
        XCTAssertTrue(savedList.waitForExistence(timeout: 15))
        savedList.tap()
        XCTAssertTrue(controls.matching(NSPredicate(format: "label CONTAINS %@", "2人で持ち寄る行きたい")).firstMatch.waitForExistence(timeout: 10))
    }

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
        for tab in ["行きたい", "車を探す", "学ぶ", "見つける"] { tap(tab) }
        capture("02-discover")
        tap("探す地域を変更")
        tap("別の駅の周辺")
        let stationInput = web.textFields["探したい駅"]
        XCTAssertTrue(stationInput.waitForExistence(timeout: 10))
        if web.buttons["探したい駅をクリア"].exists { tap("探したい駅をクリア") }
        stationInput.tap()
        stationInput.typeText("河口湖")
        let stationOption = web.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "河口湖駅（山梨県）")).firstMatch
        XCTAssertTrue(stationOption.waitForExistence(timeout: 10))
        stationOption.tap()
        let stationDone = app.buttons["完了"].exists ? app.buttons["完了"] : app.buttons["Done"]
        if stationDone.exists { stationDone.tap() }
        tap("この駅の周辺で探す")
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
        let pin = controls.matching(NSPredicate(format: "label CONTAINS %@", "営業状況は未確認")).firstMatch
        XCTAssertTrue(pin.waitForExistence(timeout: 10))
        pin.tap()
        capture("04-map")
        tap("閉じる")
        tap("学ぶ")
        tap("学習メモを開く")
        let memo = web.textViews.firstMatch
        XCTAssertTrue(memo.waitForExistence(timeout: 10))
        memo.tap()
        memo.typeText("Simulator learning memo ")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        capture("05-learning-keyboard")
        let done = app.buttons["完了"].exists ? app.buttons["完了"] : app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
        tap("学ぶに戻る")
        tap("運転の再開")
        tap("久しぶりの運転は、ペーパードライバー講習で練習しようを読む")
        XCTAssertTrue(web.staticTexts["一人で走り出す前に、教わりながら練習する"].firstMatch.waitForExistence(timeout: 10))
        capture("06-return-to-driving-column")
        tap("コラム一覧へ戻る")
        app.terminate()
        app.launch()
        tap("学ぶ")
        tap("学習メモを開く")
        XCTAssertTrue((memo.value as? String ?? "").contains("Simulator learning memo"))
        capture("07-learning-memo-restored")
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

    /// Opens a real search page, but never submits a reservation or reads live availability.
    /// Run only on a dedicated simulator: category selection is persisted locally.
    @MainActor
    func testCarSearchBrowserReturn() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let exact = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            let button = exact.exists ? exact : controls.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<8 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("車を探す")
        tap("掲載外の地域・拠点を探す")
        let area = web.textFields["探す駅・地域"]
        XCTAssertTrue(area.waitForExistence(timeout: 10))
        let originalArea = area.value as? String
        tap("レンタカー")
        capture("car-search-input")
        tap("外部地図で車を探す")
        let link = web.links["Googleマップで検索する"]
        XCTAssertTrue(link.waitForExistence(timeout: 10))
        for _ in 0..<5 {
            if link.isHittable { break }
            web.swipeUp()
        }
        link.tap()
        let bar = app.otherElements["TopBrowserBar"]
        XCTAssertTrue(bar.waitForExistence(timeout: 20))
        capture("car-search-native-browser")
        let close = bar.buttons.matching(NSPredicate(format: "label IN %@", ["閉じる", "完了", "Done", "Close"])).firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 10))
        let frame = close.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.midX, dy: frame.midY)).tap()
        XCTAssertTrue(bar.waitForNonExistence(timeout: 10))
        tap("アプリに戻る")
        XCTAssertEqual(area.value as? String, originalArea)
        capture("car-search-return")
        app.terminate()
        app.launch()
        tap("車を探す")
        tap("掲載外の地域・拠点を探す")
        XCTAssertTrue(area.waitForExistence(timeout: 10))
        XCTAssertEqual(area.value as? String, originalArea)
    }
    /// Live GSI vector tiles and bundled OSM stations in WKWebView. No GPS/API key/booking.
    /// This changes saved candidates; use the dedicated test simulator only.
    @MainActor
    func testRealStationMap() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let exact = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            let button = exact.exists ? exact : controls.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<8 {
                if button.isHittable { break }
                web.swipeUp()
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("車を探す")
        if controls.matching(NSPredicate(format: "label == %@", "地図で見る")).firstMatch.waitForExistence(timeout: 3) { tap("地図で見る") }
        tap("すべて")
        XCTAssertTrue(web.links["OpenStreetMap contributors"].waitForExistence(timeout: 10))
        for (label, screenshot) in [("京都中心部", "pilot-kyoto"), ("大阪・梅田", "pilot-umeda"), ("滋賀・草津", "pilot-kusatsu")] {
            tap(label)
            let expected = NSPredicate { _, _ in
                !web.staticTexts["地図を読み込んでいます…"].exists && !web.staticTexts["地図を読み込めません。一覧は利用できます。"].exists
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: expected, object: nil)], timeout: 20), .completed)
            tap("一覧で見る")
            XCTAssertTrue(web.staticTexts["借りる場所を探す"].firstMatch.waitForExistence(timeout: 10))
            tap("地図で見る")
            capture(screenshot)
        }
        tap("京都中心部")
        capture("real-map-iphone17")
        let region = web.textFields["駅名・地域から車を探す"]
        XCTAssertTrue(region.waitForExistence(timeout: 10))
        region.tap()
        let current = region.value as? String ?? ""
        region.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count) + "四条烏丸")
        let keyboardDone = app.buttons["完了"].exists ? app.buttons["完了"] : app.buttons["Done"]
        keyboardDone.tap()
        tap("地域を検索")
        tap("地図を拡大")
        tap("移動したエリアで検索")
        tap("カーシェア")
        let pin = controls.matching(NSPredicate(format: "label CONTAINS %@", "・カーシェアの詳細カード")).firstMatch
        XCTAssertTrue(pin.waitForExistence(timeout: 15))
        XCTAssertTrue(pin.isHittable)
        pin.tap()
        XCTAssertTrue(web.staticTexts["この拠点について"].firstMatch.waitForExistence(timeout: 10))
        capture("real-map-station-sheet")
        tap("拠点の詳細・保存へ")
        if controls.matching(NSPredicate(format: "label == %@", "車候補に保存")).firstMatch.exists { tap("車候補に保存") }
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", "車候補から外す")).firstMatch.waitForExistence(timeout: 10))
        capture("real-map-station-detail")
        tap("戻る")
        tap("一覧で見る")
        XCTAssertTrue(web.staticTexts["借りる場所を探す"].firstMatch.waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        tap("行きたい")
        tap("車候補")
        let saved = controls.matching(NSPredicate(format: "label CONTAINS %@", "営業状況は未確認")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        capture("real-map-saved-after-relaunch")
    }

    /// Set the dedicated simulator to the public Shinjuku Station test position,
    /// then reset location permission before running. Never run on a user's simulator.
    @MainActor
    func testCurrentLocation() throws {
        continueAfterFailure = false
        guard #available(iOS 16.4, *) else { throw XCTSkip("Location simulation requires iOS 16.4") }
        // XCTest may override a simctl location with its own default (outside Japan).
        XCUIDevice.shared.location = XCUILocation(location: CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 35.690921, longitude: 139.700258),
            altitude: 0, horizontalAccuracy: 10, verticalAccuracy: 10, timestamp: Date()))
        defer { XCUIDevice.shared.location = nil }
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let controls = web.descendants(matching: .any).matching(NSPredicate(
            format: "elementType == %d OR elementType == %d",
            XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.switch.rawValue))
        func tap(_ label: String) {
            let button = controls.matching(NSPredicate(format: "label == %@", label)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            for _ in 0..<8 {
                if button.isHittable { break }
                if label == "戻る" { web.swipeDown() } else { web.swipeUp() }
            }
            XCTAssertTrue(button.isHittable, label)
            button.tap()
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("車を探す")
        if controls.matching(NSPredicate(format: "label == %@", "地図で見る")).firstMatch.waitForExistence(timeout: 3) { tap("地図で見る") }
        tap("京都中心部")
        tap("すべて")
        tap("現在地から探す")
        tap("現在地を取得")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons.matching(NSPredicate(
            format: "label == %@ OR label == %@", "アプリの使用中は許可", "Allow While Using App")).firstMatch
        if allow.waitForExistence(timeout: 10) {
            capture("location-permission-shinjuku-station")
            allow.tap()
        }
        let point = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "取得した現在地")).firstMatch
        XCTAssertTrue(point.waitForExistence(timeout: 30))
        let ready = NSPredicate { _, _ in !web.staticTexts["地図を読み込んでいます…"].exists }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: ready, object: nil)], timeout: 20), .completed)
        capture("location-shinjuku-station-map")
        // Nationwide maps can cluster nearby pins. The nearest-station card
        // remains available regardless of the current map zoom level.
        let nearbyStation = controls.matching(NSPredicate(format: "label CONTAINS %@", "取得した位置から直線約")).firstMatch
        XCTAssertTrue(nearbyStation.waitForExistence(timeout: 15))
        XCTAssertTrue(nearbyStation.isHittable)
        nearbyStation.tap()
        tap("拠点の詳細・保存へ")
        if controls.matching(NSPredicate(format: "label == %@", "車候補に保存")).firstMatch.waitForExistence(timeout: 3) { tap("車候補に保存") }
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", "車候補から外す")).firstMatch.waitForExistence(timeout: 10))
        tap("戻る")
        XCTAssertTrue(point.waitForExistence(timeout: 10))
        tap("一覧で見る")
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "約2km以内・直線距離順")).firstMatch.waitForExistence(timeout: 10))
        capture("location-shinjuku-station-list")
        tap("地図で見る")
        XCUIDevice.shared.press(.home)
        app.activate()
        let cleared = NSPredicate { _, _ in !point.exists }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: cleared, object: nil)], timeout: 10), .completed)
        app.terminate()
        app.launch()
        tap("車を探す")
        XCTAssertTrue(controls.matching(NSPredicate(format: "label == %@", "現在地から探す")).firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(point.exists)
        capture("location-cleared-after-relaunch")
    }

    /// Run separately after `simctl privacy ... revoke location ...` on the test device.
    @MainActor
    func testDeniedCurrentLocation() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        func tap(_ label: String) {
            let button = web.buttons[label].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            button.tap()
        }
        if web.buttons["まずは見てみる"].waitForExistence(timeout: 3) { tap("まずは見てみる") }
        tap("車を探す")
        tap("現在地から探す")
        tap("現在地を取得")
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "位置情報が許可されていません")).firstMatch.waitForExistence(timeout: 15))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "location-denied"
        shot.lifetime = .keepAlways
        add(shot)
        tap("地域名から探す")
        let point = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "取得した現在地")).firstMatch
        XCTAssertFalse(point.exists)
        tap("一覧で見る")
        XCTAssertTrue(web.staticTexts["借りる場所を探す"].firstMatch.waitForExistence(timeout: 10))
    }

}
