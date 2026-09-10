ALTER TABLE "broadcast"."playlists" ADD COLUMN "owner_output_id" text;--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD CONSTRAINT "playlists_owner_output_id_outputs_id_fk" FOREIGN KEY ("owner_output_id") REFERENCES "broadcast"."outputs"("id") ON DELETE set null ON UPDATE no action;
