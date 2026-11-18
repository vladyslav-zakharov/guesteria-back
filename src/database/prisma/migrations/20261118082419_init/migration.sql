-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."prebooks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lite_prebook_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "hotel_name" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "board_name" TEXT NOT NULL,
    "checkin" DATE NOT NULL,
    "checkout" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children_ages" INTEGER[],
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "cancellation_deadline" TIMESTAMPTZ,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bookings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "prebook_id" UUID NOT NULL,
    "lite_booking_id" TEXT NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "hotel_id" TEXT NOT NULL,
    "hotel_name" TEXT NOT NULL,
    "hotel_photo_url" TEXT,
    "hotel_address" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "board_name" TEXT NOT NULL,
    "checkin" DATE NOT NULL,
    "checkout" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children_ages" INTEGER[],
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "cancellation_deadline" TIMESTAMPTZ,
    "guest_first_name" TEXT NOT NULL,
    "guest_last_name" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "guest_phone" TEXT NOT NULL,
    "special_requests" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "public"."ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_usages" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usages_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "prebooks_lite_prebook_id_key" ON "public"."prebooks"("lite_prebook_id");

-- CreateIndex
CREATE INDEX "prebooks_user_id_idx" ON "public"."prebooks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_prebook_id_key" ON "public"."bookings"("prebook_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_lite_booking_id_key" ON "public"."bookings"("lite_booking_id");

-- CreateIndex
CREATE INDEX "bookings_user_id_checkin_idx" ON "public"."bookings"("user_id", "checkin");

-- CreateIndex
CREATE INDEX "chat_messages_booking_id_created_at_idx" ON "public"."chat_messages"("booking_id", "created_at");

-- AddForeignKey
ALTER TABLE "public"."prebooks" ADD CONSTRAINT "prebooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_prebook_id_fkey" FOREIGN KEY ("prebook_id") REFERENCES "public"."prebooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_usages" ADD CONSTRAINT "ai_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
