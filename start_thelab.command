#!/bin/bash

# Node.jsやnpmへのパスを通す (環境に合わせて調整)
export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin

# プロジェクトディレクトリへ移動
PROJECT_DIR="/Users/cyber/thelab-control"

if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    echo "📂 Changed directory to $PROJECT_DIR"
    
    echo "🚀 Starting application (npm start)..."
    # サーバーとクライアントを同時起動
    npm start
else
    echo "❌ Error: Project directory not found at $PROJECT_DIR"
    read -p "Press Enter to exit..."
fi
