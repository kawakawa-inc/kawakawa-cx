CREATE TABLE "discord_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(255) NOT NULL,
	"discord_id" varchar(50) NOT NULL,
	"discord_username" varchar(100) NOT NULL,
	"discord_avatar" varchar(255),
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discord_link_tokens_token_unique" UNIQUE("token")
);
