/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as followUps from "../followUps.js";
import type * as http from "../http.js";
import type * as interactions from "../interactions.js";
import type * as lib from "../lib.js";
import type * as metrics from "../metrics.js";
import type * as migrations from "../migrations.js";
import type * as permissions from "../permissions.js";
import type * as prospects from "../prospects.js";
import type * as testHelpers from "../testHelpers.js";
import type * as timeline from "../timeline.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  followUps: typeof followUps;
  http: typeof http;
  interactions: typeof interactions;
  lib: typeof lib;
  metrics: typeof metrics;
  migrations: typeof migrations;
  permissions: typeof permissions;
  prospects: typeof prospects;
  testHelpers: typeof testHelpers;
  timeline: typeof timeline;
  users: typeof users;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
