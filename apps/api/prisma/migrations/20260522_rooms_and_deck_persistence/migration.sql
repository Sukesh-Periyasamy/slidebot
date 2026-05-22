-- CreateTable
CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "slides" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
  "id" TEXT NOT NULL,
  "deckId" TEXT NOT NULL,
  "presenterId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),

  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_participants" (
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),

  CONSTRAINT "room_participants_pkey" PRIMARY KEY ("roomId","userId")
);

-- Foreign Keys
ALTER TABLE "decks"
ADD CONSTRAINT "decks_ownerId_fkey"
FOREIGN KEY ("ownerId")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "rooms"
ADD CONSTRAINT "rooms_deckId_fkey"
FOREIGN KEY ("deckId")
REFERENCES "decks"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "rooms"
ADD CONSTRAINT "rooms_presenterId_fkey"
FOREIGN KEY ("presenterId")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "room_participants"
ADD CONSTRAINT "room_participants_roomId_fkey"
FOREIGN KEY ("roomId")
REFERENCES "rooms"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "room_participants"
ADD CONSTRAINT "room_participants_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
