/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A corp member who has been excluded from the current view, either because
 * their FIO data is past the staleness cutoff or because the requesting user
 * manually unchecked them in the planning dropdown.
 */
export type ExcludedMember = {
    userId: number;
    username: string;
    /**
     * ISO timestamp of the user's oldest FIO upload; null if they've never uploaded.
     */
    fioDataAge: string | null;
    reason: ExcludedMember.reason;
};
export namespace ExcludedMember {
    export enum reason {
        FIO_STALE = 'fio-stale',
        MANUAL = 'manual',
    }
}

