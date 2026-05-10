/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Record_string_SettingDefinitionDto_ } from './Record_string_SettingDefinitionDto_';
import type { Record_string_unknown_ } from './Record_string_unknown_';
export type UserSettingsResponse = {
    /**
     * Current values for all settings (user overrides + defaults)
     */
    values: Record_string_unknown_;
    /**
     * Setting definitions with metadata for building settings UI
     */
    definitions: Record_string_SettingDefinitionDto_;
};

