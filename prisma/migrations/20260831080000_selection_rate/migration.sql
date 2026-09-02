-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "impressions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "priorRate" REAL NOT NULL DEFAULT 0.5;
ALTER TABLE "Merchant" ADD COLUMN "selections" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Merchant_name_idx" ON "Merchant"("name");

-- CreateTable
CREATE TABLE "RecommendSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "needsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecommendImpression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "rank" INTEGER,
    CONSTRAINT "RecommendImpression_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecommendSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecommendImpression_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserChoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserChoice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecommendSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserChoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendImpression_sessionId_merchantId_key" ON "RecommendImpression"("sessionId", "merchantId");

-- CreateIndex
CREATE INDEX "RecommendImpression_merchantId_idx" ON "RecommendImpression"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserChoice_sessionId_key" ON "UserChoice"("sessionId");

-- CreateIndex
CREATE INDEX "UserChoice_merchantId_idx" ON "UserChoice"("merchantId");
