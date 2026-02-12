#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# 依存パッケージのインストール
npm install
npm --prefix server install

# フロントエンド + バックエンドを同時起動
npm start
