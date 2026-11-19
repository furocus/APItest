# Railway接続・APIデプロイの引き継ぎ

## このチャットで最初に手伝ってほしいこと

Railwayを初めて使うので、画面操作を少しずつ案内してほしい。まず課題用のPostgreSQLを作成し、手元のPrismaから接続・マイグレーションできる状態にしたい。その後、最小のGET APIを公開する。

ユーザーは「Planを勝手に解除しないで」と希望している。相談・手順案内と実際の変更を区別し、勝手に大規模な実装や構成変更へ進まないこと。

## 課題の概要

- 締切：2026年11月19日 23:59（日本時間）。
- ユーザーアカウントの作成・取得・更新・削除APIを実装してデプロイするテスト課題。
- フロントエンド不要。MVPでよい。
- 公開先はRailwayで決定済み。GitHub PagesやCloudflareへの再検討は不要。
- 動作確認にはInsomniaを使用予定。
- 最初はGETと認証を実装して、早く公開まで確認したい。
- 課題・採点側のpackage.jsonは別物であり、自分のAPIの依存関係を合わせる必要はない。
- Railwayアカウント・プロジェクト・DBの作成状況、料金プラン、GitHubへのpush状況はまだ確認できていない。

## 技術構成と現在のファイル

作業場所：WSL Ubuntu `/home/abxw4/deproidtest/codetest`

Windowsからのパス：`\\wsl.localhost\Ubuntu\home\abxw4\deproidtest\codetest`

- Node.js / TypeScript / Express / PostgreSQL / Prisma ORM 7。
- Prisma CLI・Client・PostgreSQL adapterは7.10.1系。7系のまま進める。Prisma 8への移行やPrisma Computeへの変更は不要。
- Prisma ORMをRailwayのPostgreSQLへ接続したい。Prisma Postgresという別サービスを新規契約する話ではない。
- package.jsonとnode_modulesでPrisma関連パッケージの存在を確認済み。
- `src/types.ts`：SignupBody、公開用User、GetUserResponseBodyの型を記述済み。
- `src/function.ts`：空。認証・GET・DB接続は未実装。
- `src/server.ts`：ルート宣言4行だけ。import・Express初期化・Handler実装・listenは未実装。`get.patch(...)`という誤記も残っており、`app.patch(...)`への修正が必要。
- `tsconfig.json`：空。まだビルドできる状態ではない。
- `README.md`：空。
- 独立したschema.sqlは現在見当たらない。Prismaのスキーマとマイグレーションを中心に管理する方針。
- マイグレーションSQLはまだ見当たらず、DB適用・接続・Client生成・ビルド・公開の成功は未確認。
- `.gitignore`にはnode_modules、.env、/src/generated/prismaの除外がある。

### package.jsonの主な設定

