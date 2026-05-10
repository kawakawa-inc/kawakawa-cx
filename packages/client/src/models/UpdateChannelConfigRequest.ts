/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { MessageVisibility } from './MessageVisibility'
export type UpdateChannelConfigRequest = {
  priceList?: string | null
  visibility?: UpdateChannelConfigRequest.visibility | null
  currency?: Currency | null
  messageVisibility?: MessageVisibility | null
  priceListEnforced?: boolean | null
  visibilityEnforced?: boolean | null
  currencyEnforced?: boolean | null
  messageVisibilityEnforced?: boolean | null
  announceInternal?: string | null
  announcePartner?: string | null
  commandPrefix?: string | null
}
export namespace UpdateChannelConfigRequest {
  export enum visibility {
    INTERNAL = 'internal',
    PARTNER = 'partner',
  }
}
