-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "avgPrice" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "district" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "sentiment" TEXT NOT NULL,
    CONSTRAINT "Review_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Tag_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Merchant_cuisine_idx" ON "Merchant"("cuisine");

-- CreateIndex
CREATE INDEX "Merchant_district_idx" ON "Merchant"("district");

-- CreateIndex
CREATE INDEX "Merchant_avgPrice_idx" ON "Merchant"("avgPrice");

-- CreateIndex
CREATE INDEX "Review_merchantId_idx" ON "Review"("merchantId");

-- CreateIndex
CREATE INDEX "Review_publishedAt_idx" ON "Review"("publishedAt");

-- CreateIndex
CREATE INDEX "Review_sentiment_idx" ON "Review"("sentiment");

-- CreateIndex
CREATE INDEX "Tag_reviewId_idx" ON "Tag"("reviewId");

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag"("name");
