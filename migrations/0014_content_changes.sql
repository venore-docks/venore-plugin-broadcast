CREATE TABLE "broadcast"."content_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"use_case" text NOT NULL,
	"entity_type" text NOT NULL,
	"target_id" text,
	"playlist_id" text,
	"payload" jsonb NOT NULL,
	"previous_snapshot" jsonb,
	"result_snapshot" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"rejection_reason" text,
	"failure_reason" text,
	CONSTRAINT "broadcast_content_changes_entity_type_check" CHECK ("broadcast"."content_changes"."entity_type" in ('playlist_item','alert','takeover')),
	CONSTRAINT "broadcast_content_changes_status_check" CHECK ("broadcast"."content_changes"."status" in ('pending','approved','rejected','auto_approved','cancelled','failed'))
);
--> statement-breakpoint
CREATE INDEX "broadcast_content_changes_status_idx" ON "broadcast"."content_changes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "broadcast_content_changes_playlist_id_idx" ON "broadcast"."content_changes" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "broadcast_content_changes_requested_by_idx" ON "broadcast"."content_changes" USING btree ("requested_by");