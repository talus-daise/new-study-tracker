# 学習ノート（Study Tracker）

Cloudflare Workers + D1 で動く、学習記録アプリです。

- `/`（`index.html`）… 入力ページ。学習タイプ・時間・メモを記録します。
- `/display.html`… 表示ページ。タブレットでの常時表示を想定した1画面レイアウトで、
  月間カレンダー形式のストリークと「今日の学習」の概要を表示します。

## 構成

```
study-tracker/
├── wrangler.toml       # Workers設定（D1・静的アセットのバインディング）
├── schema.sql          # D1のテーブル定義 + 初期学習タイプ（宿題/自学/通信）
├── src/index.js        # /api/* のAPIハンドラ（Workers本体）
└── public/
    ├── index.html      # 入力ページ
    ├── display.html    # 表示ページ
    ├── css/style.css
    └── js/
        ├── input.js
        └── display.js
```

## セットアップ

1. 依存関係のインストール（wrangler）
   ```
   npm install
   ```

2. Cloudflareにログイン
   ```
   npx wrangler login
   ```

3. D1データベースを作成
   ```
   npx wrangler d1 create study-tracker-db
   ```
   出力される `database_id` を `wrangler.toml` の
   `REPLACE_WITH_YOUR_DATABASE_ID` 部分に貼り付けてください。

4. スキーマを適用
   - ローカル動作確認用: `npm run db:init:local`
   - 本番用: `npm run db:init:remote`

5. ローカルで確認
   ```
   npm run dev
   ```
   `http://localhost:8787/` が入力ページ、
   `http://localhost:8787/display.html` が表示ページです。

6. デプロイ
   ```
   npm run deploy
   ```

## 学習タイプについて

初期状態で「宿題」「自学」「通信」の3種類が登録されています（`schema.sql`）。
入力ページ下部の「学習タイプを編集する」から、名前と色を自由に追加・削除できます
（記録が残っているタイプは削除できません）。追加したタイプは表示ページの
カレンダーの色分け・凡例にも自動的に反映されます。

## 表示ページの使い方

タブレットを横向きで壁や机に固定し、常時表示させる想定です。

- 左側：当月のカレンダー。学習した日には登録タイプの色ドットが付き、
  現在の連続記録（ストリーク）に含まれる日はオレンジの下線でつながって見えます。
- 右側：現在の連続日数と、今日記録した学習の一覧・合計時間。
- 5分ごとに自動でデータを再取得するので、開きっぱなしでも最新の状態を保てます。
- カレンダーは「‹ ›」で前後の月に移動できます（今日の概要は常に「今日」を表示します）。
