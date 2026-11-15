# Cloudflare Pages 対応メモ

CryptoQwerty は GitHub Pages と Cloudflare Pages の両方で配信できる
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
- 再構築に失敗した場合は元の応答をそのまま保存し、インストール全体を
  失敗させない（`storeClean` のフォールバック）。元の応答が
  `redirected` な場合でも、ナビゲーションハンドラがそれをミスとして扱う
  ため、ナビゲーションに使われることはない。次の成功したインストールで
  浄化されたコピーに置き換わる。
- ナビゲーションハンドラは `redirected` なキャッシュヒットをミスとして扱い、
  キャッシュするのは素の OK 応答のみにする。`fetch()` が
  `opaqueredirect` を返した場合はそのまま返し、ブラウザにリダイレクトを
  追わせる（URL と相対パスの基準が正しく保たれる）。
- KeeWeb 専用ワーカー（`contents/qwerty/keeweb/service-worker.js`）は
  変更していない。KeeWeb ページへのナビゲーションは、初回は外側の
  ワーカーがキャッシュから配信し、再読み込み時は KeeWeb ワーカーが
  `opaqueredirect` をブラウザに追わせてディレクトリ URL のキャッシュ
  ヒットに到達するため、修正なしで動作する（回帰テストで確認済み）。
  KeeWeb ワーカーがキャッシュするのはディレクトリ URL（`.`）のみで、
  リダイレクトを経由しないため、そのエントリは `redirected=false` である
  （ブラウザテストで assert 済み）。
- FILES に `keeweb/`（ディレクトリ URL）は追加していない。アプリ内の
  KeeWeb へのリンクは `keeweb/index.html` 形（10か所以上）で、これは
  プリキャッシュ済みのためオフラインの初回利用から動作する。`keeweb/` を
  FILES に追加するにはプリキャッシュ一覧の生成スクリプト
  （`scripts/generate-precache.js`、ファイルツリーから一覧を生成）に
  特例が必要になり、リンク形式の統一も含めると変更範囲が広がる。
  クリーン URL 形へのナビゲーションは、オンライン初回訪問時に
  ランタイムキャッシュへ保存され、オフライン時はアプリシェルへ
  フォールバックするため、現状で問題ないと判断した。

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
- 実環境の Cloudflare Pages での検証は未実施。下記の手順でデプロイ後に
  確認すること。未確認の項目を PASS と報告しないこと。
- 既存のオフライン機能・暗号処理・セキュリティ設計は変更していない。

## デプロイ後の実環境検証手順（Cloudflare Pages）

対象サイトのホスト名を `<host>` とする（例：
`https://crypto-qwerty.pages.dev`）。各項目は成否を記録し、失敗時は
表示内容・ステータスコード・スクリーンショットを残すこと。

### デスクトップ（Chromium 系）

1. `https://<host>/contents/qwerty/` を開く。アプリが表示されること。
2. `https://<host>/contents/qwerty/index.html` に直接アクセスする。
   表示されること（`/` へ 308 されてもよいが、表示が壊れないこと）。
3. `https://<host>/contents/qwerty/` へのリダイレクトが 308 であること
   （DevTools Network で確認）。
4. `https://<host>/contents/qwerty/keeweb/` を開く。KeeWeb が表示されること。
5. `https://<host>/contents/qwerty/keeweb/index.html` に直接アクセスする。
   表示されること（`/keeweb/` へ 308 されてもよいが、表示が壊れないこと）。
6. `https://<host>/contents/qwerty/timelock-recover` を開く。
   タイムカプセル復元ツールが表示されること。
7. Service Worker の登録を確認する（DevTools → Application →
   Service Workers）。スコープが `/contents/qwerty/` であること。
   `sw.js` の VERSION が `cm-qwerty-v1.2.1-cloudflare` であること。
8. PWA インストール（アドレスバーのインストールアイコン）が
   表示されること。インストールして起動できること。
9. オフライン（DevTools → Network → Offline）にし、ページを再読み込みする。
   「オフライン動作中」バッジが出て起動すること。
10. オフラインのままシード `84920173` で盤面を生成し、board[0] が
    `{key:1, tl:D, tr:Q, bl:I, br:8}`、board[1] が
    `{key:2, tl:s, tr:9, bl:1, br:9}` になること。
11. WASM 読み込み：データ転送（QR）のカメラ読み取り画面を開き、
    ZXing の読み込みエラーが出ないこと。
12. 暗号・乱数関連テスト：`npm test` 相当のブラウザテストが通ること
    （ローカルで実施済みの内容と同一の期待値であること）。
13. 手動更新フロー：アプリ内の「最新版を確認・更新」から更新チェックを
    行い、「最新版です」と表示されること。将来のバージョン更新時は、
    waiting ワーカーからの更新通知・適用が動作すること。
14. コンソールエラーと失敗したリクエストがないこと（DevTools Console /
    Network で確認。`timelock-recover.html` のメタ CSP にある
    `frame-ancestors` が無視される旨の既存の警告 1 件は許容）。

### Android Chrome

1. 上記の 1〜6（表示・直接アクセス・リダイレクト）を実施する。
2. ホーム画面に追加し、PWA として起動できること。
3. 機内モードなどでオフラインにし、PWA を再起動する。「オフライン動作中」
   の表示が出て起動すること。
4. オフラインのまま盤面生成・バックアップ保存・復元ができること
   （シード `007` が `007` のまま復元されることを含む）。
5. オンラインに戻し、アプリを再起動する。更新があれば反映されること。

### iOS Safari

1. 上記の 1〜6（表示・直接アクセス・リダイレクト）を実施する。
2. 共有 → ホーム画面に追加し、PWA として起動できること。
3. 機内モードなどでオフラインにし、PWA を再起動する。「オフライン動作中」
   の表示が出て起動すること。
4. オフラインのまま盤面生成・バックアップ保存・復元ができること
   （シード `007` が `007` のまま復元されることを含む）。
5. オンラインに戻し、アプリを再起動する。更新があれば反映されること。

### KeeWeb 実 KDBX フロー（実環境・手動）

1. パスワードを生成する。
2. KeeWeb に新しいエントリとして保存する。
3. データベースを閉じて再度開く。
4. エントリが残っていることを確認する。
   （画面表示や postMessage の成功だけでは確認にならない。）
