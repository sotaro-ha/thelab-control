# 画像フォルダ

## スライドショーに画像を追加する方法

1. このフォルダ（`public/images/`）に画像ファイルを配置してください

例:
```
public/
  images/
    slide1.jpg
    slide2.jpg
    slide3.jpg
```

2. `src/components/SlideShow.jsx` を編集して、画像パスを追加してください

```javascript
const slides = [
  {
    title: "自分の組み立てたロボットの写真を撮ろう",
    description: "この展示では、あなたの体の動きに合わせてロボットが動きます。",
    image: "/images/slide1.jpg"  // ← ここに画像パスを追加
  },
  {
    title: "体を動かしてみよう",
    description: "カメラの前に立って、手や体を動かしてください。ロボットが反応します。",
    image: "/images/slide2.jpg"
  },
  {
    title: "ロボットと一緒に写真を撮ろう",
    description: "気に入ったポーズが決まったら、写真を撮ることができます。",
    image: "/images/slide3.jpg"
  }
]
```

## 推奨画像サイズ

- 横長画像: 1600 x 1200 px (4:3)
- 正方形: 1200 x 1200 px
- ファイル形式: JPG, PNG

## 注意事項

- 画像ファイルサイズは1MB以下を推奨
- ファイル名は英数字とハイフンのみ（日本語不可）
- 画像がない場合は、プレースホルダーが表示されます
