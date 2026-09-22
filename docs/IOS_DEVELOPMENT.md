# iPhoneシミュレーターから実機へ

今のReactの画面をCapacitorでiPhoneアプリに入れました。MacのXcodeに付属する「iPhoneシミュレーター」で確認し、同じプロジェクトを手元のiPhoneにも入れられます。Expo Goは使いません。

```
Reactの画面・サンプル → npm run ios:sync → iPhone用プロジェクト
                                         ├─ Macのシミュレーター
                                         └─ 手元のiPhone（本人の設定が必要）
```

サンプルをアプリに同梱するため、起動にlocalhostやPCの開発サーバーは不要です。施設・地図・会社・教材は引き続きサンプルです。Firebase・本番API・会社への送信は接続していません。

## まずMacで触る

確認環境はNode.js 24.20.0 / npm 11.19.0、Xcode 26.6、iPhone 17 / iOS 26.5シミュレーターです。Capacitor 8はXcode 26以上、アプリはiOS 15以上が対象です。初回の依存ファイル取得にはインターネットが必要です。

この変更のブランチを開き、プロジェクトのフォルダで実行します。

```bash
npm ci
npm run ios:sync
npm run ios:open
```

1. Xcodeが開いたら、上部の実行先で **iPhone 17** 等のシミュレーターを選びます。「Any iOS Device」は実機用なので選びません。
2. 左上の **▶︎** を押します。初回はAppleの依存ファイルを取得するため時間がかかります。
3. シミュレーターが開き、**Drive+ Mock** が起動します。マウスでタップ・ドラッグできます。次回はシミュレーター内のアイコンからも開けます。

ターミナルで機種を選んで起動する場合は `npm run ios:run` も使えます。シミュレーターが未導入ならXcodeのSettings → ComponentsでiOSを追加します。シミュレーターのHardware Keyboardが接続扱いだと画面内キーボードが出ないため、I/O → Keyboard → Toggle Software Keyboardで表示します。

## 変更を反映する

Reactのコードを直したら **`npm run ios:sync` → Xcodeで▶︎** です。Web版のホットリロードと違い、ビルドした画面を再びアプリにコピーします。

- `npm run dev`：従来どおりPCブラウザで確認。
- `npm run ios:sync`：Web画面をビルドし、iOS用プロジェクトへコピー。
- `npm run ios:open`：Xcodeを開く。
- `npm run ios:run`：ビルド・コピー後、選んだ実機またはシミュレーターへ起動。

同じアプリIDで上書きインストールすれば通常は保存が残ります。アプリを削除・初期化したり、別のIDに変えたりすると引き継げません。更新のたびにアンインストールする必要はありません。

## あなたに確認していただく3操作

1. **起動と5タブ**：初回設定か「まずは見てみる」から進み、下の5タブを開く。二重のスマホ枠がなく、上下のボタンを押せる。
2. **保存と再起動**：「見つける」→探す地域を変更→候補のハート→「行きたい」。アプリを終了し、アイコンから開いても残る。出発エリアと探す地域は別の設定。
3. **キーボードと戻る**：「講習」→会社詳細→「希望日時を相談」→メモを入力→キーボードの「完了」→共有内容の確認→戻る。メモが残り、共有前に項目を見直せる。実送信は行わない。

最初から試すときは、プロフィール → 設定 →「モックの保存データを削除」から確認して削除します。そのアプリの保存内容が消える操作です。

## 次に手元のiPhoneへ入れる

ここは本人のApple Accountと端末操作が必要です。シミュレーターで確認してからで構いません。

1. iPhoneをMacへ接続し、端末に出る「このコンピュータを信頼」を選びます。
2. Xcode → Settings → Accountsで、自分のApple Accountを追加します。パスワードやコードをIssueに書かないでください。
3. Xcodeの **App** ターゲット → **Signing & Capabilities** でAutomatically manage signingを有効にし、Teamに自分のPersonal Teamを選びます。アカウント設定は手元だけで扱います。
4. 上部の実行先を自分のiPhoneに切り替えて▶︎を押します。iPhoneから求められた場合は、設定 → プライバシーとセキュリティ → デベロッパモードを有効にし、再起動して許可します。開発者の信頼確認が出た場合も端末上で対応します。
5. アプリのアイコンから起動して上の3操作を試します。通常操作はMacとの接続を外しても使えます。

