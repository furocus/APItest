import "dotenv/config";
import type { Request, RequestHandler, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import type { ApiResponseBody, User } from "./types.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const publicFields = { user_id: true, nickname: true, comment: true } as const;
const invalidProfile = "String length limit exceeded or containing invalid characters";
const controls = /[\u0000-\u001F\u007F-\u009F]/u;
type Handler = RequestHandler<{ user_id: string }, ApiResponseBody, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isObject(error) && error.code === code;
}

function toUser(row: { user_id: string; nickname: string; comment: string | null }): User {
  const user: User = { user_id: row.user_id, nickname: row.nickname };
  if (row.comment !== null) user.comment = row.comment;
  return user;
}

function validProfile(body: Record<string, unknown>): boolean {
  return (["nickname", "comment"] as const).every((key) => {
    const value = body[key];
    if (value === undefined) return true;
    return typeof value === "string"
      && [...value].length <= (key === "nickname" ? 30 : 100)
      && !controls.test(value);
  });
}

function rejectAuth(res: Response<ApiResponseBody>): null {
  res.set("WWW-Authenticate", 'Basic realm="api"');
  res.status(401).json({ message: "Authentication failed" });
  return null;
}

async function authenticate(req: Request, res: Response<ApiResponseBody>): Promise<string | null> {
  const token = req.get("Authorization")?.match(/^Basic +([A-Za-z0-9+/]+={0,2})$/i)?.[1] ?? "";
  const bytes = Buffer.from(token, "base64");
  const decoded = bytes.toString("utf8");
  const separator = decoded.indexOf(":");
  const password = decoded.slice(separator + 1);

  if (separator < 1 || !password || controls.test(decoded)
    || bytes.toString("base64").replace(/=+$/, "") !== token.replace(/=+$/, "")) {
    console.warn("AUTH: invalid Basic header");
    return rejectAuth(res);
  }

  const userId = decoded.slice(0, separator);
  const account = await prisma.user.findUnique({
    where: { user_id: userId }, select: { password: true },
  });
  if (!account || account.password !== password) {
    console.warn(account ? "AUTH: password mismatch" : "AUTH: user not found");
    return rejectAuth(res);
  }
  return userId;
}

export const signupHandler: Handler = async (req, res, next) => {
  const fail = (cause: string) => res.status(400).json({ message: "Account creation failed", cause });
  const body = req.body;
  if (!isObject(body) || typeof body.user_id !== "string" || typeof body.password !== "string"
    || body.user_id === "" || body.password === "") {
    fail("Required user_id and password");
    return;
  }
  const { user_id, password } = body;
  if (user_id.length < 6 || user_id.length > 20 || password.length < 8 || password.length > 20) {
    fail("Input length is incorrect");
    return;
  }
  if (/[^A-Za-z0-9]/u.test(user_id) || /[^\x21-\x7E]/u.test(password)) {
    fail("Incorrect character pattern");
    return;
  }
  if (!validProfile(body)) {
    fail(invalidProfile);
    return;
  }
  try {
    const row = await prisma.user.create({
      data: {
        user_id, password,
        nickname: typeof body.nickname === "string" && body.nickname !== "" ? body.nickname : user_id,
        comment: typeof body.comment === "string" && body.comment !== "" ? body.comment : null,
      },
      select: publicFields,
    });
    // 成功ステータスは未共有のため暫定200。
    res.status(200).json({ message: "Account successfully created", user: toUser(row) });
  } catch (error) {
    if (hasErrorCode(error, "P2002")) {
      fail("Already same user_id is used");
      return;
    }
    next(error);
  }
};

export const getUserHandler: Handler = async (req, res, next) => {
  try {
    if (await authenticate(req, res) === null) return;
    const row = await prisma.user.findUnique({
      where: { user_id: req.params.user_id }, select: publicFields,
    });
    if (!row) {
      res.status(404).json({ message: "No user found" });
      return;
    }
    res.status(200).json({ message: "User details by user_id", user: toUser(row) });
  } catch (error) {
    next(error);
  }
};

export const updateUserHandler: Handler = async (req, res, next) => {
  const fail = (cause: string) => res.status(400).json({ message: "User updation failed", cause });
  try {
    const authUserId = await authenticate(req, res);
    if (authUserId === null) return;
    const existing = await prisma.user.findUnique({
      where: { user_id: req.params.user_id }, select: { user_id: true },
    });
    if (!existing) {
      res.status(404).json({ message: "No user found" });
      return;
    }
    if (authUserId !== req.params.user_id) {
      res.status(403).json({ message: "No permission for update" });
      return;
    }
    const body = req.body;
    if (!isObject(body)) {
      fail(invalidProfile);
      return;
    }
    if ("user_id" in body || "password" in body) {
      fail("Not updatable user_id and password");
      return;
    }
    if (!("nickname" in body) && !("comment" in body)) {
      fail("Required nickname or comment");
      return;
    }
    if (!validProfile(body)) {
      fail(invalidProfile);
      return;
    }
    const data: { nickname?: string; comment?: string | null } = {};
    if (typeof body.nickname === "string") data.nickname = body.nickname === "" ? authUserId : body.nickname;
    if (typeof body.comment === "string") data.comment = body.comment === "" ? null : body.comment;
    const row = await prisma.user.update({
      where: { user_id: authUserId }, data, select: publicFields,
    });
    res.status(200).json({ message: "User successfully updated", user: toUser(row) });
  } catch (error) {
    if (hasErrorCode(error, "P2025")) {
      res.status(404).json({ message: "No user found" });
      return;
    }
    next(error);
  }
};

export const closeAccountHandler: Handler = async (req, res, next) => {
  try {
    const authUserId = await authenticate(req, res);
    if (authUserId === null) return;
    await prisma.user.delete({ where: { user_id: authUserId } });
    res.status(200).json({ message: "Account and user successfully removed" });
  } catch (error) {
    if (hasErrorCode(error, "P2025")) {
      rejectAuth(res);
      return;
    }
    next(error);
  }
};
