# 画像素材

## カード用のジャンル別イラスト（#116、2026-10-12）

`public/images/spot-illustrations/` の6点は内蔵 image_gen で制作した架空のイメージです。下記Unsplash写真とは別の素材です。実在するお店・会場・風景の写真、料理や設備の確認済み情報としては使いません。

| ファイル | 用途 |
| --- | --- |
| `cafe.jpg` | カフェ・コーヒー・スイーツ |
| `food.jpg` | 和食・洋食など食事 |
| `nature.jpg` | 自然・景色 |
| `art.jpg` | アート |
| `event.jpg` | イベント |
| `outing.jpg` | 分類なし・旧保存・共有候補・画像失敗時の共通イメージ |

[使用したプロンプト一式](assets/spot-illustrations-prompts.json)。生成後、構図は変えずにsipsで960×640のJPEG（品質78）へ書き出しています。合計約1.45MiB。原画はローカルのCodex生成画像フォルダに保持し、アプリが使う最終画像はすべてリポジトリ内に保存しています。実行時の画像生成API・外部画像サービスは使いません。

[画面・表示ルール・検証](reviews/card-illustrations/README.md)。

## 既存の地図データ・イメージ写真

駅選択用の同梱データ（#104）は画像素材とは別に、Seo-4d696b75 / station_database の2026年9月30日版から廃止駅を除いて加工しています。加工データにもCC BY-SA 4.0を適用します。[出典・固定コミット・ライセンス・再生成手順](RAIL_STATIONS.md)。

実行時の外部通信を避けるため、イメージ写真を `public/images/` に同梱しています。すべて実在のイベント・施設・車両の掲載画像ではなく、UX確認用のイメージです。

Unsplashの無料画像として取得。利用条件は [Unsplash License](https://unsplash.com/license) を2026-09-13に確認しています。写真を単体で販売したり、競合する画像集を作る用途には使用しません。

| 同梱ファイル    | 取得元                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fuji.jpg`      | https://images.unsplash.com/photo-1490806843957-31f4c9a91c65                                                                                                                           |
| `fireworks.jpg` | https://images.unsplash.com/photo-1720162475419-8a6e863ce285 — [Sawyer Bergeron / Unsplash](https://unsplash.com/photos/a-firework-is-lit-up-in-the-night-sky-over-a-lake-vuew7KvXx9I) |
| `forest.jpg`    | https://images.unsplash.com/photo-1441974231531-c6227db76b6e                                                                                                                           |
| `coast.jpg`     | https://images.unsplash.com/photo-1518837695005-2083093ee35b                                                                                                                           |
| `cafe.jpg`      | https://images.unsplash.com/photo-1442512595331-e89e73853f31                                                                                                                           |
| `car.jpg`       | https://images.unsplash.com/photo-1503376780353-7e6692767b70                                                                                                                           |

取得URLに `auto=format&fit=crop&w=1000&q=85` を付けて保存しています。道路、簡易地図、車両イラストはReact内のオリジナルSVGです。一般的なUIアイコンはLucide（ISCライセンス）を使用しています。

## 実地図・公開拠点データ（#75）

新しい「車を探す」は、OpenStreetMapの京都の道路・水域・公園データを同梱し、独自の配色・線幅で描画します。地理院タイルの通信は行いません。背景GeoJSONにもODbL 1.0を適用し、出典・加工内容・配布先をアプリに表示します。京都のOpenStreetMap拠点JSONとその派生データにはODbL 1.0を適用し、アプリ内に出典・ライセンス・データ閲覧を用意しています。LeafletのBSD 2-Clauseライセンスは `src/data/leaflet-license.txt` に同梱しています。[詳細と取得クエリ](CAR_SEARCH.md)。
