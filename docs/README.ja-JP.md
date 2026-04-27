[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Русский](README.ru-RU.md)

<p align="center">
  <img src="../assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<h1 align="center">TraceMind</h1>

<p align="center">
  <strong>素早い答えではなく、研究の流れそのものを理解したい人のための AI パーソナル研究ワークベンチ。</strong>
</p>

<p align="center">
  <a href="../LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-ready-0f766e">
  <img alt="Evidence-first" src="https://img.shields.io/badge/research-evidence_first-f5b84b">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-8_languages-2563eb">
</p>

TraceMind は、ひとつの研究アップデートだけでは研究分野の全体像は見えない、という現実から出発しています。

現在の AI 研究は速く、話題も多く、要約も大量に作れます。しかし、何が本当に問題を解いているのかを見抜くには、文献の継続的な追跡と証拠の蓄積が必要です。TraceMind は、AI が論文を追跡し、証拠を蓄え、その証拠に基づいて答える忠実で厳密な研究助手になれるかを問い直します。

## プロジェクト紹介

TraceMind は AI パーソナル研究ワークベンチです。学生、独立研究者、エンジニア、技術リード、アナリストなど、増え続ける論文を一貫した理解へ変えたい人を想定しています。

| よくある悩み | TraceMind が提供するもの |
| --- | --- |
| 論文は増えるのに主線が見えない | トピックマップ、ノードグラフ、重要論文、実際の研究進捗 |
| AI の答えは滑らかだが根拠が弱い | 論文、PDF、図、式、引用と結び付いた回答 |
| 良い問いがチャットやメモに散らばる | 長期記憶を持つトピックワークベンチ |
| トレンド追従ばかりで蓄積が残らない | 実材料から育つ長期テーマ |

## なぜ作ったのか

研究が難しいのは、情報が足りないからではなく、理解が十分に積み上がらないからです。

汎用チャットは即答に強い一方で、次のものを残すのは苦手です。
- その判断はなぜ成り立ったのか
- どの証拠がそれを支えているのか
- どこがまだ不確かか
- その分野が時間とともにどう変化したのか

TraceMind は次の四点を重視します。
- `証拠優先`
- `記憶優先`
- `構造優先`
- `最終判断は人間`

## 亮点

- `トピックページは実際の研究結果を中心に構成`：計画フェーズを先に作らず、実際に集まった論文とノードから進捗を表現します。
- `ノードページは高速理解の入口`：核心問題、重要論文、証拠連鎖、手法、発見、限界、論争、研究判断を一つの画面で整理します。
- `証拠が常に近い`：最終的な判断の近くに PDF、図、式、引用、抽出片を置きます。
- `追問が文脈を失わない`：AI との対話がテーマとノードの積み上げから切り離されません。
- `自前運用しやすい`：モデル設定、資格情報、研究データを自分の環境で管理できます。

## クイックスタート

前提条件:
- Node.js `18+`
- npm `9+`
- Python `3.10+`
- 利用したいモデル提供者の API キー

バックエンド:

```bash
cd skills-backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

フロントエンド:

```bash
cd frontend
npm install
npm run dev
```

ローカル既定:
- frontend: `http://localhost:5173`
- backend health: `http://localhost:3303/health`

Docker:

```bash
docker compose up --build
```

## 最初の 15 分

1. バックエンドとフロントエンドを起動します。
2. 設定画面で少なくとも一つのモデル提供者を設定します。
3. 実際に追跡したいテーマでトピックを作成します。
4. 論文探索を実行し、候補をそのまま受け入れずに見直します。
5. 本当に主線に入る論文だけを採用します。
6. ノード研究ビューを開き、構造化されたブリーフを先に読みます。
7. `この枝で最も弱い証拠は何か` のような検証的な質問をします。
8. 出力を保存するか、さらに論文を追加してテーマを育てます。

## 流れ

TraceMind の研究ループは次のように進みます。
- 論文を発見する
- 候補を選別して採用する
- PDF から証拠を抽出する
- 研究ノードを作る
- 段階的な判断を書く
- 文脈付きで追問する
- ノートやレポートへ出力する
- それらをトピック記憶へ戻す

## 比較

| ツール | 得意なこと | TraceMind の役割 |
| --- | --- | --- |
| Zotero | 文献収集と引用管理 | 文献をノード、証拠連鎖、判断へ変える |
| NotebookLM | 与えられた資料への質問 | その質問を長期テーマの中で維持する |
| Elicit | 検索とレビュー支援 | 個人研究の継続的な蓄積に寄せる |
| Perplexity | 素早い情報探索 | 一回の答えをテーマ記憶へ変える |
| Obsidian / Notion | ノート整理 | 論文追跡と根拠付き AI を補う |
| ChatGPT / Claude | 推論と文章生成 | 空のチャットではなく研究室を与える |

## 参考にした基盤

TraceMind は次のような成熟した基盤の上に成り立っています。
- `React` と `Vite`
- `Express` と `Prisma`
- `SQLite`、`PostgreSQL`、`Redis`
- `PyMuPDF`
- `OpenAI`、`Anthropic`、`Google`
- `arXiv`、`OpenAlex`、`Crossref`、`Semantic Scholar`

README の構成や公開ドキュメントの書き味では、`Supabase`、`Dify`、`LangChain`、`Immich`、`Next.js`、`Visual Studio Code`、`Excalidraw`、`Open WebUI` などの明快さを参考にしています。

## 向いている人

TraceMind は次のような人に向いています。
- 数週間から数か月単位で研究テーマを追う人
- 論文同士の関係まで見たい人
- レビュー、技術メモ、研究ブリーフを書きたい人
- 研究データとモデル設定を自分で管理したい人

次の用途だけなら別の道具の方が向いているかもしれません。
- 単発の事実確認
- 根拠に戻る必要のない即答
- 汎用的な社内ナレッジベース

## 貢献・セキュリティ・ライセンス

- 貢献ガイド: [CONTRIBUTING.md](../CONTRIBUTING.md)
- セキュリティ方針: [SECURITY.md](../SECURITY.md)
- ライセンス: [MIT](../LICENSE)

## 終わりに

一度の研究進捗だけで、分野の本当の流れを見抜くのは難しいものです。しかも今の AI 研究は、速度、話題性、表面上の新しさに強く引っ張られます。

TraceMind が目指すのは、AI が文献を追跡し、証拠を蓄積し、その証拠に基づいて対話しながら、研究の輪郭を少しずつ見えるようにすることです。研究そのものより大きな声を出すのではなく、研究をより正確に見せるための助手になること。それがこのプロジェクトの狙いです。
