# 開発・レビューの進め方

小さなIssueを一つ選び、変更内容と操作確認の証跡をPR・Issueから確認できる形で提出します。担当者が確認するまではIssueを開いたままにします。

## 環境を揃える

Node.jsは`.nvmrc`の24.20.0、npmは`package.json`の11.19.0を使用します。Node.js 24.20.0にはこのnpmが同梱されています。nvmを使う場合は次の手順です。

```bash
nvm install
nvm use
npm ci
npx playwright install chromium
```

Linuxでブラウザの依存パッケージも入れる場合は`npx playwright install --with-deps chromium`を使用します。

## Issueから確認待ちまで

1. Issueの完了条件と依存関係を読み、人間の決定を要する事項と開発で進められる範囲を確認します。
2. `codex/issue-番号-内容`等の作業ブランチを作り、対象の変更と必要な検証を実施します。
3. PRに問題・変更後の動作・確認手順・検証結果を記載します。関連Issueをリンクし、レビュー前に自動で閉じる指定は付けません。
4. CIの`Build and browser tests`を確認し、IssueにPR・CI実行・画像等の証跡と再現手順を投稿します。
5. Issueに`状態:確認待ち`を付け、担当者が確認します。人間の承認が必要な項目が残る場合は、その項目を明記します。

## 手元での確認

```bash
npm run format:check
npm run build
npm run test:e2e
npm run test:report
```

E2Eは必要に応じてViteを起動します。PCとスマートフォン幅のChromiumで既存の操作フローを確認します。実機Safari・Androidの動作を保証するテストではありません。

起動中の開発サーバーから分離して確認する場合は、`CI=true PLAYWRIGHT_PORT=5175 npm run test:e2e`を使用します。CIでは既存サーバーを再利用せず、指定したポートで対象チェックアウトのアプリを起動します。

成功した各テストには「操作後の画面」を添付します。失敗した場合はスクリーンショットとPlaywrightの操作トレースを残します。HTMLレポートは`playwright-report/`、個別の実行成果物は`test-results/`です。これらはGitの追跡対象外です。

主要画面の一覧画像を更新する場合は、別ターミナルで`npm run dev`を起動したうえで`npm run capture:ui`を実行します。保存先は`docs/screenshots/`です。

## GitHubで結果を見る

PRのChecksからCI実行を開くと、各ステップの成功／失敗とログを確認できます。Artifactsの`playwright-report`をダウンロード・展開し、このプロジェクトで次のように開きます。

```bash
npx playwright show-report /path/to/extracted/playwright-report
```

成功画面は各テストの添付から、失敗時の操作経過はトレースから確認できます。失敗時は`browser-failure-details`も保存します。Artifactsの保持期間は14日です。期間を超えて残す確認画像・要約は、PRに含めた`docs/`へのリンクとともにIssueへ記録します。

CIはPRと`main`更新で、固定したNode.js・ロックファイルを使い、整形、型チェック、ビルド、ブラウザテストを実行します。依存関係の変更はDependabotが週次でPRを作り、同じ検証とレビューを通します。ランタイムを変更する場合は`.nvmrc`、`packageManager`、`engines`と起動手順をまとめて更新してください。

GitHubの「必須チェック」や承認人数はリポジトリ管理者の設定で決まります。このCI追加だけではマージ制限を変更しません。レビュー運用ではCI成功と担当者の確認後にマージしてください。

## 参照

- [Playwright：CIとHTMLレポート](https://playwright.dev/docs/ci-intro)
- [Node.js公式の配布情報](https://nodejs.org/dist/index.json)
- [actions/setup-node](https://github.com/actions/setup-node)
- [actions/upload-artifact](https://github.com/actions/upload-artifact)
