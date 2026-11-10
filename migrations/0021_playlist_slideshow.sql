ALTER TABLE "broadcast"."playlists" ADD COLUMN "slideshow_motion" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD COLUMN "slideshow_motion_strength" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD COLUMN "slideshow_transition" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD COLUMN "slideshow_transition_ms" integer DEFAULT 700 NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD CONSTRAINT "broadcast_playlists_slideshow_motion_check" CHECK ("broadcast"."playlists"."slideshow_motion" in ('none','zoom-in','zoom-out','pan-left','pan-right','pan-up','pan-down','mix'));--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD CONSTRAINT "broadcast_playlists_slideshow_strength_check" CHECK ("broadcast"."playlists"."slideshow_motion_strength" in ('soft','medium','strong'));--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD CONSTRAINT "broadcast_playlists_slideshow_transition_check" CHECK ("broadcast"."playlists"."slideshow_transition" in ('none','fade','slide','zoom','wipe','mix'));--> statement-breakpoint
ALTER TABLE "broadcast"."playlists" ADD CONSTRAINT "broadcast_playlists_slideshow_transition_ms_check" CHECK ("broadcast"."playlists"."slideshow_transition_ms" between 200 and 3000);