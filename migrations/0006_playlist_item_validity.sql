ALTER TABLE "broadcast"."playlist_items" ADD COLUMN "visible_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "broadcast"."playlist_items" ADD COLUMN "visible_until" timestamp with time zone;
