# 少人数でスマホからAI検索を試す

Issue #99。2026-10-07更新。合意した上限は **全員で3回・1アカウント1回** です。

## 現在の状態

アプリの既存公開先は **https://driveplus-fbc33.web.app/** です。
2026-10-07にCloudflare Worker・D1を接続して公開しました。メール確認済みアカウントと参加コードで利用できます。実際のHTTPS版でログイン・参加・本人用の結果取得と未認証拒否を検査しました。テスター用の有料検索は未使用（公開時点で残り3回）です。最新の公開状況はIssue #99に記録します。

運営者のCloudflareアカウント作成・メール確認・CLIログインは完了しています。今行うことは、依頼者からテスターへのURL・参加コードの案内です。有料プランへの変更は行っていません。開発側からテスターへの連絡は行いません。

参加コードは、設定元の `letsgoanywhere/.local-research/public-search/participation-code.txt` にあります。ファイル内の1行をテスターにだけ渡します。APIキーや環境設定ファイルを渡す必要はありません。テスターはアプリ内のメール登録を使い、Cloudflareへの登録は不要です。

## 公開後に試す3操作

1. **参加する。** 上のURLをSafari／Chromeで開き、「まずは見てみる」→「AI検索の参加・ログイン」。初めてなら自分のメールで登録し、届いたメールのリンクを開いて確認します。共有機能のアカウントがあれば同じメールでログインできます。案内された参加コードと、検索条件の送信・保存の確認を入力します。
2. **新しく探す。** 「見つける」で目的地の都道府県と、気になる場所・したいことを入力し、「Webで候補を探す」。OpenAI・Claudeが各最大10件を調べます。出典不足のときは少なくなり、同じ店は確認できる範囲でまとめます。写真・料金・営業状況の確定情報はまだ取得していません。
3. **保存して比べる。** ハート→「好みに寄せたおすすめ」→詳細・出典を確認。再度見たいときは「前回の比較結果を開く（無料）」。共有したい候補は「行きたい」の共有リストから選びます。相手の参加方法は[共有の3ステップ](SHARED_WISHLIST_CLOUD.md)です。

App StoreやExpo Goのインストールは不要です。Macを起動しておく必要もありません。iPhoneにインストールした開発アプリは別のビルドなので、このHTTPS版とは分けて確認します。

## 費用・保存・上限

- 新しい比較検索1回で、OpenAI・Anthropicへ各1リクエスト、Web検索は各最大2回、出力は各最大6,000トークン。費用は運営側のAPI利用枠です。総額3,000円の方針を維持します。回数制限は円建ての請求上限と同じ意味ではありません。実請求は各社Usageで確認します。
- サーバーが送信前に枠を確保します。通信失敗・回答失敗・途中終了でも1回として数えます。連打・再読み込み・再デプロイで回数を戻しません。再試行・追加検索・回答修復を自動で行いません。
- 前回結果は本人だけが7日間開けます。検索条件と候補はCloudflare D1に保存し、期限後の読み取り時と毎日の処理で削除します。回数台帳（UIDのハッシュ・日時・状態）は検証終了まで残すので、期限切れで再検索できるわけではありません。生のAI応答・メール・パスワードはD1へ保存しません。
- 保存した「行きたい」と好みは端末内に残ります。地域・希望だけをAIへ送り、学習・不安・GPS現在地・共有相手・いいね履歴は自動送信しません。
- ページ再読み込み後はログインと参加コードを入れ直します。参加コードとログイン情報をlocalStorageへ保存しません。別アカウントへの切替時は検索結果を消します。
- 3回を使い切ったら止まります。台帳の削除・別DBへの差替え・新アカウント作成で上限を回避しないでください。次の枠は費用・品質を確認して別途決めます。

## フィードバックの渡し方

テスターは「何をしようとしたか／どの画面で迷ったか／期待した結果／実際の結果」を、端末・ブラウザと一緒に依頼者へ伝えてください。必要なスクリーンショットはメール・参加コード・招待URL・個人的なメモを隠します。自動の行動記録・分析送信は追加していません。

観察では、候補が希望に合うか、保存の理由を選び直せるか、元情報へたどれるか、相手との共有が理解できるかを確認します。実在や営業状況の誤りは出典と分けて記録します。

## 開発側の接続・公開手順

作業ブランチを用意し、Node/npmはCONTRIBUTING.mdに合わせます。

```bash
npm ci
npm run cloudflare:login
```

ブラウザで本人がCloudflareへの接続を許可します。パスワード・トークンはチャットに貼りません。`wrangler whoami --json`で接続先アカウントを確認し、無料プランを維持します。

