/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Notification } from '../models/Notification';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class NotificationsService {
    /**
     * Get notifications for the current user
     * @returns Notification Ok
     * @throws ApiError
     */
    public static getNotifications({
        limit,
        offset,
        unreadOnly,
    }: {
        /**
         * Maximum number of notifications to return (default 50)
         */
        limit?: number,
        /**
         * Number of notifications to skip (default 0)
         */
        offset?: number,
        /**
         * Only return unread notifications (default false)
         */
        unreadOnly?: boolean,
    }): CancelablePromise<Array<Notification>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/notifications',
            query: {
                'limit': limit,
                'offset': offset,
                'unreadOnly': unreadOnly,
            },
        });
    }
    /**
     * Mark a notification as read
     * @returns void
     * @throws ApiError
     */
    public static markAsRead({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/notifications/{id}/read',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Mark all notifications as read
     * @returns any All notifications marked as read
     * @throws ApiError
     */
    public static markAllAsRead(): CancelablePromise<{
        count: number;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/notifications/read-all',
        });
    }
    /**
     * Delete a notification
     * @returns void
     * @throws ApiError
     */
    public static deleteNotification({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/notifications/{id}',
            path: {
                'id': id,
            },
        });
    }
}
