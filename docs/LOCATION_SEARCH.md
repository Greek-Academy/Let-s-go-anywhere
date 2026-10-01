# 現在地から近くの車を探す

> 2026-10-01追記：#83で全国の登録2,927件へ拡張しました。最新の掲載範囲・確認方法は [全国の拠点検索](NATIONAL_STATIONS.md) を参照してください。以下の4地域・45件の範囲は初回検証時の記録です。現在地の許可・一時利用・消去の仕組みは継続します。

2026-09-30 / [Issue #79](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/79)。全国対応前の小規模検証です。[確認画像・結果](reviews/location-pilot/README.md)。

## iPhoneで確認する3つの操作

1. `letsgoanywhere` のXcodeプロジェクトを開き、接続したiPhoneを選んで▶。既にインストールした版は自動更新されないため、今回の版をもう一度インストールします。
2. 「車を探す」→地図の照準マーク→「現在地を取得」→iOSの「1度だけ許可」または「アプリの使用中は許可」。現在地の青い点と、約2km以内の掲載拠点が表示されます。
3. ピン→詳細→保存、「一覧で見る」を試してください。位置情報を使いたくないときは「地域名から探す」で「新宿」などを入力できます。

位置の取得には数秒以上かかる場合があります。精度の目安が1kmを超える場合は、近くの候補を正確に絞れないため地域検索をご案内します。iPhoneの設定 → プライバシーとセキュリティ → 位置情報サービス → Drive+ Mockで、許可と「正確な位置情報」を確認できます。住所の入力をGPS取得成功の代わりに使うことはありません。

Macの確認URL：`http://127.0.0.1:4197/#/cars`。通常の開発URL：`http://127.0.0.1:5173/#/cars`。サーバー起動中のみ利用できます。Macで取得するのはMacの位置です。iPhoneからMacのHTTP LANアドレスを開く方式では位置取得できないことがあるため、iPhoneアプリかHTTPSを使います。

## シミュレーターの位置について

シミュレーターはiPhone実機のGPSを自動で使いません。Simulatorの **Features → Location → Custom Location** でテスト位置を指定します。例として公共の場所である新宿駅付近は緯度 `35.690921`、経度 `139.700258` です。Xcode側で別の位置シミュレーションが指定されている場合はそちらも確認してください。海外の既定位置のままだと「国内の地図表示範囲外」と表示されます。

自動UIテストでは `XCUIDevice.shared.location` でこの公共の駅の位置を明示します。これは検証用の設定であり、アプリの動作にテスト座標を埋め込んでいません。ユーザーの所在地・自宅住所を検証資料に記録しません。

## 何がどこで動くか

```text
利用者が「現在地を取得」を押す
  → iOS / ブラウザが許可を確認
  → 一度だけ位置を返す（継続追跡しない）
  → アプリのメモリに一時的に保持
  → 同梱済み45件から約2km以内を計算し、直線距離順に並べる
  → 地図のピンと一覧に同じ候補を表示
```

- iPhoneの取得窓口：`@capacitor/geolocation` 8.2.2。WebではブラウザのGeolocation APIを利用します。
- `src/platform/location.ts`：一度だけ取得、タイムアウト、座標・時刻・精度の検証、エラーの説明。
- `src/domain/nearbyStations.ts`：約2kmの円で絞り込み、直線距離を計算。経路・走行距離・所要時間ではありません。
- `src/state/LocationSearchState.tsx`：現在地と現在地から移動した地図の位置・範囲をメモリだけで保持。地図／一覧・詳細から戻る間は継続し、非表示・再起動・10分経過・地域検索へ切り替えで消去します。失敗やキャンセル後に遅れて届いた結果は使いません。
- iPhoneのバックグラウンド移行は `@capacitor/app` 8.1.1 の `pause` 通知で検出します。WebのvisibilitychangeだけではWKWebViewで消えないケースがあったため、専用のライフサイクル通知を使っています。[公式仕様](https://capacitorjs.com/docs/apis/app#addlistenerpause-)
- `src/components/RealRentalMap.tsx`：現在地の青い点と、端末から返された精度を半径とする円。常に正確な位置を保証する表示ではありません。
- `src/state/AppState.tsx`：従来どおり保存候補や手動検索条件を保存。GPS由来の地図位置はこの保存先に入れません。車候補の保存はユーザーが明示的に行った拠点IDを残します。

位置情報はバックエンド・拠点検索API・分析基盤に送信しません。ただし、地図背景の取得では国土地理院へ表示区画番号とIPアドレス等が伝わり、閲覧地域を推測できます。端末の測位自体はOSの位置情報サービスに従います。メモリ上の地図タイルキャッシュとブラウザ自身のキャッシュは、現在地の保存とは別です。

## データの範囲と未確認事項

新宿・中野の限定範囲27件を追加しました。京都10件・梅田5件・草津3件と合わせ45件です。全国の拠点をその都度取得するAPIはまだありません。取得範囲内でもOSM未登録の拠点は出ません。候補が0件でも「周辺に拠点が存在しない」とは判定しません。

2026-09-30に開発時だけOverpassから以下の限定範囲を1回取得し、`src/data/shinjuku-car-stations.osm.json` に同梱しました。

```text
[out:json][timeout:20];nwr[amenity~"^(car_rental|car_sharing)$"](35.685,139.665,35.720,139.715);out center;
```

取得先：`https://overpass-api.de/api/interpreter`。基準時刻はJSONの `osm3s.timestamp_osm_base`。座標・OSM ID・種別を検証し、名称・分類等に必要なタグだけ残しています。ノード位置／wayの中心を使い、車の入口や住所とは区別します。名称未登録や古いブランド名、種別が名称と異なる要素も含み、運営による営業確認済みデータにはしていません。

名称・位置・種別の出典は © OpenStreetMap contributors、[ODbL 1.0](https://www.openstreetmap.org/copyright)。元・派生データをアプリの「出典・掲載範囲」で確認できます。空車・料金・営業状況・車両条件は未取得／未確認です。[地図の取得と費用の説明](CAR_SEARCH.md)も参照してください。

## 費用・人間のTODO

追加のAPIキー、有料API、新しいサーバー契約は不要です。今回の追加サービス利用料は0円。端末の通信料・既存機器の費用は別です。全国運用の費用や安定性を保証するものではありません。

今お願いしたいことは **実機で許可して現在地が合うか、近くの候補を探しやすいかの確認** です。施設の選定・写真の許諾確認を今回の前提にはしていません。公開前には掲載情報・更新担当・位置情報の説明を確認します。

残作業は #21（全国の拠点取り込み・更新、閉鎖・移転・重複対応）、#22（全国の駅／地域検索、ピン集約、地図基盤の運用設計）、#8（情報源・公開規模・利用条件の確認）で継続します。

## 開発で再確認する場合

```sh
npm ci
npm run ios:sync
npm run ios:open

npm run build
PLAYWRIGHT_PORT=5197 npm run test:preview -- tests/location-search.spec.ts tests/real-cars.spec.ts tests/map-pilot.spec.ts

# 実地図を小規模に取得する。通常CIは合成タイルで検証。
npm run preview -- --host 127.0.0.1 --port 4197 --strictPort
node scripts/measure-location-pilot.mjs --live
```

iOS UIテストは保存状態を変更するため専用シミュレーターだけで実行します。`testCurrentLocation` は事前にそのアプリのlocation許可をreset、`testDeniedCurrentLocation` はrevokeして別々に実行します。通常の利用者の端末・シミュレーターでは実行しません。

実装時に[Capacitor公式仕様](https://capacitorjs.com/docs/apis/geolocation)を確認。プラグイン要件としてInfo.plistには2種類の位置利用説明を記載しますが、呼び出しはwhen-in-useの一度の取得だけで、Always許可やバックグラウンド追跡は要求しません。[Webの取得条件](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)はHTTPS等の安全な接続と利用者の許可が必要です。
