import { Body, Controller, Delete, Get, Put, Route, Security, Tags, Request } from 'tsoa'
import type { Role } from '@kawakawa/types'
import { db, users, userRoles, roles } from '../db/index.js'
import { eq, sql } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken, type JwtPayload } from '../utils/jwt.js'
import { issueAuthCookie, revokeAuthCookie } from '../utils/authCookie.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { getPermissions } from '../utils/permissionService.js'

// User profile returned by the account endpoint
// Note: Display preferences (currency, display modes) and FIO credentials are in /user-settings
interface UserProfile {
  username: string
  displayName: string
  email: string | null
  roles: Role[]
  permissions: string[] // Permission IDs granted to this user
  inactiveUntil: string | null // ISO timestamp if on vacation, null otherwise
}

// Update profile request
// Note: FIO credentials and display preferences are now updated via /user-settings
interface UpdateProfileRequest {
  displayName?: string
  email?: string | null
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

interface ChangePasswordResponse {
  success: boolean
  /**
   * Replacement JWT. Changing the password bumps `tokenVersion`, which
   * invalidates the caller's current token; this keeps the active session
   * alive without forcing a re-login.
   */
  token: string
}

interface SetInactiveUntilRequest {
  inactiveUntil: string | null // ISO timestamp to set, null to clear
}

@Route('account')
@Tags('Account')
@Security('jwt')
export class AccountController extends Controller {
  @Get()
  public async getProfile(@Request() request: { user: JwtPayload }): Promise<UserProfile> {
    const userId = request.user.userId

    // Query user basic info
    const [user] = await db
      .select({
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        inactiveUntil: users.inactiveUntil,
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw new Error('User not found')
    }

    // Query user roles
    const userRolesData = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
        roleColor: roles.color,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    const roleIds = userRolesData.map(r => r.roleId)
    const rolesArray: Role[] = userRolesData.map(r => ({
      id: r.roleId,
      name: r.roleName,
      color: r.roleColor,
    }))

    // Get permissions for these roles
    const permissionsMap = await getPermissions(roleIds)
    const permissionIds = Array.from(permissionsMap.entries())
      .filter(([, allowed]) => allowed)
      .map(([id]) => id)

    return {
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      roles: rolesArray,
      permissions: permissionIds,
      inactiveUntil: user.inactiveUntil ? user.inactiveUntil.toISOString() : null,
    }
  }

  @Put()
  public async updateProfile(
    @Body() body: UpdateProfileRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<UserProfile> {
    const userId = request.user.userId

    // Build update object
    const updateData: { displayName?: string; email?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    }

    if (body.displayName !== undefined) {
      updateData.displayName = body.displayName
    }

    if (body.email !== undefined) {
      updateData.email = body.email
    }

    // Update user table if there's anything to update
    if (body.displayName !== undefined || body.email !== undefined) {
      await db.update(users).set(updateData).where(eq(users.id, userId))
    }

    // Note: FIO credentials are now updated via /user-settings endpoint

    // Return updated profile
    return this.getProfile(request)
  }

  @Put('password')
  public async changePassword(
    @Body() body: ChangePasswordRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ChangePasswordResponse> {
    const userId = request.user.userId

    // Get current password hash
    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Verify current password
    const isValid = await verifyPassword(body.currentPassword, user.passwordHash)
    if (!isValid) {
      this.setStatus(400)
      throw BadRequest('Current password is incorrect')
    }

    // Hash new password, update, and bump tokenVersion to invalidate existing sessions
    const newPasswordHash = await hashPassword(body.newPassword)
    const [updated] = await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        tokenVersion: sql<number>`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ tokenVersion: users.tokenVersion })

    // Bumping tokenVersion invalidates every existing JWT — including the one
    // this request was made with. Issue a replacement so the user is not
    // silently logged out. Delivered as a `Set-Cookie`, so every tab in this
    // browser adopts it; other devices still lose their session, as intended.
    const token = generateToken({
      userId,
      username: request.user.username,
      roles: request.user.roles,
      tokenVersion: updated.tokenVersion,
    })

    issueAuthCookie(token)

    return { success: true, token }
  }

  @Put('inactive-until')
  public async setInactiveUntil(
    @Body() body: SetInactiveUntilRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<{ inactiveUntil: string | null }> {
    const userId = request.user.userId

    // Parse and validate the datetime if provided
    let inactiveUntilDate: Date | null = null
    if (body.inactiveUntil !== null) {
      inactiveUntilDate = new Date(body.inactiveUntil)
      if (isNaN(inactiveUntilDate.getTime())) {
        this.setStatus(400)
        throw BadRequest('Invalid date format')
      }
    }

    await db
      .update(users)
      .set({ inactiveUntil: inactiveUntilDate, updatedAt: new Date() })
      .where(eq(users.id, userId))

    return { inactiveUntil: inactiveUntilDate ? inactiveUntilDate.toISOString() : null }
  }

  /**
   * Delete the current user's account and all associated data
   * This is a permanent action that cannot be undone
   */
  @Delete()
  public async deleteAccount(
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId

    // Verify user exists
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Delete the user - cascade will handle all related data:
    // - userSettings (key-value settings including FIO credentials)
    // - userRoles
    // - passwordResetTokens
    // - fioUserStorage (and fioInventory through it)
    // - sellOrders
    // - buyOrders
    // - userDiscordProfiles
    // - settings.changedByUserId will be set to null
    await db.delete(users).where(eq(users.id, userId))

    // Revoke the session cookies. The user row is gone so authentication would
    // fail regardless, but leaving the cookies in place means the browser keeps
    // presenting a credential for an account that no longer exists — and the
    // readable presence flag would keep the SPA's router guards passing.
    revokeAuthCookie()

    return { success: true }
  }
}
