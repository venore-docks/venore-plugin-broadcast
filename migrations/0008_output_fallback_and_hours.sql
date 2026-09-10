ALTER TABLE "broadcast"."outputs" ADD COLUMN "fallback_media_asset_id" text;--> statement-breakpoint
ALTER TABLE "broadcast"."outputs" ADD COLUMN "fallback_message" text;--> statement-breakpoint
ALTER TABLE "broadcast"."outputs" ADD COLUMN "active_days" integer;--> statement-breakpoint
ALTER TABLE "broadcast"."outputs" ADD COLUMN "active_start_minute" integer;--> statement-breakpoint
ALTER TABLE "broadcast"."outputs" ADD COLUMN "active_end_minute" integer;
