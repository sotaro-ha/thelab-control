# 展示体験サイト - The Lab Control

MediaPipeを使った体トラッキングによるロボット制御展示のためのWebアプリケーションです。

## 機能

- **ホームページ (`/`)**
  - 展示の説明とスライドショー
  - 体験開始ボタン
  - 感想入力フォーム

- **モーショントラッキングページ (`/motion`)**
  - MediaPipeによるリアルタイム体トラッキング
  - WebSocket経由でのロボット制御データ送信
  - 縦長ディスプレイ対応

- **バックエンドサーバー**
  - WebSocketサーバー（ポーズデータの受信）
  - QubiLinkプロトコル対応
  - UDPブロードキャストによる自動デバイス検出
  - UDP通信（ロボットへのサーボ制御コマンド送信）
  - 感想の収集API

## プロジェクト構成

```
the-lab-control/
├── src/                    # フロントエンドソース
│   ├── components/         # Reactコンポーネント
│   │   └── SlideShow.jsx   # スライドショーコンポーネント
│   ├── pages/              # ページコンポーネント
│   │   ├── Home.jsx        # ホームページ
│   │   └── Motion.jsx      # モーショントラッキングページ
│   ├── utils/              # ユーティリティ
│   │   └── websocket.js    # WebSocket通信クラス
│   ├── App.jsx             # メインアプリ
│   └── main.jsx            # エントリーポイント
├── server/                 # バックエンドサーバー
│   ├── server.js           # Node.jsサーバー
│   ├── package.json        # サーバー依存関係
│   └── README.md           # サーバードキュメント
├── index.html              # HTMLテンプレート
├── package.json            # フロントエンド依存関係
└── vite.config.js          # Vite設定

## セットアップ

### 1. まとめて起動（推奨）

```bash
# 依存関係のインストール
npm install
npm --prefix server install

# フロントエンド + バックエンドを同時に起動
npm start
```

フロントエンドは `http://localhost:3000`、バックエンドは `http://localhost:3001` で起動します。

### 2. フロントエンドのセットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

フロントエンドは `http://localhost:3000` で起動します。

### 3. バックエンドのセットアップ

```bash
# サーバーディレクトリに移動
cd server

# 依存関係のインストール
npm install

# サーバーの起動
npm start
```

バックエンドは `http://localhost:3001` で起動します。

### 3. ロボット側の設定

**重要:** このシステムは **QubiLinkプロトコル** を使用してロボットと通信します。

#### 自動検出（推奨）

サーバーは自動的に同じネットワーク内のQubiLinkデバイスを検出します：

1. ロボット（`actuator.cpp`を実行）を同じWi-Fiネットワークに接続
2. サーバーを起動すると自動的にデバイスを検出
3. コンソールに「📡 Device discovered: actuator_01」と表示されることを確認

**使用ポート:**
- **ディスカバリー**: UDP 12340（ブロードキャスト）
- **コントロール**: UDP 12345（ユニキャスト）

#### 手動設定（非推奨）

特定のIPアドレスにのみ送信したい場合は、`server/server.js` を編集してください。

#### ファイアウォール設定

以下のポートを開放してください：
- UDP 12340（ディスカバリー受信）
- UDP 12345（コントロール送信）
- TCP 3001（WebSocket/HTTP）

詳細は `server/README.md` を参照してください。

## 使い方

### 展示の流れ

1. ホームページで「説明を見る」をクリックしてスライドショーを表示
2. 「展示を体験してみよう」をクリックしてモーショントラッキングページへ移動
3. カメラの前に立ち、全身が映るように調整
4. 体を動かすとロボットが反応
5. 体験後、ホームに戻って感想を入力

### スライドショーのカスタマイズ

`src/components/SlideShow.jsx` の `slides` 配列を編集して、スライドの内容や画像を変更できます：

```javascript
const slides = [
  {
    title: "タイトル",
    description: "説明文",
    image: "/path/to/image.jpg" // 画像パス（publicフォルダ内）
  },
  // 他のスライド...
]
```

## 技術スタック

