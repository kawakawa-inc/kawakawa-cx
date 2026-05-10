/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotificationType } from './NotificationType';
import type { Record_string_unknown_ } from './Record_string_unknown_';
export type Notification = {
    id: number;
    type: NotificationType;
    title: string;
    message: string | null;
    data: Record_string_unknown_ | null;
    isRead: boolean;
    createdAt: string;
};

