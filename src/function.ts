import "dotenv/config";
import type { RequestHandler } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import type { User, GetUserResponseBody } from "./types.js";

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});

export const getUserHandler: RequestHandler<
    { user_id: string },
    GetUserResponseBody
> = async (req, res, next) => {
    res.set("Cache-Control", "no-store");

    try{
        const token = req.get("Authorization") ?.match(/^Basic +([A-Za-z0-9+/]+={0,2})$/i)?.[1] ?? "";

        const bytes = Buffer.from(token, "base64");
        const decoded = bytes.toString("utf8");
        const separator = decoded.indexOf(":");
        const authUserId = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);

        const validEncoding = bytes.toString("base64").replace(/=+$/, "") === token.replace(/=+$/, "");

        if(
            separator < 1 ||
            !password ||
            !validEncoding ||
            /[\x00-\x1F\x7F]/.test(decoded)
        ) {
            res.set("WWW-Authenticate", 'Basic realm="api"');
            res.status(401).json({ message: "Authentication failed" });
            return;
        }

        const account = await prisma.user.findUnique({
            where: { user_id: authUserId },
            select: { password: true },
        });

        if (!account || account.password !== password) {
            res.set("WWW-Authenticate", 'Basic realm="api"');
            res.status(401).json({ message: "Authentication failed" });
            return;
        }

        const row = await prisma.user.findUnique({
            where: { user_id: req.params.user_id },
            select: { user_id: true, nickname: true, comment: true },
        });

        if(!row) {
            res.status(404).json({ message: "No user found" });
            return;
        }

        const user: User = {
            user_id: row.user_id,
            nickname: row.nickname,
        };

        if(row.comment !== null) {
            user.comment = row.comment;
        }

        res.status(200).json({
            message: "User details by user_id",
            user,
        })

    } catch(error) {
        next(error);
    }
};