仮のアプリIDは `org.greekacademy.driveplus.mock` です。署名時にIDが使えないと表示された場合は自分専用のIDへ変更します。`capacitor.config.ts` のappIdとXcodeのBundle Identifierを揃え、再同期します。正式公開用IDは後で決めます。

無料のPersonal Teamで自分の端末を検証できますが、プロビジョニングは7日で期限が切れるため、Xcodeで再ビルド・再インストールします。ストア公開・TestFlightの手続きと費用は今回に含めません。今回の追加サービス費用は0円、累計3,000円の予算を維持します。

## 保存と外部リンクの仕組み

| 項目 | Web版 | 今回のiPhone版 |
| --- | --- | --- |
| 画面 | ブラウザ内のReact | アプリに同梱したReactをWKWebViewで表示 |
| 保存 | localStorage | Capacitor Preferencesを通してiOSのUserDefaultsに保存 |
| データの共有 | そのブラウザの保存領域のみ | そのアプリ内のみ。ブラウザや別端末とは同期しない |
| 外部リンク | 確認後、別タブ等 | 確認後、iOSのブラウザ画面。「閉じる」等で元の画面へ |
| 元データの退避 | エラー時、JSONをダウンロード | エラー時、JSONテキストをiOSの共有画面からコピー等 |

保存の読み込みを終えてから画面を表示します。連続入力は順番に保存し、失敗したら上書きを停止して画面に知らせます。「端末に保存中…」の間に強制終了した入力は残らない場合があります。これは小規模なモック用保存で、暗号化DB・認証情報の保管・クラウドバックアップではありません。実在の個人情報は入力せず、本番の同期・削除・保護は#16・#29・#31で扱います。OS側の端末バックアップ設定に含まれる可能性はありますが、Drive+がサーバーにバックアップする機能はありません。

サンプル施設の公式サイト・外部地図は未確認のため開きません。本人が追加したHTTPSリンクは既存の検査・確認後に開きます。外部サイトを開くとそのサイトとの通信が発生します。メモや回答をURLに追加せず、リンクを開いただけで相談・予約の成立にはしません。ネイティブ版では同じWebViewを外部サイトに置き換える操作を提供しません。

## 開発側の検証と残る確認

- ブラウザのPlaywright：既存Web機能と、保存・外部ブラウザの遅延／失敗を注入した境界のテスト。
- XcodeのXCTest：インストールしたアプリをiPhoneシミュレーターで操作。テストコードは `ios/App/AppUITests/DrivePlusUITests.swift`。
- **本人のiPhoneでのインストール・操作は未確認**。シミュレーターの成功を実機確認済みとは扱いません。

XcodeでProduct → Test（⌘U）から操作テストを実行できます。テストはサンプルの保存・メモを変更するため、確認用のシミュレーターで実行してください。テスト用の分岐やサーバーを本体に埋め込んでいません。

コマンドで実行する場合（シミュレーター名は自分の環境に合わせます）：

```bash
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO test
```

今回の範囲はiPhoneの縦画面。iPad、Android、実機VoiceOver、OSの文字拡大、複数OS・小さい画面での本番検証は後続です。今後は同じReact＋Capacitorの土台でIssueごとの開発を続け、節目にシミュレーターと実機で確認します。ストア公開には別途、情報の利用条件、実データ、本番接続、審査・配布の準備が必要です。

## 公式の参考資料（2026-09-22確認）

- [CapacitorのiOS実行手順](https://capacitorjs.com/docs/ios)
- [必要な開発環境](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Preferencesの保存先と制限](https://capacitorjs.com/docs/apis/preferences)
- [Appleの無料アカウント・Personal Teamの制限](https://developer.apple.com/help/account/basics/about-your-developer-account)
