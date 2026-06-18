-- Phase 19A: Project Intelligence Foundation
-- Adds Project table and optional projectId FK on EngineeringMemory.
-- projectId is nullable — existing memory rows are unaffected (no back-fill needed).

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- AlterTable: add nullable projectId column to EngineeringMemory
ALTER TABLE "EngineeringMemory" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "EngineeringMemory_projectId_idx" ON "EngineeringMemory"("projectId");

-- AddForeignKey
ALTER TABLE "EngineeringMemory" ADD CONSTRAINT "EngineeringMemory_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
