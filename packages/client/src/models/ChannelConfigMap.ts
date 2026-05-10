/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
import type { MessageVisibility } from './MessageVisibility';
export type ChannelConfigMap = {
    channelId: string;
    priceList?: string;
    visibility?: ChannelConfigMap.visibility;
    currency?: Currency;
    messageVisibility?: MessageVisibility;
    priceListEnforced?: boolean;
    visibilityEnforced?: boolean;
    currencyEnforced?: boolean;
    messageVisibilityEnforced?: boolean;
    announceInternal?: string;
    announcePartner?: string;
    commandPrefix?: string;
};
export namespace ChannelConfigMap {
    export enum visibility {
        INTERNAL = 'internal',
        PARTNER = 'partner',
    }
}

