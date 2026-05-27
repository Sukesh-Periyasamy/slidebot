-- CreateTable: workspaces
CREATE TABLE "workspaces" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable: workspace_members
CREATE TABLE "workspace_members" (
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateIndex
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- AddColumn: decks.workspaceId (nullable FK to workspaces)
ALTER TABLE "decks" ADD COLUMN "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "decks_workspaceId_idx" ON "decks"("workspaceId");

-- ForeignKeys
ALTER TABLE "workspaces"
ADD CONSTRAINT "workspaces_ownerId_fkey"
FOREIGN KEY ("ownerId")
REFERENCES "users"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "workspace_members"
ADD CONSTRAINT "workspace_members_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "workspaces"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "workspace_members"
ADD CONSTRAINT "workspace_members_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "decks"
ADD CONSTRAINT "decks_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "workspaces"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
