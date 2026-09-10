CREATE TABLE "broadcast"."playback_log" (
	"id" text PRIMARY KEY NOT NULL,
	"output_id" text NOT NULL,
	"playlist_item_id" text,
	"item_label" text NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "broadcast_playback_log_played_at_idx" ON "broadcast"."playback_log" USING btree ("played_at");
