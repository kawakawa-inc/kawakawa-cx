/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * One owner of a view. A view's `owners` is the full set — there are no tiers,
 * any owner has full read/edit/delete/share rights and can add or remove other
 * owners. Last-owner removal is rejected; the only way to drop the last owner
 * is to delete the view itself.
 */
export type ViewOwner = {
  userId: number
  username: string
}
