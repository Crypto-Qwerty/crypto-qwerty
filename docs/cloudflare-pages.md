# Cloudflare Pages 対応メモ

CryptoPassKey QWERTY は GitHub Pages と Cloudflare Pages の両方で配信できる
静的サイトである。ビルドは不要で、リポジトリルートをそのまま公開する。
アプリの URL は `/contents/qwerty/`（例：
`https://<host>/contents/qwerty/`）。ルートに `index.html` はないため、
ルート URL ではアプリは表示されない（意図した構成）。

## Clean URLs と Service Worker

Cloudflare Pages は既定で Clean URLs 相当の振る舞いをする（実測）。

- `/contents/qwerty/index.html` → 308 `/contents/qwerty/`
- `/contents/qwerty/keeweb/index.html` → 308 `/contents/qwerty/keeweb/`
- `/contents/qwerty/timelock-recover.html` → 308 `/contents/qwerty/timelock-recover`
- `/contents/qwerty/keeweb`（末尾スラッシュなし）→ 308 `/contents/qwerty/keeweb/`

GitHub Pages は `.html` をそのまま 200 で配信するため、この違いが
Service Worker と競合する。問題の仕組みは次のとおり。

1. 旧 `sw.js` はインストール時に `cache.addAll(FILES)` を使っていた。
   `.html` 8件は 308 を経由して取得されるため、キャッシュには
   `redirected=true` のレスポンスが保存されていた。
2. Chrome は `redirected=true` のレスポンスをナビゲーションに使うと拒否する
   （"a redirected response was used for a request whose redirect mode is
   not 'follow'"）。そのため Cloudflare Pages では、インストール後に
   `index.html`・`keeweb/index.html`・`timelock-recover.html` などへの
   ナビゲーションが `net::ERR_FAILED` で失敗した。
   （GitHub Pages では `.html` がリダイレクトされないため発生しない。
   ただし末尾スラッシュなしのディレクトリ URL は GitHub Pages でも 301
   されるため、非正規 URL では同じ仕組みが働く。）

対策（`contents/qwerty/sw.js`、VERSION `cm-qwerty-v1.2.1-cloudflare`）：

- プリキャッシュは `addAll()` の代わりに fetch＋保存のループで行い、
  リダイレクトされたレスポンスは同じステータス／ヘッダ／本文の
  新しい `Response` として保存し直す（`redirected` フラグを落とす）。
  `content-encoding` と `content-length` は転送時の値を指すため除外する
  （本文は fetch 時点でデコード済み）。
- ナビゲーションハンドラは `redirected` なキャッシュヒットをミスとして扱い、
  キャッシュするのは素の OK 応答のみにする。`fetch()` が
  `opaqueredirect` を返した場合はそのまま返し、ブラウザにリダイレクトを
  追わせる（URL と相対パスの基準が正しく保たれる）。
- KeeWeb 専用ワーカー（`contents/qwerty/keeweb/service-worker.js`）は
  変更していない。KeeWeb ページへのナビゲーションは、初回は外側の
  ワーカーがキャッシュから配信し、再読み込み時は KeeWeb ワーカーが
  `opaqueredirect` をブラウザに追わせてディレクトリ URL のキャッシュ
  ヒットに到達するため、修正なしで動作する（回帰テストで確認済み）。

## 配信設定（`_headers` / `_redirects` なし）

リポジトリに `_headers`・`_redirects` は置いていない。理由は次のとおり。

- CSP は `index.html` の `<meta>` で配信しており、両ホストで同一である。
  ヘッダ CSP を追加するとメタ CSP との共通部分が有効になり、意図しない
  制限がかかる恐れがあるため追加しない。
- `_redirects` は不要である。ルートからアプリへのリダイレクトを置くと
  GitHub Pages と挙動が分かれるうえ、Cloudflare の末尾スラッシュ処理と
  競合してリダイレクトループの原因になりうる。
- WASM（`shared/vendor/zxing_reader.wasm`）は `fetch()`＋`arrayBuffer()`
  で読み込むため、`application/wasm` の MIME は不要である。
  両ホストとも `.wasm` を正しい MIME で配信する。
- Service Worker の更新チェックは `updateViaCache: 'none'` で行うため、
  `sw.js` の HTTP キャッシュ制御は不要である。

## 検証状況

- ローカル検証（Cloudflare の 308 を再現する HTTPS サーバ＋Playwright、
  および `tests/` の回帰テスト）はすべて PASS。詳細は
  `tests/qwerty/service-worker-redirect.test.js` と
  `tests/browser/run-browser-tests.js` の Cloudflare モードを参照。
- 実環境の Cloudflare Pages での検証は未実施。デプロイ後に次の確認が必要。
  トップページ表示、直接 URL アクセス、ページ内遷移、Service Worker
  登録、PWA インストール、オフライン起動、WASM 読み込み、暗号・乱数テスト。
- 既存のオフライン機能・暗号処理・セキュリティ設計は変更していない。
