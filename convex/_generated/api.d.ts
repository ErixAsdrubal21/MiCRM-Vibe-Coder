/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as followUps from "../followUps.js";
import type * as http from "../http.js";
import type * as interactions from "../interactions.js";
import type * as lib from "../lib.js";
import type * as metrics from "../metrics.js";
import type * as migrations from "../migrations.js";
import type * as opportunities from "../opportunities.js";
import type * as pagination from "../pagination.js";
import type * as passwordReset from "../passwordReset.js";
import type * as permissions from "../permissions.js";
import type * as prospects from "../prospects.js";
import type * as sales from "../sales.js";
import type * as securityEvents from "../securityEvents.js";
import type * as seedDemo from "../seedDemo.js";
import type * as testHelpers from "../testHelpers.js";
import type * as timeline from "../timeline.js";
import type * as turnstile from "../turnstile.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  auth: typeof auth;
  crons: typeof crons;
  email: typeof email;
  followUps: typeof followUps;
  http: typeof http;
  interactions: typeof interactions;
  lib: typeof lib;
  metrics: typeof metrics;
  migrations: typeof migrations;
  opportunities: typeof opportunities;
  pagination: typeof pagination;
  passwordReset: typeof passwordReset;
  permissions: typeof permissions;
  prospects: typeof prospects;
  sales: typeof sales;
  securityEvents: typeof securityEvents;
  seedDemo: typeof seedDemo;
  testHelpers: typeof testHelpers;
  timeline: typeof timeline;
  turnstile: typeof turnstile;
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
