ALTER TABLE "broadcast"."outputs" ADD COLUMN "frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "broadcast"."takeover" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"media_asset_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
