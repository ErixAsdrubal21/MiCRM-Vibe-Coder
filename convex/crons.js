import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ICS-121 — la bitácora de seguridad se conserva 12 meses (el nombre del cron solo admite ASCII).
crons.daily("limpiar bitacora de seguridad", { hourUTC: 9, minuteUTC: 0 }, internal.securityEvents.cleanupOldSecurityEvents);

export default crons;
