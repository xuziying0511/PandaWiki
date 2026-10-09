/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

import httpRequest, { ContentType, RequestParams } from "./httpClient";
import {
  DomainConversationDetailResp,
  DomainPWResponse,
  GetApiV1ConversationDetailParams,
  GetApiV1ConversationParams,
  DomainConversationListResp,
} from "./types";

/**
 * @description get conversation list
 *
 * @tags conversation
 * @name GetApiV1Conversation
 * @summary get conversation list
 * @request GET:/api/v1/conversation
 * @response `200` `(DomainPWResponse & {
    data?: DomainConversationListResp,

})` OK
 */

export const getApiV1Conversation = (
  query: GetApiV1ConversationParams,
  params: RequestParams = {},
) =>
  httpRequest<
    DomainPWResponse & {
      data?: DomainConversationListResp;
    }
  >({
    path: `/api/v1/conversation`,
    method: "GET",
    query: query,
    type: ContentType.Json,
    format: "json",
    ...params,
  });

/**
 * @description get conversation detail
 *
 * @tags conversation
 * @name GetApiV1ConversationDetail
 * @summary get conversation detail
 * @request GET:/api/v1/conversation/detail
 * @response `200` `(DomainPWResponse & {
    data?: DomainConversationDetailResp,

})` OK
 */

export const getApiV1ConversationDetail = (
  query: GetApiV1ConversationDetailParams,
  params: RequestParams = {},
) =>
  httpRequest<
    DomainPWResponse & {
      data?: DomainConversationDetailResp;
    }
  >({
    path: `/api/v1/conversation/detail`,
    method: "GET",
    query: query,
    type: ContentType.Json,
    format: "json",
    ...params,
  });
