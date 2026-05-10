/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateShoppingListRequest } from '../models/CreateShoppingListRequest';
import type { SavedShoppingList } from '../models/SavedShoppingList';
import type { ShoppingListSummary } from '../models/ShoppingListSummary';
import type { UpdateShoppingListRequest } from '../models/UpdateShoppingListRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ShoppingListsService {
    /**
     * Get all shopping lists for the current user
     * @returns ShoppingListSummary Ok
     * @throws ApiError
     */
    public static getLists(): CancelablePromise<Array<ShoppingListSummary>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/lists',
        });
    }
    /**
     * Create a new shopping list
     * @returns SavedShoppingList Shopping list created
     * @throws ApiError
     */
    public static createList({
        requestBody,
    }: {
        requestBody: CreateShoppingListRequest,
    }): CancelablePromise<SavedShoppingList> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/lists',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get a specific shopping list by ID
     * @returns SavedShoppingList Ok
     * @throws ApiError
     */
    public static getList({
        id,
    }: {
        id: number,
    }): CancelablePromise<SavedShoppingList> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/lists/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update a shopping list
     * @returns SavedShoppingList Ok
     * @throws ApiError
     */
    public static updateList({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateShoppingListRequest,
    }): CancelablePromise<SavedShoppingList> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/lists/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a shopping list
     * @returns void
     * @throws ApiError
     */
    public static deleteList({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/lists/{id}',
            path: {
                'id': id,
            },
        });
    }
}
