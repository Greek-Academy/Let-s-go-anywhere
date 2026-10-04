# ログインとクラウド保存の最小検証

2026-10-04 / Issue #93。Firebaseの管理画面での準備が終わったので、既存の共有体験デモとは別に、実際のログインと本人だけの保存を接続します。

## 今回できること

- 「行きたい」→リスト切替→「ログインして共有の準備」。メールで登録、確認メール、ログイン、パスワード再設定、ログアウト。
- メール確認後、リストの**名前と色**を最大3つ作成・変更・削除。同じアカウントなら別のブラウザで読み直せる構造です。
- 古い画面からの編集は上書きせず、入力を残して読み直しを案内します。通信失敗時は古い一覧を消し、再取得を案内します。
- ログアウト、バックグラウンド、画面を離れた後に古い取得結果が戻っても、前の人の一覧を再表示しません。端末データのリセット時もログアウトします。

**相手への招待・候補の持ち寄り・反応はまだクラウド接続していません。** 端末内デモのそれらの操作は、従来どおりデモです。今回のリストは共有に進む前の本人用の準備データで、端末内デモから自動で移しません。親 #40 を継続します。

## 人間の次の操作は1つ

このMacのFirebase CLIには、管理用Googleアカウントが未登録です。リポジトリのターミナルで次を実行し、開いたブラウザで今回のプロジェクトを作ったGoogleアカウントにログインしてください。

```bash
npm run firebase:login
```

追加のAI機能・利用状況収集の質問は無効で進められます。パスワードやログイントークンをチャットへ貼る必要はありません。完了したら「Firebaseにログインできた」と伝えてください。

開発側で接続先と現在のルールを確認し、テスト済みの `firebase/firestore.rules` を反映します。無断で課金プランを変更せず、HostingやFunctionsのデプロイも行いません。ルール適用前は、アプリでログインできてもリストの保存・取得は拒否されます。

## 開発側の反映手順

1. `npx firebase login:list` と `npx firebase projects:list` で対象アカウント・検証プロジェクトを確認。
2. Firestoreの現行ルールとデータの有無を管理API/Consoleで確認。既存の別用途のルールがある場合は、この検証ルールで上書きせず統合・テストする。
3. 下記テストが成功したコミットのルールを適用する。プロジェクトを省略しない。

```bash
npx firebase deploy --only firestore:rules --project driveplus-fbc33
```

4. ユーザー自身の検証用メールで登録→確認→ログイン→リスト作成→別ブラウザで同じアカウントで取得。ユーザーのパスワードは開発側へ渡さない。
5. Firebase Consoleで利用量を確認して記録。実クラウドの結果はEmulatorの結果とは別にIssueへ追記。

## 起動

```bash
npm ci
npm run dev:firebase
```

- 接続検証版：`http://localhost:5182/#/saved/cloud`
- 普段のモック：`npm run dev`（通常5173番）。こちらではFirebaseの画面と接続を無効化。
- `.env.firebase.local` に接続設定を置く。Git対象外。必要な項目は `DRIVEPLUS_FIREBASE_PROJECT_ID`、`DRIVEPLUS_FIREBASE_API_KEY`、`DRIVEPLUS_FIREBASE_APP_ID`。Web用設定の3項目だけを使い、Analytics・Storage・秘密鍵は使わない。
- FirebaseのWeb用APIキーは接続先を識別するクライアント設定です。Firestoreの保護はAuthとSecurity Rulesが担当します。OpenAIの秘密APIキーと役割が異なります。[Firebase公式](https://firebase.google.com/docs/projects/api-keys)
- `.env.research.local` やWeb検索の残り回数は変更しない。

ビルドは `npm run build:firebase` → `firebase-dist/`。通常ビルドの `dist/` と分け、通常プレビューの配信物検査はFirebase版を拒否します。Firebase版は一般公開・自動デプロイの対象にしません。

## iPhoneへの反映

実クラウドのルール反映とブラウザ確認の後に行います。

```bash
npm run ios:copy:firebase
npm run ios:open
```

Xcodeで対象のSimulator/実機を選んで実行します。`npm run ios:sync` は通常版をビルドするため、その後に実行するとFirebase検証版から通常版へ戻ります。通常版へ戻す際は `npm run ios:sync` を使います。

今回のPRでは実iPhoneのメールアプリとの往復、キーボード、通信断は未確認。PlaywrightのWebKit成功をiPhone実機成功とは扱いません。

## 保存するもの・保存しないもの

| 場所 | 内容 |
| --- | --- |
| Firebase Authentication | 自分で入力したメールアドレス・認証情報。パスワードはFirebaseの認証処理へ送信するが、アプリ独自DB・ログ・localStorageへは保存しない |
| Firestore `wishlistDrafts/{本人UID}/lists/{1・2・3}` | リスト名、色、作成者UID、スキーマ・改訂番号、サーバー作成・更新日時 |
| 従来の端末内保存 | 個人の「行きたい」、検索結果、学習・不安・現在地に関する既存処理、共有デモ。今回のクラウドに自動で移さない |

ログイン状態とFirestoreキャッシュはメモリのみ。アプリ再起動・画面再読み込み後は再ログインします。画面の一覧はサーバーから明示的に取得し、永続キャッシュやリアルタイム購読は使いません。端末内リセットはクラウドのデータを消しません。

検証を片付けるときは、ログイン中に3つまでのリストを削除し、必要ならFirebase ConsoleのAuthenticationで検証アカウントを削除します。招待後の退会・全データ削除・削除途中の再開は #29 / #40 の後続単位です。現段階で一般利用者向けのアカウント削除完成とは扱いません。

## 検証

Java 21以上とNodeは `.nvmrc` に合わせます。Emulatorは `demo-driveplus` だけを使い、実プロジェクトの課金・認証設定やデータには触れません。

```bash
npm run test:firebase:rules
npm run test:firebase:ui
npm run format:check
npm run build
npm run verify:preview
```

権限テストは本人CRUD・メール未確認・他人・未ログイン・3件制限・不正フィールド・サーバー時刻・古い改訂・全体列挙拒否。ブラウザは登録メールの検証→保存→再ログイン、別アカウントの分離、並行編集、再設定、320px幅、通信断、バックグラウンド、端末リセットを確認します。Firebase SDKと実際の権限ルールをローカルのサーバーで動かすテストです。実クラウド・実メールの成功証跡は別途必要です。

CIでは通常アプリの検査に加えて `Firebase emulator and permission tests` を独立実行します。Firebaseログイン・クラウドのキーをCIへ登録しません。

## 残る作業

親 #40 の後続：招待の期限・承認・取り消し・参加者限定権限、候補と反応、退出と権限失効、引き継ぎ、HTTPS招待ページ、2人・別アカウントでの往復確認。一般公開前のApp Check・不正利用対策・プライバシー確認も残ります。無料枠での小規模検証であり、全国運用・継続運用が無料とは断定しません。
