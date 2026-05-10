/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddViewOwnerRequest } from '../models/AddViewOwnerRequest';
import type { CorpOverviewView } from '../models/CorpOverviewView';
import type { CreateCorpOverviewViewRequest } from '../models/CreateCorpOverviewViewRequest';
import type { UpdateCorpOverviewViewRequest } from '../models/UpdateCorpOverviewViewRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CorpOverviewViewsService {
    /**
     * List the caller's own views plus all public views from other corp members.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static list(): CancelablePromise<Array<CorpOverviewView>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/corp-overview-views',
        });
    }
    /**
     * Create a new view. The caller becomes the sole initial owner; other owners
     * can be added via the owner-management endpoints.
     * @returns CorpOverviewView View created
     * @throws ApiError
     */
    public static create({
        requestBody,
    }: {
        requestBody: CreateCorpOverviewViewRequest,
    }): CancelablePromise<CorpOverviewView> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/corp-overview-views',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get all pinned views. These appear globally for all users on Corp Overview.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static getPinned(): CancelablePromise<Array<CorpOverviewView>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/corp-overview-views/pinned',
        });
    }
    /**
     * Browse all public views with optional name search. Paginated.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static browse({
        search,
        page,
    }: {
        search?: string,
        page?: number,
    }): CancelablePromise<Array<CorpOverviewView>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/corp-overview-views/browse',
            query: {
                'search': search,
                'page': page,
            },
        });
    }
    /**
     * Get a view by ID. Private views are only accessible by their owners.
     * Unlisted views are accessible by any authenticated user with the ID.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static getById({
        id,
    }: {
        id: number,
    }): CancelablePromise<CorpOverviewView> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/corp-overview-views/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update a view. Only owners can update.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static update({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateCorpOverviewViewRequest,
    }): CancelablePromise<CorpOverviewView> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/corp-overview-views/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Soft-delete a view. Only owners can delete. The row is preserved with
     * `deletedAt` set so admins can recover it in a future revision.
     * @returns void
     * @throws ApiError
     */
    public static delete({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/corp-overview-views/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Toggle the pinned state. Requires `filters.pin` permission. Only public
     * views can be pinned (pinning makes them visible to everyone).
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static togglePin({
        id,
    }: {
        id: number,
    }): CancelablePromise<CorpOverviewView> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/corp-overview-views/{id}/pin',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Add a user as an owner of a view. Caller must already be an owner. The
     * action is immediate (it has its own endpoint rather than riding on the
     * dirty/save flow) so granting access takes effect at click time.
     *
     * - 404 if the view doesn't exist or is soft-deleted.
     * - 403 if the caller isn't an owner.
     * - 400 if the target userId is invalid.
     * - 404 if the target user doesn't exist.
     * - 409 if the target is already an owner.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static addOwner({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: AddViewOwnerRequest,
    }): CancelablePromise<CorpOverviewView> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/corp-overview-views/{id}/owners',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Remove a user from a view's owners. Caller must be an owner. Refuses to
     * remove the last owner — delete the view instead if that's the goal.
     *
     * - 404 if the view doesn't exist or the target isn't an owner.
     * - 403 if the caller isn't an owner.
     * - 409 if the removal would leave the view with zero owners.
     * @returns CorpOverviewView Ok
     * @throws ApiError
     */
    public static removeOwner({
        id,
        userId,
    }: {
        id: number,
        userId: number,
    }): CancelablePromise<CorpOverviewView> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/corp-overview-views/{id}/owners/{userId}',
            path: {
                'id': id,
                'userId': userId,
            },
        });
    }
    /**
     * Record that the caller visited this view. Idempotent upsert of
     * `(userId, viewId, lastVisitedAt = now)`. Frontend posts this after a
     * successful unlisted deep-link load so the view appears in the selector
     * across the user's devices on subsequent sessions.
     *
     * Permissions mirror `getById`: anyone with view access can record a visit.
     * Recording a visit on a view the caller already owns or can see publicly
     * is a no-op semantically — the row exists but the list query already
     * surfaced the view through other branches of the union.
     * @returns void
     * @throws ApiError
     */
    public static recordVisit({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/corp-overview-views/{id}/visit',
            path: {
                'id': id,
            },
        });
    }
}