1. Cloudflareで検証専用D1 `driveplus-search-pilot` を一つ作る。既にあれば再利用し、回数台帳を引き継ぐ。`wrangler d1 list` で重複がないか確認し、必要な場合だけ `wrangler d1 create driveplus-search-pilot --location apac` を使う。
2. アカウントのWorkerサブドメインを確認し、Git対象外 `.env.dogfood.local` に以下を記入。実際の値はIssueに貼る必要はない。

```dotenv
CLOUDFLARE_ACCOUNT_ID=アカウントID
DRIVEPLUS_D1_DATABASE_ID=検証用DBのUUID
DRIVEPLUS_SEARCH_ORIGIN=https://driveplus-search-pilot.実際のサブドメイン.workers.dev
```

3. `.env.firebase.local` と `.env.research.local` のあるディレクトリを指定して準備する。既存のローカル検索台帳は変更しない。

```bash
npm run dogfood:prepare -- /Users/seyamayoshihiko/Desktop/letsgoanywhere
```

設定元には `.env.dogfood.local` も必要です。接続設定・Secret用JSON・参加コードはGit対象外で作られます。参加コードの原本は設定元ディレクトリの `.local-research/public-search/participation-code.txt` に置きます。別の作業ブランチでもこの原本を再利用し、勝手に再発行しません。`tools/public-search/wrangler.local.json` は初期状態で検索停止です。

```bash
npx wrangler d1 migrations apply driveplus-search-pilot --remote --config tools/public-search/wrangler.local.json
npx wrangler deploy --config tools/public-search/wrangler.local.json
npx wrangler secret bulk .local-research/public-search/secrets.json --config tools/public-search/wrangler.local.json
```

4. ローカルとCIの検査結果を確認する。Secretの値・参加コードはログや成果物に含めない。テスター用3回を開発確認で消費せず、公開後の読み取り・未認証拒否を確認する。実検索は案内したテスターの明示操作で行う。
5. コミット済み・作業ツリーがクリーンな状態で公開版をビルドし、配信前のHostingバージョンを控える。

```bash
npm run build:firebase
npm run dogfood:hosting
npx firebase deploy --only hosting --config .firebase/hosting-dogfood.json --project driveplus-fbc33
```

生成したHosting設定は、確定したWorkerのHTTPSオリジンだけをCSPへ追加します。Firestore Rules・既存データは変更しません。FirebaseをBlazeへ変更しません。

6. 配信された `release.json` がビルドと一致し、ログイン入口・参加・無料の状態取得と権限拒否を確認する。準備できたらローカルWorker設定の `SEARCH_ENABLED` を文字列 `"true"` にして同じWorkerへ再デプロイする。台帳はそのまま使う。
7. `.local-research/public-search/participation-code.txt` の内容を、依頼者がテスターにだけ渡す。参加コードはAIの秘密キーではないが、検索枠への入口なので一般公開しない。

### 止める・戻す

検索だけ止めるときは `SEARCH_ENABLED: "false"` にして同じWorkerへデプロイします。前回結果は保存期間内なら読み取れます。Hostingを戻す場合はFirebase ConsoleのHostingリリース履歴から直前の検証済み版へ戻します。D1・Firestore・Authを削除して復旧しません。

テスト終了後の結果削除は `UPDATE attempts SET result = NULL` で行い、回数台帳は消しません。アカウントの削除を希望する人がいた場合は既存の共有リストの扱いを確認し、#29の方針に沿って個別対応します。

## 検証

```bash
npm run test:public-search
npm run test:dogfood
npm run test:research
npm run test:discovery-search
npm run format:check
npm run build
```

公開APIはローカルSQLiteとCloudflare実行環境＋D1で、3回上限・同時操作・認証・参加コード・本人限定結果・7日失効・停止・失敗時の枠消費を検査。画面はFirebase Auth Emulatorと架空の検索応答で、PC Chromium／スマホ幅Chromium／WebKitを確認します。本物のiPhoneでの操作とは区別します。追加の有料API呼び出しはありません。

一般公開向けのアカウント管理・不正利用対策・監視・運営ルールは #29 / #31 / #40 の後続です。この少人数検証で本運用完了にはしません。

## 公式資料

- [Cloudflare Workers料金・無料枠](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1料金・無料枠](https://developers.cloudflare.com/d1/platform/pricing/)
- [Firebase Auth：トークンから本人情報を確認](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info)
- [OpenAI APIキーをサーバー側で管理する](https://developers.openai.com/api/reference/overview)
