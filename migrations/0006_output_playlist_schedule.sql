CREATE TABLE "broadcast"."output_playlist_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"output_id" text NOT NULL,
	"playlist_id" text NOT NULL,
	"days" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast"."output_playlist_schedule" ADD CONSTRAINT "output_playlist_schedule_output_id_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "broadcast"."outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast"."output_playlist_schedule" ADD CONSTRAINT "output_playlist_schedule_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "broadcast"."playlists"("id") ON DELETE cascade ON UPDATE no action;