```json
{
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

依存関係：

- 実行時：express ^5.3.0、pg ^8.23.1、@prisma/client ^7.10.1、@prisma/adapter-pg ^7.10.1、dotenv ^18.0.10
- 開発時：prisma ^7.10.1、typescript ^7.0.2、@types/node ^26.6.6、@types/express ^5.0.6、@types/pg ^8.23.1
- 実際のNode.jsバージョンは未確認。ローカルとRailwayで揃える必要がある。

インストール時にPrismaのスクリプト未許可警告が出た。その後、package.jsonに以下の許可が記録されたことを確認済み。ただし、rebuild成功は未確認。

```json
"allowScripts": {
  "@prisma/engines@7.10.1": true,
  "prisma@7.10.1": true
}
```

必要に応じて確認するコマンド：

```sh
npm rebuild @prisma/engines prisma
```

## Prismaの設定（実ファイルを確認済み）

標準名のprisma.config.tsではなく、ルートに **prisma7.config.ts** が自動生成されている。重複した設定ファイルを新規作成しないこと。CLIでは当面 `--config ./prisma7.config.ts` を明示する。

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

`prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  user_id  String  @id
  password String
  nickname String
  comment  String?

  @@map("users")
}
```

モデルにはまだ文字数・文字種のDB制約がない。APIの入力検証は別途必要。Prisma 7のschema.prismaにはCHECK制約を直接表現できないため、DBにも制約を入れる場合はマイグレーションSQLへ追加する。

現モデルはpassword列を持つ。ユーザーは今回はハッシュ化を見送る意向を示しており、bcryptjsは導入していない。以前提示したpassword_hash＋bcrypt前提のサンプルは、現在のモデルと一致しないため、そのまま利用しないこと。

## Railwayへ接続する予定の流れ

1. 課題用プロジェクトを作成し、PostgreSQLを追加する。
2. ローカルから接続するため、DBのPublic Access / TCP Proxyを有効化する。
3. DBの **DATABASE_PUBLIC_URLの値** を、手元の.envの **DATABASE_URL** に設定する。接続文字列の実値をチャットやログへ掲載しない。
4. Railway内に配置するAPIからは、同一プロジェクト内DBの内部用DATABASE_URLを参照する。ローカル用公開URLと混同しない。
5. 初期の課題専用・未公開DBを開発用として使うなら、次のコマンドを検討する。

```sh
npx prisma validate --config ./prisma7.config.ts
npx prisma migrate dev --name init --config ./prisma7.config.ts
npx prisma generate --config ./prisma7.config.ts
```

`migrate dev`は開発用で、shadow databaseが必要。DB権限等でエラーが出たら、まずエラー内容を確認する。リセットやデータ削除へ安易に進まない。

初回からCHECK制約をSQLへ追加する場合は、`migrate dev --name init --create-only --config ./prisma7.config.ts`で作成し、適用前にSQLを編集する。

公開・提出用環境では、作成済みマイグレーションを以下で適用する。deployコマンド自体はマイグレーションを新規作成しない。

```sh
npx prisma migrate deploy --config ./prisma7.config.ts
```

6. TypeScriptと最小GETを実装・ビルド後、GitHubリポジトリからAPIをデプロイする。
7. RailwayのBuildはnpm run build、Startはnpm startが基本。ただしビルド時にprisma generateも実行する構成が必要（生成先はGit管理外）。
8. Expressは0.0.0.0とRailwayから渡されるPORTで待ち受ける。
9. APIサービスのGenerate Domainで公開URLを作り、Insomniaから確認する。

現在はAPIが未完成なので、GitHub連携しただけでデプロイ成功する状態ではない。まずDB接続を確認し、その後GETの公開まで進めたい。

## APIの確定情報

| 操作 | メソッド・パス |
| --- | --- |
| 作成 | POST /signup |
| 取得 | GET /users/{user_id} |
| 更新 | PATCH /users/{user_id} |
| 削除 | POST /close |

レスポンスは基本JSON。Expressでのパラメーター表記は `/users/:user_id`。

認証はAuthorizationヘッダーのBasic認証：

```text
Authorization: Basic base64(user_id + ":" + password)
```

想定構成はsignup以外の3操作へ共通認証を適用する形。Base64の復号だけで認証成功にせず、DB情報と照合する。復号した文字列は最初のコロンでIDとパスワードを分ける。認証用IDと、URLで指定された対象IDは区別する。他人の情報取得可否など、操作権限の詳細はまだ未確認。

### GET

成功時（200想定）：

```json
{
  "message": "User details by user_id",
  "user": {
    "user_id": "TaroYamada",
    "nickname": "たろー",
    "comment": "僕は元気です"
  }
}
```

commentがない成功例もある：

```json
{
  "message": "User details by user_id",
  "user": {
    "user_id": "TaroYamada",
    "nickname": "TaroYamada"
  }
}
```

404：

```json
{"message":"No user found"}
```

401：

```json
{"message":"Authentication failed"}
```

公開用Userにはパスワードを含めない。PrismaのDBモデルをそのままJSONへ返さず、返す項目を選ぶ。

### 作成時の入力・出力例

```json
{
  "user_id": "TaroYamada",
  "password": "PaSSwd4TY"
}
```

```json
{
  "message": "Account successfully created",
  "user": {
    "user_id": "TaroYamada",
    "nickname": "TaroYamada"
  }
}
```

失敗時の形：

```json
{
  "message": "Account creation failed",
  "cause": "Already same user_id is used"
}
```

causeの既知の文言：

- Required user_id and password
- Input length is incorrect
- Incorrect character pattern
- Already same user_id is used

作成時の成功・失敗ステータスは資料からまだ確認できていない。勝手に201・400・409等へ確定しない。

## 入力制約・保存方針

| 項目 | 条件 |
| --- | --- |
| user_id | 必須、6〜20文字、半角英数字、重複不可 |
| password | 必須、8〜20文字、空白・制御文字を除くASCII文字 |
| nickname | 任意、30文字以内、制御コード以外の任意の文字。空文字で初期値のユーザーIDへ戻す |
| comment | 任意、100文字以内、制御コード以外の任意の文字。空文字でクリア |

パスワード条件はユーザーの説明に「半角英数」という表現もあるが、詳細の「空白・制御文字を除くASCII」に従い記号も許可する案で整理している。

PATCHでは未指定と空文字を分け、未指定の項目は変更しない設計。空白だけの文字列を勝手にtrimして空文字扱いにしない。

保存方針の案：nicknameは補完後の実値をNOT NULLで保存し、未設定・クリア済みcommentはNULLで保存する。文字数の数え方、制御コードの厳密な範囲、null・文字列以外の入力の扱い、IDの大小文字の扱いは未確定。

## 採点に関する重要条件

**提出・採点開始前に、user_idがTestで始まるアカウントが存在しない状態にする。**

Testで始まるIDの作成を禁止する意味ではない。初期データには入れず、手動確認にはDevTaro等を使う。

## RESTの参考資料として指定されたもの

- https://ja.wikipedia.org/wiki/Representational_State_Transfer
- https://restfulapi.net/rest-architectural-constraints/
- https://qiita.com/TakahiRoyte/items/949f4e88caecb02119aa

RESTの制約への準拠が必要と言われている。ただしHATEOAS等の具体的な採点範囲は不明。まず課題指定のエンドポイントと入出力を優先し、仕様を勝手に変更しない。

## Railwayの公式資料

- PostgreSQL・内部接続／外部接続：https://docs.railway.com/databases/postgresql
- Expressのデプロイ：https://railway.com/guides/express
- ホストとPORTの設定：https://docs.railway.com/networking/troubleshooting/application-failed-to-respond