### フロントエンド
- **React 18** - UIフレームワーク
- **Vite** - ビルドツール
- **React Router** - ルーティング
- **MediaPipe Pose** - 体トラッキング
- **WebSocket** - リアルタイム通信

### バックエンド
- **Node.js** - サーバー環境
- **Express** - HTTPサーバー
- **ws** - WebSocketサーバー
- **dgram** - UDP通信

## データフロー

### デバイス検出フロー
```
サーバー起動
    ↓
UDPブロードキャスト（ポート12340）
    ↓
ロボットが応答（アナウンス）
    ↓
デバイス情報を保存
```

### ポーズデータフロー
```
ユーザー（カメラ）
    ↓
MediaPipe（ブラウザ）→ ポーズランドマーク検出
    ↓
WebSocket（フロントエンド → バックエンド）
    ↓
サーボ角度を計算（右手首のY座標 → 0-180度）
    ↓
UDP（バックエンド → ロボット、ポート12345）
    ↓
サーボが動く
```

## MediaPipeのランドマーク

MediaPipe Poseは33個の体のランドマークを検出します：

- 0-10: 顔（鼻、目、耳、口）
- 11-12: 肩
- 13-14: 肘
- 15-16: 手首
- 17-22: 手
- 23-24: 腰
- 25-26: 膝
- 27-28: 足首
- 29-32: 足

各ランドマークには以下の情報が含まれます：
- `x`: 水平位置（0-1の正規化座標）
- `y`: 垂直位置（0-1の正規化座標）
- `z`: 深度（カメラからの相対距離）
- `visibility`: 検出の信頼度（0-1）

## トラブルシューティング

### カメラが起動しない
- ブラウザのカメラ権限を確認
- HTTPSまたはlocalhostでアクセスしているか確認
- 他のアプリがカメラを使用していないか確認

### WebSocketに接続できない
- バックエンドサーバーが起動しているか確認（`http://localhost:3001/health`にアクセス）
- ファイアウォール設定を確認
- ブラウザのコンソールでエラーを確認

### ロボットが動かない

#### デバイスが検出されない場合

1. 同じWi-Fiネットワークに接続しているか確認
   ```bash
   # サーバーとロボットのIPアドレスを確認
   # macOS/Linux: ifconfig
   # Windows: ipconfig
   ```

2. サーバーログを確認
   ```bash
   # 以下のメッセージが表示されるか確認
   📡 Device discovered: actuator_01 at 192.168.x.x:12345
   ```

3. 手動でデバイスリストを確認
   ```bash
   curl http://localhost:3001/api/devices
   ```

4. ファイアウォールを確認
   - UDP 12340と12345が開放されているか確認

5. テストスクリプトを実行
   ```bash
   cd server
   node test-discovery.js
   # ロボットからのアナウンスメッセージが表示されるか確認
   ```

#### デバイスは検出されるがコマンドが届かない場合

1. サーバーログで「🤖 Sent to actuator_01: angle=XXX」メッセージを確認

2. 手動でコマンドを送信してテスト
   ```bash
   curl -X POST http://localhost:3001/api/command/actuator_01 \
     -H "Content-Type: application/json" \
     -d '{"angle": 90}'
   ```

3. テストスクリプトでロボットに直接送信
   ```bash
   cd server
   node test-control.js 192.168.x.x  # ロボットのIPアドレス
   ```

4. ロボット側のログ（シリアルモニタ）でコマンド受信を確認

### パフォーマンスの問題
- `src/pages/Motion.jsx` の `modelComplexity` を `0` に変更（精度は下がるが高速化）
- カメラの解像度を下げる（`width`/`height` を調整）

## 開発

### ビルド

```bash
# フロントエンドのビルド
npm run build

# ビルドのプレビュー
npm run preview
```

### カスタマイズ

**カラーテーマの変更**
- `src/pages/Home.css` のグラデーション色を編集
- `src/components/SlideShow.css` のスタイルを編集

**トラッキング精度の調整**
- `src/pages/Motion.jsx` の `pose.setOptions()` パラメータを調整

**UDP送信頻度の調整**
- `src/utils/websocket.js` にスロットル処理を追加

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 参考リンク

- [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose.html)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
