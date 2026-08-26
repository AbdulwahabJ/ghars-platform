CREATE TYPE "public"."activation_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE TABLE "tenant_owner_email_claims" (
	"email" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_owner_email_claims_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "tenant_owner_email_claims_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "tenant_owner_email_claims_normalized_email" CHECK ("email" = lower("email"))
);--> statement-breakpoint
CREATE TABLE "tenant_activation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"status" "activation_request_status" DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "tenant_owner_email_claims" ADD CONSTRAINT "tenant_owner_email_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "tenant_owner_email_claims" ADD CONSTRAINT "tenant_owner_email_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "tenant_activation_requests" ADD CONSTRAINT "tenant_activation_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "tenant_activation_requests" ADD CONSTRAINT "tenant_activation_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "tenant_activation_requests" ADD CONSTRAINT "tenant_activation_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id");--> statement-breakpoint
CREATE INDEX "IDX_email_verification_tokens_tenant_user" ON "email_verification_tokens" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "IDX_email_verification_tokens_expires" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "IDX_tenant_activation_requests_tenant" ON "tenant_activation_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_tenant_activation_requests_status" ON "tenant_activation_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_tenant_activation_requests_pending" ON "tenant_activation_requests" USING btree ("tenant_id") WHERE "status" = 'PENDING';