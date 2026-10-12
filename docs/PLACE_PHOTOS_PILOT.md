# 3店舗だけで実際の写真を確かめる（Issue #118）

まず京都のイノダコーヒ本店・スマート珈琲店（寺町）・小川珈琲堺町錦店の3店舗に限り、Google Mapsに登録された写真を1枚ずつ確認します。対象外・同じ店舗か不明・写真なし・失敗時は#116のイラストです。

今回はMac内の検証画面です。一般公開版・iPhoneアプリは引き続きイラストです。実写真と費用を確認した後で、3店舗に限定した公開版への接続を検討します。Google写真を既存の保存・共有データに入れません。

## あなたにお願いする準備

1. [Google Cloud Console](https://console.cloud.google.com/)を開き、Googleアカウントでログインします。
2. 上部のプロジェクト選択→「新しいプロジェクト」。例：`driveplus-photos-pilot`を作ります。既存のFirebaseプロジェクト`driveplus-fbc33`は変更しません。
3. 検証用プロジェクトの「お支払い」で請求先アカウントを設定します。Google Placesは無料枠で試す場合も請求先設定が必要です。カード・契約の操作はご本人が行ってください。
4. 「APIとサービス」→「ライブラリ」で **Places API (New)** を検索し、「有効にする」を押します。
5. 「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」。キーを編集し、「APIの制限」で **Places API (New)のみ**に制限します。今回のサーバーはMacなので、アプリケーションの制限を使う場合はMacの外向きIPアドレスでの制限です。Webサイトのリファラー制限やiOSアプリ制限とは異なります。
6. このMacの `/Users/seyamayoshihiko/Desktop/letsgoanywhere/.env.photos.local` を開き、`GOOGLE_PLACES_API_KEY=`の右側に保存します。キーはチャット・GitHubに貼らないでください。OpenAI・Anthropic・Firebaseのキーは使いません。
7. 「保存しました」と伝えてください。こちらで接続確認し、3店舗の実取得へ進めます。すでに検証画面を開いている場合は「設定状況を再確認」でキーの保存を検知します。

Google側の無料枠・上限・請求アラートも確認してください。**請求アラートだけでは自動停止しません。** 今回は別途、アプリ側で各店舗1回・合計3回の取得に限定しています。

## 確認URLと起動

実装ブランチのターミナルで、Node.js 24.20.0を使います。

```sh
npm run photos:dev
```

http://127.0.0.1:5186/#/photo-pilot

ブランチ用の作業フォルダは `/tmp/driveplus-issue118` です。キーのファイルは上記letsgoanywhere側と共有しています。一般的な `npm run dev`・静的ビルド・公開サーバーでは写真取得機能は有効になりません。

1. 店名・住所・店舗公式の案内を確認します。3店舗は写真の照合用に選定したもので、AIが今回推薦した候補ではありません。
2. 各店舗の「このお店の写真を確認する」を1回押します。店名と住所が一意に一致した場合だけ、Google Photosへ進みます。
3. 写真がその店舗に合うか、Google Maps・撮影者・元の写真へのリンクが表示されるかを確認します。

取得後は画面を閉じる前に確認してください。写真や写真URLは保存せず、画面を離れると破棄します。リロードして再取得はできません。再取得が必要になった場合は理由と費用を確認してから対応し、勝手に回数をリセットしません。

## 費用・取得上限

2026-10-12に[Google公式料金表](https://developers.google.com/maps/billing-and-pricing/pricing)と[Text Searchの項目別料金](https://developers.google.com/maps/documentation/places/web-service/text-search)を確認しました。

- 使用項目：`places.id,places.displayName,places.formattedAddress,places.photos`。Text Search Proに該当。初段階の単価は1,000件あたり32米ドル、毎月の無料枠5,000件。
- Place Details Photos：1,000件あたり7米ドル、毎月の無料枠1,000件。
- 今回の上限は店舗検索3回＋写真取得3回。無料枠を使い切っていた場合の掲載単価による小計は **0.117米ドル**。税金・為替・同じ請求先の他の使用量などは別です。実請求額の確定はGoogle Cloud側で行います。
- ページ送り・再試行・複数写真・他店舗の取得はしません。画像の表示・撮影者アイコンの読み込みはGoogleの配信先へ直接接続します。
- 取得前に`.local-research/place-photos-v1/`へ店舗ごとの実行枠を原子的に記録します。再起動や複数タブでも枠を再利用しません。失敗・通信断も枠を消費します。
- 記録するのは実行日時・自前の店舗ID・状態・APIへの送信試行数だけ。キー・Googleの応答本文・写真・写真URL・写真参照名は書きません。APIへの送信前に計上するため、通信失敗時の数字は実課金の上限見積もりです。

## 写真を間違えないための実装

[対象店舗データ](../src/data/photoPilotPlaces.json)は店舗公式の住所を転記しています。Google側の表記と照合するときも店名だけでは採用せず、市・区・町名・番地が一致し、候補が1件だけの場合に限定します。表記揺れにより正しい候補が不採用になることはありますが、自動で別支店に差し替えません。

対象の情報源：

- [イノダコーヒ本店](https://www.inoda-coffee.co.jp/shop/honten/)
- [スマート珈琲店](https://www.smartcoffee.jp/information)
- [小川珈琲堺町錦店](https://www.oc-ogawa.co.jp/nishiki/)

写真と写真URLは現在開いているカードの表示状態だけに保持します。localStorage・Preferences・Firestore・Git・配信ファイルには保存しません。API応答は`Cache-Control: no-store`。期限切れや画像エラーは自動で再検索せずイラストへ戻します。

[Googleの写真API仕様](https://developers.google.com/maps/documentation/places/web-service/place-photos)と[出典・撮影者・保存制限](https://developers.google.com/maps/documentation/places/web-service/policies)に沿って、Google Maps・利用可能な撮影者情報・個別の元写真リンクを表示します。店舗の写真が取れたことを、最新の営業・メニュー・設備の確認済みという意味では使いません。

## 次の段階

- Googleキー設定後の実取得・画像の店舗一致・実請求は未確認。結果をIssue #118に記録します。
- 一般公開のおすすめ・保存・詳細に接続する場合は、3店舗との照合、ログイン・回数制限、写真の一時取得、利用規約・プライバシー案内を公開環境に実装します。この段階では現在のWorker・DB・Firebaseプラン・検索回数を変更しません。
