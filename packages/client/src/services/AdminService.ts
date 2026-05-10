/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminUser } from '../models/AdminUser'
import type { AdminUserListResponse } from '../models/AdminUserListResponse'
import type { CreateRoleRequest } from '../models/CreateRoleRequest'
import type { PasswordResetLinkResponse } from '../models/PasswordResetLinkResponse'
import type { Permission } from '../models/Permission'
import type { PriceSettingsResponse } from '../models/PriceSettingsResponse'
import type { Role } from '../models/Role'
import type { RolePermission } from '../models/RolePermission'
import type { RolePermissionWithDetails } from '../models/RolePermissionWithDetails'
import type { SetRolePermissionRequest } from '../models/SetRolePermissionRequest'
import type { UpdateFioSettingsRequest } from '../models/UpdateFioSettingsRequest'
import type { UpdateGoogleSettingsRequest } from '../models/UpdateGoogleSettingsRequest'
import type { UpdateRoleRequest } from '../models/UpdateRoleRequest'
import type { UpdateUserRequest } from '../models/UpdateUserRequest'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class AdminService {
  /**
   * Get current pricing settings
   * @returns PriceSettingsResponse Ok
   * @throws ApiError
   */
  public static getSettings(): CancelablePromise<PriceSettingsResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/price-settings',
    })
  }
  /**
   * Update FIO API settings
   * @returns PriceSettingsResponse Ok
   * @throws ApiError
   */
  public static updateFioSettings({
    requestBody,
  }: {
    requestBody: UpdateFioSettingsRequest
  }): CancelablePromise<PriceSettingsResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/admin/price-settings/fio',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Update Google Sheets API settings
   * @returns PriceSettingsResponse Ok
   * @throws ApiError
   */
  public static updateGoogleSettings({
    requestBody,
  }: {
    requestBody: UpdateGoogleSettingsRequest
  }): CancelablePromise<PriceSettingsResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/admin/price-settings/google',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * List all users with pagination and optional search
   * @returns AdminUserListResponse Ok
   * @throws ApiError
   */
  public static listUsers({
    page = 1,
    pageSize = 20,
    search,
  }: {
    page?: number
    pageSize?: number
    search?: string
  }): CancelablePromise<AdminUserListResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/users',
      query: {
        page: page,
        pageSize: pageSize,
        search: search,
      },
    })
  }
  /**
   * Get count of users pending approval (unverified users)
   * @returns any Ok
   * @throws ApiError
   */
  public static getPendingApprovalsCount(): CancelablePromise<{
    count: number
  }> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/pending-approvals/count',
    })
  }
  /**
   * List users pending approval (unverified users)
   * @returns AdminUser Ok
   * @throws ApiError
   */
  public static listPendingApprovals(): CancelablePromise<Array<AdminUser>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/pending-approvals',
    })
  }
  /**
   * Approve a user - replace 'unverified' role with specified role (defaults to 'trade-partner')
   * @returns AdminUser Ok
   * @throws ApiError
   */
  public static approveUser({
    userId,
    requestBody,
  }: {
    userId: number
    requestBody: {
      roleId?: string
    }
  }): CancelablePromise<AdminUser> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/admin/users/{userId}/approve',
      path: {
        userId: userId,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Update a user's status or roles
   * @returns AdminUser Ok
   * @throws ApiError
   */
  public static updateUser({
    userId,
    requestBody,
  }: {
    userId: number
    requestBody: UpdateUserRequest
  }): CancelablePromise<AdminUser> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/admin/users/{userId}',
      path: {
        userId: userId,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a user and all their data (admin action)
   * @returns any Ok
   * @throws ApiError
   */
  public static deleteUser({ userId }: { userId: number }): CancelablePromise<{
    username: string
    success: boolean
  }> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/admin/users/{userId}',
      path: {
        userId: userId,
      },
    })
  }
  /**
   * List all available roles
   * @returns Role Ok
   * @throws ApiError
   */
  public static listRoles(): CancelablePromise<Array<Role>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/roles',
    })
  }
  /**
   * Create a new role
   * @returns Role Ok
   * @throws ApiError
   */
  public static createRole({
    requestBody,
  }: {
    requestBody: CreateRoleRequest
  }): CancelablePromise<Role> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/admin/roles',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Update a role's name or color
   * @returns Role Ok
   * @throws ApiError
   */
  public static updateRole({
    roleId,
    requestBody,
  }: {
    roleId: string
    requestBody: UpdateRoleRequest
  }): CancelablePromise<Role> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/admin/roles/{roleId}',
      path: {
        roleId: roleId,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a role (only if no users are assigned to it)
   * @returns any Ok
   * @throws ApiError
   */
  public static deleteRole({ roleId }: { roleId: string }): CancelablePromise<{
    success: boolean
  }> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/admin/roles/{roleId}',
      path: {
        roleId: roleId,
      },
    })
  }
  /**
   * Generate a password reset link for a user.
   * The password is NOT changed until the user uses the link.
   * @returns PasswordResetLinkResponse Ok
   * @throws ApiError
   */
  public static generatePasswordResetLink({
    userId,
  }: {
    userId: number
  }): CancelablePromise<PasswordResetLinkResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/admin/users/{userId}/reset-password',
      path: {
        userId: userId,
      },
    })
  }
  /**
   * Enqueue a full FIO sync (inventory + planets) for a user. Returns 202
   * with job IDs — actual work runs in the sync-worker.
   * @returns any Sync enqueued
   * @throws ApiError
   */
  public static syncUserFio({ userId }: { userId: number }): CancelablePromise<{
    username: string
    jobIds: {
      planets: number
      inventory: number
    }
  }> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/admin/users/{userId}/sync-fio',
      path: {
        userId: userId,
      },
    })
  }
  /**
   * Disconnect a user's Discord account (admin action)
   * @returns any Ok
   * @throws ApiError
   */
  public static disconnectUserDiscord({ userId }: { userId: number }): CancelablePromise<{
    username: string
    success: boolean
  }> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/admin/users/{userId}/discord',
      path: {
        userId: userId,
      },
    })
  }
  /**
   * List all permissions
   * @returns Permission Ok
   * @throws ApiError
   */
  public static listPermissions(): CancelablePromise<Array<Permission>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/permissions',
    })
  }
  /**
   * List all role-permission mappings with details
   * @returns RolePermissionWithDetails Ok
   * @throws ApiError
   */
  public static listRolePermissions(): CancelablePromise<Array<RolePermissionWithDetails>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/admin/role-permissions',
    })
  }
  /**
   * Set a role permission (create or update)
   * @returns RolePermission Ok
   * @throws ApiError
   */
  public static setRolePermission({
    requestBody,
  }: {
    requestBody: SetRolePermissionRequest
  }): CancelablePromise<RolePermission> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/admin/role-permissions',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a role permission mapping
   * @returns any Ok
   * @throws ApiError
   */
  public static deleteRolePermission({ id }: { id: number }): CancelablePromise<{
    success: boolean
  }> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/admin/role-permissions/{id}',
      path: {
        id: id,
      },
    })
  }
}
