-- AlterTable: clients.cnpj (upsert key for NF-e import)
ALTER TABLE "clients" ADD COLUMN "cnpj" TEXT;
CREATE UNIQUE INDEX "clients_cnpj_key" ON "clients"("cnpj");

-- AlterTable: source tracking on receivables/sales/expenses
ALTER TABLE "receivables" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "sales" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "expenses" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "imported_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "filePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IMPORTADO',
    "errorMessage" TEXT,
    "createdIds" TEXT,
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "imported_documents_source_externalId_key" ON "imported_documents"("source", "externalId");
CREATE INDEX "imported_documents_source_idx" ON "imported_documents"("source");
