-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);
