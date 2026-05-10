/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserDiscordProfile } from './UserDiscordProfile';
export type DiscordConnectionStatus = {
    connected: boolean;
    profile: UserDiscordProfile | null;
    isMemberOfGuild: boolean | null;
    guildRoles: Array<string> | null;
};

