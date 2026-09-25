CREATE TABLE "broadcast"."live_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast"."outputs" ADD COLUMN "live_stream_id" text;--> statement-breakpoint
ALTER TABLE "broadcast"."outputs" ADD CONSTRAINT "outputs_live_stream_id_live_streams_id_fk" FOREIGN KEY ("live_stream_id") REFERENCES "broadcast"."live_streams"("id") ON DELETE set null ON UPDATE no action;