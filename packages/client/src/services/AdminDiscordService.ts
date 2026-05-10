/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChannelConfigMap } from '../models/ChannelConfigMap';
import type { DiscordRole } from '../models/DiscordRole';
import type { DiscordRoleMapping } from '../models/DiscordRoleMapping';
import type { DiscordRoleMappingRequest } from '../models/DiscordRoleMappingRequest';
import type { DiscordSettings } from '../models/DiscordSettings';
import type { DiscordTestConnectionResponse } from '../models/DiscordTestConnectionResponse';
import type { SettingHistoryEntry } from '../models/SettingHistoryEntry';
import type { UpdateChannelConfigRequest } from '../models/UpdateChannelConfigRequest';
import type { UpdateDiscordSettingsRequest } from '../models/UpdateDiscordSettingsRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminDiscordService {
    /**
     * Get current Discord settings
     * Secrets are masked (only returns hasClientSecret, hasBotToken booleans)
     * @returns DiscordSettings Ok
     * @throws ApiError
     */
    public static getSettings(): CancelablePromise<DiscordSettings> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/settings',
        });
    }
    /**
     * Update Discord settings
     * Can update any combination of settings
     * @returns DiscordSettings Ok
     * @throws ApiError
     */
    public static updateSettings({
        requestBody,
    }: {
        requestBody: UpdateDiscordSettingsRequest,
    }): CancelablePromise<DiscordSettings> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/admin/discord/settings',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Test Discord connection
     * Validates bot token and guild access
     * @returns DiscordTestConnectionResponse Ok
     * @throws ApiError
     */
    public static testConnection(): CancelablePromise<DiscordTestConnectionResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/admin/discord/settings/test-connection',
        });
    }
    /**
     * Get roles from the configured Discord guild
     * Requires bot token and guild ID to be configured
     * @returns DiscordRole Ok
     * @throws ApiError
     */
    public static getGuildRoles(): CancelablePromise<Array<DiscordRole>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/guild/roles',
        });
    }
    /**
     * Get text channels from the configured Discord server
     * @returns any Ok
     * @throws ApiError
     */
    public static getGuildChannels(): CancelablePromise<Array<{
        name: string;
        id: string;
    }>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/guild/channels',
        });
    }
    /**
     * List all Discord role mappings
     * @returns DiscordRoleMapping Ok
     * @throws ApiError
     */
    public static listRoleMappings(): CancelablePromise<Array<DiscordRoleMapping>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/role-mappings',
        });
    }
    /**
     * Create a new Discord role mapping
     * @returns DiscordRoleMapping Ok
     * @throws ApiError
     */
    public static createRoleMapping({
        requestBody,
    }: {
        requestBody: DiscordRoleMappingRequest,
    }): CancelablePromise<DiscordRoleMapping> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/admin/discord/role-mappings',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Update a Discord role mapping
     * @returns DiscordRoleMapping Ok
     * @throws ApiError
     */
    public static updateRoleMapping({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: DiscordRoleMappingRequest,
    }): CancelablePromise<DiscordRoleMapping> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/admin/discord/role-mappings/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a Discord role mapping
     * @returns void
     * @throws ApiError
     */
    public static deleteRoleMapping({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/admin/discord/role-mappings/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get settings change history for a specific key
     * @returns SettingHistoryEntry Ok
     * @throws ApiError
     */
    public static getSettingsHistory({
        key,
    }: {
        key: string,
    }): CancelablePromise<Array<SettingHistoryEntry>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/settings/history/{key}',
            path: {
                'key': key,
            },
        });
    }
    /**
     * List all configured channels with their full config
     * @returns ChannelConfigMap Ok
     * @throws ApiError
     */
    public static listChannelConfigs(): CancelablePromise<Array<ChannelConfigMap>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/channel-config',
        });
    }
    /**
     * Get all config for a specific channel as a map
     * @returns ChannelConfigMap Ok
     * @throws ApiError
     */
    public static getChannelConfig({
        channelId,
    }: {
        channelId: string,
    }): CancelablePromise<ChannelConfigMap> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/discord/channel-config/{channelId}',
            path: {
                'channelId': channelId,
            },
        });
    }
    /**
     * Update channel config (partial update - upserts each key)
     * @returns ChannelConfigMap Ok
     * @throws ApiError
     */
    public static updateChannelConfig({
        channelId,
        requestBody,
    }: {
        channelId: string,
        requestBody: UpdateChannelConfigRequest,
    }): CancelablePromise<ChannelConfigMap> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/admin/discord/channel-config/{channelId}',
            path: {
                'channelId': channelId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete all config for a specific channel
     * @returns void
     * @throws ApiError
     */
    public static deleteChannelConfig({
        channelId,
    }: {
        channelId: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/admin/discord/channel-config/{channelId}',
            path: {
                'channelId': channelId,
            },
        });
    }
}
