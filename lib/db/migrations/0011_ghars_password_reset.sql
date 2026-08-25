ALTER TABLE "users" ADD COLUMN "email" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique"
  ON "users" USING btree (lower("email"))
  WHERE "email" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_password_reset_tokens_user"
  ON "password_reset_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "IDX_password_reset_tokens_expires"
  ON "password_reset_tokens" USING btree ("expires_at");