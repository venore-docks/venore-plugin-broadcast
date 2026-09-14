CREATE TABLE "broadcast"."scheduled_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"target" text,
	"active_days" integer NOT NULL,
	"active_start_minute" integer NOT NULL,
	"active_end_minute" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
