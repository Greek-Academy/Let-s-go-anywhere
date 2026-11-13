# Drive+：今できることと、次に進めること

2026-11-07更新。[現在の課題一覧（Issue #1）](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/1)を起点に確認します。

## 目指す体験

ドライブしたいけれど目的地が決まらない人が、趣味や気分から行きたい場所を見つけるアプリです。

1. 使い方の漫画を見て、好きなことを選ぶ。
2. 現在地または駅を起点に、片道1〜5時間を目安とした候補をAIが探す。
3. 写真と車の検索待ち画面を経て、趣味ラベル・片道時間のあるパネルを見る。
4. 気になったことを自由に書く、または気分から選んで探し直す。
5. 行きたい場所を保存し、外部の案内を使って出かける。

趣味検索と、自由入力／気分検索は別の条件で行います。候補は10件を目安にしますが、条件と確認結果によって少なくなります。

## 実装と反映の状態

- **mainへ反映済み：** [PR #144](https://github.com/Greek-Academy/Let-s-go-anywhere/pull/144)を2026-11-06にマージしました。Brave Search＋Gemini＋Google Routes、趣味別パネル、検索待ち画面、検索フォーム、漫画ガイドを含みます。
- **未マージ：** [PR #145](https://github.com/Greek-Academy/Let-s-go-anywhere/pull/145)のホーム冒頭の見た目改善、[PR #121](https://github.com/Greek-Academy/Let-s-go-anywhere/pull/121)の依存ライブラリ更新。#145のCIは成功、#121は検証を要します。
- **公開Web：** 以前のFirebase検証版はあります。現在のMac版と同じ検索構成の公開反映は別途確認・対応します。mainへのマージだけでは配信されません。
- **iPhone：** React＋Capacitorの土台はあります。現在の版の反映・実機確認は利用者の希望で後回しです。

画面の下部は「見つける・行きたい・車を探す・マイページ」です。イベント検索と学ぶタブは終了しました。既存の保存・共有・自分用メモは保持し、運転前の知識・不安チェックは独立して残しています。

## 残す課題

| 課題                                      | 確認先                                                                |
| ----------------------------------------- | --------------------------------------------------------------------- |
| ホーム冒頭の見た目の確認                  | [#141](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/141) |
| 候補の品質・件数・時間・失敗時の案内      | [#19](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/19)   |
| 利用者が行きたい場所を見つけられるか      | [#3](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/3)     |
| 店舗写真の一致と実請求の残確認            | [#118](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/118) |
| 車を探す拠点情報・リンク・更新            | [#21](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/21)   |
| 公開先への接続・費用・障害・復旧          | [#14](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/14)   |
| 個人情報・削除・掲載内容・問い合わせ      | [#6](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/6)     |
| セキュリティ・依存ライブラリ更新          | [#31](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/31)   |
| iPhoneと2人の共有を含む実機確認（保留中） | [#32](https://github.com/Greek-Academy/Let-s-go-anywhere/issues/32)   |

## IssueとPRの読み方

未完了Issueは53件から、一覧の#1を含む10件に整理しました。10件はマージ済みの実装として完了、33件は統合・方針変更・保留案としてクローズしました。後者はすべての実装が終わった意味ではありません。必要な残作業を上のIssueへ移し、元のコメント・計画・整理前のバックアップを残しています。

今後のIssueは「課題 → 対応したいこと → 完了の目安」、PRは「背景・課題 → 実装 → 実際の画面画像 → 確認結果」で記載します。現在の本文を短く保ち、同じ課題の細かなIssueや依存するPRを増やさない方針です。

- [Issue整理の対応表](reviews/issue-cleanup-2026-11-07/README.md)
- [PR整理の記録](reviews/pr-consolidation/README.md)
- [開発・レビューの進め方](../CONTRIBUTING.md)
- [過去の進捗記録](PROJECT_STATUS_HISTORY_2026-11-06.md)

開発用の実API利用は了承済みです。旧記録の累計3,000円・少数回制限を現在の前提として復活させません。一般公開時の利用規模・費用・運用は#14で整理します。今回のIssue整理は、機能の変更・公開・データ削除を伴いません。
