-- Deck persistence fields
ALTER TABLE "decks"
ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "storage_path" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "slides" INTEGER NOT NULL DEFAULT 1;

-- Room status enum
DO $$ BEGIN
  CREATE TYPE "RoomStatus" AS ENUM ('active', 'ended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Room participant role enum
DO $$ BEGIN
  CREATE TYPE "RoomParticipantRole" AS ENUM ('presenter', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Rooms
CREATE TABLE IF NOT EXISTS "rooms" (
  "id" TEXT NOT NULL,
  "deck_id" TEXT NOT NULL,
  "presenter_id" TEXT NOT NULL,
  "status" "RoomStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rooms_deck_id_idx" ON "rooms"("deck_id");
CREATE INDEX IF NOT EXISTS "rooms_presenter_id_idx" ON "rooms"("presenter_id");

DO $$ BEGIN
  ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_deck_id_fkey"
  FOREIGN KEY ("deck_id") REFERENCES "decks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_presenter_id_fkey"
  FOREIGN KEY ("presenter_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Room participants
CREATE TABLE IF NOT EXISTS "room_participants" (
  "room_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "RoomParticipantRole" NOT NULL DEFAULT 'viewer',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "left_at" TIMESTAMP(3),
  CONSTRAINT "room_participants_pkey" PRIMARY KEY ("room_id","user_id")
);

CREATE INDEX IF NOT EXISTS "room_participants_room_id_left_at_idx" ON "room_participants"("room_id","left_at");

DO $$ BEGIN
  ALTER TABLE "room_participants"
  ADD CONSTRAINT "room_participants_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "room_participants"
  ADD CONSTRAINT "room_participants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
