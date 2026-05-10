/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Per-user-per-ticker row used for Top Producers/Consumers dashboards
 */
export type BurnRepairCorpPerUserRow = {
    userId: number;
    /**
     * FIO username (from fio.username setting), falling back to users.username
     */
    username: string;
    commodityTicker: string;
    burnDaily: number;
    inputsDaily: number;
    repairTotal: number;
    productionDaily: number;
    /**
     * Oldest FIO-reported upload timestamp across this user's storages (ISO string,
     * or null if FIO has never uploaded for them). This is the "last time the user
     * logged into PrUn with a FIO-enabled browser" signal — a user-level property,
     * so it's the same for every ticker belonging to a given user. Using the
     * oldest (MIN) across storages gives a worst-case staleness read.
     */
    fioDataAge: string | null;
};

