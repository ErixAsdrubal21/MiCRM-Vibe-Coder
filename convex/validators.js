/**
 * Validadores de Convex (`v.union(...)`) armados desde los enums de dominio
 * compartidos (`shared/crmEnums.js`) — ICS-78. Los importan el esquema y las
 * mutations en vez de redeclarar los literales a mano en cada archivo.
 */
import { v } from "convex/values";
import {
  STAGE_VALUES,
  CONTACT_TYPE_VALUES,
  FOLLOW_UP_TYPE_VALUES,
  CHANNEL_VALUES,
  LOSS_REASON_VALUES,
  ROLE_VALUES,
  OUTCOME_VALUES,
  RESOLUTION_VALUES,
  INTERACTION_SOURCE_VALUES,
  TIMELINE_EVENT_TYPE_VALUES,
} from "../shared/crmEnums.js";

const literals = (values) => v.union(...values.map((value) => v.literal(value)));

export const stage = literals(STAGE_VALUES);
export const contactType = literals(CONTACT_TYPE_VALUES);
export const followUpType = literals(FOLLOW_UP_TYPE_VALUES);
export const channel = literals(CHANNEL_VALUES);
export const lossReason = literals(LOSS_REASON_VALUES);
export const role = literals(ROLE_VALUES);
export const outcome = literals(OUTCOME_VALUES);
export const resolution = literals(RESOLUTION_VALUES);
export const interactionSource = literals(INTERACTION_SOURCE_VALUES);
export const timelineEventType = literals(TIMELINE_EVENT_TYPE_VALUES);
