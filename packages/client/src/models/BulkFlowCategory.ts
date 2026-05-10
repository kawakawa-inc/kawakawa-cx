/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Granular demand/supply categories surfaced in the Add Hub review step.
 * Each maps to a specific data source:
 * - burn: workforce consumables (fio_planet_workforce.needs)
 * - production_input: recurring production order inputs
 * - repair: building repair materials
 * - government: manual demand claims (category=government)
 * - contract: manual demand claims (category=contract)
 * - reserve: manual demand claims (category=reserve)
 * - production_output: recurring production order outputs (surplus)
 */
export enum BulkFlowCategory {
    BURN = 'burn',
    PRODUCTION_INPUT = 'production_input',
    REPAIR = 'repair',
    GOVERNMENT = 'government',
    CONTRACT = 'contract',
    RESERVE = 'reserve',
    PRODUCTION_OUTPUT = 'production_output',
}
