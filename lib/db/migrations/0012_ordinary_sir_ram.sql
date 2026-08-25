CREATE TYPE "public"."locale" AS ENUM('ar', 'en');--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "locale" "locale" DEFAULT 'ar' NOT NULL;--> statement-breakpoint