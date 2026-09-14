ALTER TABLE "broadcast"."playlist_items" ADD COLUMN "file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "broadcast"."playlist_items" ADD COLUMN "file_sha256" text;