import assert from "node:assert/strict";
import { mock, test } from "node:test";

// 実DBには接続しない。PrismaだけをメモリDBに差し替える。
const rows = new Map();
const pick = (row, select) => row ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : null;
const user = {
  async findUnique({where, select}) { return pick(rows.get(where.user_id), select); },
  async create({data, select}) {
    if (rows.has(data.user_id)) throw {code: "P2002"};
    rows.set(data.user_id, {...data}); return pick(data, select);
  },
  async update({where, data, select}) {
    const row = rows.get(where.user_id);
    if (!row) throw {code: "P2025"};
    Object.assign(row, data); return pick(row, select);
  },
  async delete({where}) { rows.delete(where.user_id); },
};
mock.module("../dist/generated/prisma/client.js", {namedExports: {PrismaClient: class { user = user; }}});
mock.module("@prisma/adapter-pg", {namedExports: {PrismaPg: class {}}});
mock.module("dotenv/config", {namedExports: {}});
const {signupHandler: signup, getUserHandler: get, updateUserHandler: patch, closeAccountHandler: close} = await import("../dist/function.js");
const auth = (id = "DevTaro", pw = "DevPass123!") => `Basic ${Buffer.from(`${id}:${pw}`).toString("base64")}`;
async function call(handler, body, authorization, id = "DevTaro") {
  const result = {status: 200};
  const req = {body, params: {user_id: id}, get: () => authorization};
  const res = {
    set() {return this;}, status(code) {result.status = code; return this;},
    json(body) {result.body = body; return this;},
  };
  await handler(req, res, error => {throw error;}); return result;
}

test("CRUD・認証・重複・更新リセット・入力制約", async () => {
  const body = {user_id: "DevTaro", password: "DevPass123!"};
  let result = await call(signup, body);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {message: "Account successfully created", user: {user_id: "DevTaro", nickname: "DevTaro"}});
  result = await call(signup, body);
  assert.equal(result.status, 400); assert.equal(result.body.cause, "Already same user_id is used");
  assert.equal((await call(get)).status, 401);
  assert.equal((await call(get, undefined, auth("DevTaro", "wrong"))).status, 401);
  assert.equal((await call(get, undefined, auth(), "MissingUser")).status, 404);
  result = await call(get, undefined, auth());
  assert.equal(result.status, 200); assert.equal("password" in result.body.user, false);
  result = await call(patch, {nickname: "たろー", comment: "僕は元気です"}, auth());
  assert.deepEqual(result.body, {message: "User successfully updated", user: {user_id: "DevTaro", nickname: "たろー", comment: "僕は元気です"}});
  result = await call(patch, {nickname: " "}, auth());
  assert.equal(result.body.user.nickname, " "); assert.equal(result.body.user.comment, "僕は元気です");
  for (const changes of [{nickname: "あ".repeat(31)}, {comment: "あ".repeat(101)}, {nickname: "name\n"}, {comment: "\u0085"}, {nickname: null}]) {
    result = await call(patch, changes, auth());
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, {message: "User updation failed", cause: "String length limit exceeded or containing invalid characters"});
  }
  assert.equal((await call(patch, {nickname: "😀".repeat(30), comment: "あ".repeat(100)}, auth())).status, 200);
  result = await call(patch, {nickname: "", comment: ""}, auth());
  assert.deepEqual(result.body.user, {user_id: "DevTaro", nickname: "DevTaro"});
  for (const [invalid, cause] of [
    [{}, "Required user_id and password"], [null, "Required user_id and password"],
    [{...body, user_id: "short"}, "Input length is incorrect"],
    [{...body, password: "a".repeat(21)}, "Input length is incorrect"],
    [{...body, user_id: "DevTaro\n"}, "Incorrect character pattern"],
    [{...body, password: "Dev Pass123"}, "Incorrect character pattern"],
  ]) { result = await call(signup, invalid); assert.equal(result.status, 400); assert.equal(result.body.cause, cause); }
  await call(signup, {user_id: "DevOther", password: "Abcd:123"});
  assert.equal((await call(patch, {nickname: "変更"}, auth(), "DevOther")).status, 403);
  assert.equal((await call(patch, {password: "NewPass123"}, auth())).status, 400);
  assert.equal((await call(patch, {}, auth())).status, 400);
  assert.equal((await call(get, undefined, "Bearer invalid")).status, 401);
  assert.equal((await call(get, undefined, auth("DevOther", "Abcd:123"), "DevOther")).status, 200);
  result = await call(close, undefined, auth());
  assert.deepEqual(result.body, {message: "Account and user successfully removed"});
  assert.equal(rows.has("DevTaro"), false);
  assert.equal((await call(get, undefined, auth())).status, 401);
});
