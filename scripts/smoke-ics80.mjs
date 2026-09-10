// Smoke test de ICS-80 (followUps.complete por id + resolución, cierre implícito
// en interactions.add, huérfanos y eventos en changeStage, followUps.today).
// Sin navegador: mutations/queries end-to-end contra un deployment de Convex,
// autenticado como vendedor vía Convex Auth (Password).
//
// USO
//   NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
//   SMOKE_VENDOR_EMAIL=carlos@minegocio.com \
//   SMOKE_VENDOR_PASSWORD=... \
//   CONVEX_DEPLOY_KEY=<deploy key del mismo deployment> \
//   node scripts/smoke-ics80.mjs
//
//   # Opcional — habilita el caso "reasignación sincroniza ownerId":
//   SMOKE_OTHER_VENDOR_EMAIL=otra@...   (solo se usa su _id, vía users:currentUser)
//
// ASERCIONES (~18)
//   login · complete por id+resolución "hecho": followUp completado, interacción
//   automática source "follow-up" con nota por defecto, enlaces cruzados, evento
//   cierre-seguimiento · complete con nota real la respeta · reprogramado sin
//   fecha rechazado · reprogramado con fecha crea nuevo pendiente con ownerId y
//   nextFollowUpId · 2º complete sobre el mismo rechazado · cierre implícito en
//   interactions.add: pendiente queda resolution "hecho" + completedByInteractionId,
//   sin evento cierre-seguimiento extra · changeStage a ganado cancela el
//   pendiente (resolution "cancelado" + closureReason) y deja cambio-etapa +
//   venta en el timeline · salir de ganado borra la fila sales pero el evento
//   venta persiste · changeStage a perdido cancela el pendiente · today usa el
//   índice (devuelve el pendiente vencido) · [si hay 2º vendedor] reasignar
//   sincroniza followUp.ownerId.
//
// DATOS
//   Crea ~7 prospectos "[SMOKE ICS-80]" y los borra al final (incluso si falla).

import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = requireEnv("NEXT_PUBLIC_CONVEX_URL");
const vendorEmail = requireEnv("SMOKE_VENDOR_EMAIL");
const vendorPassword = requireEnv("SMOKE_VENDOR_PASSWORD");
const deployKey = requireEnv("CONVEX_DEPLOY_KEY");
const otherEmail = process.env.SMOKE_OTHER_VENDOR_EMAIL;
const otherPassword = process.env.SMOKE_OTHER_VENDOR_PASSWORD;

const PREFIX = "[SMOKE ICS-80]";
const DAY = 24 * 60 * 60 * 1000;
let passed = 0;
const createdProspectIds = [];
const admin = new ConvexHttpClient(url);
admin.setAdminAuth(deployKey);

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Falta la variable de entorno ${name} — ver el encabezado de este archivo.`);
    process.exit(2);
  }
  return val;
}
function assert(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  passed++;
  console.log("  ok ·", msg);
}
async function expectReject(fn, pattern, msg) {
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    rejected = pattern.test(err.message);
    if (!rejected) console.warn(`    (mensaje inesperado: ${err.message})`);
  }
  assert(rejected, msg);
}
async function signIn(client, email, password) {
  const res = await client.action(anyApi.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signIn" },
  });
  const token = res.tokens?.token;
  if (!token) throw new Error(`login falló para ${email}`);
  client.setAuth(token);
}
const dump = (prospectId) => admin.query(anyApi.testHelpers.dumpProspectForSmoke, { prospectId });

async function newProspectWithFollowUp(vendor, name, followUpAt = Date.now() + DAY) {
  const p = await vendor.mutation(anyApi.prospects.create, {
    name: `${PREFIX} ${name}`, phone: "5550000000", channel: "whatsapp", interest: "smoke", note: "",
  });
  createdProspectIds.push(p._id);
  // primera interacción → programa el seguimiento pendiente
  await vendor.mutation(anyApi.interactions.add, {
    prospectId: p._id, type: "llamada", note: "primer contacto",
    nextFollowUp: { at: followUpAt, type: "llamada" },
  });
  const ficha = await vendor.query(anyApi.prospects.get, { id: p._id });
  return { prospect: p, followUp: ficha.nextFollowUp };
}

async function run() {
  const vendor = new ConvexHttpClient(url);
  await signIn(vendor, vendorEmail, vendorPassword);
  assert(true, "login del vendedor");

  // --- complete por id + resolución "hecho" ---
  const a = await newProspectWithFollowUp(vendor, "hecho");
  await vendor.mutation(anyApi.followUps.complete, { id: a.followUp._id, resolution: "hecho" });
  const da = await dump(a.prospect._id);
  const fuA = da.followUps.find((f) => f._id === a.followUp._id);
  assert(fuA.status === "completado" && fuA.resolution === "hecho", "followUp queda completado con resolution 'hecho'");
  assert(!!fuA.completedAt && !!fuA.completedBy, "followUp queda con completedAt/completedBy");
  const autoIt = da.interactions.find((i) => i._id === fuA.completedByInteractionId);
  assert(!!autoIt && autoIt.source === "follow-up", "interacción automática con source 'follow-up', enlazada en completedByInteractionId");
  assert(autoIt.note === "Seguimiento realizado" && autoIt.followUpId === a.followUp._id, "nota por defecto + interaction.followUpId cruzado");
  assert(
    da.timelineEvents.some((e) => e.type === "cierre-seguimiento" && e.followUpId === a.followUp._id && e.interactionId === autoIt._id),
    "evento 'cierre-seguimiento' con followUpId + interactionId",
  );

  // --- complete con nota real ---
  const b = await newProspectWithFollowUp(vendor, "nota real");
  await vendor.mutation(anyApi.followUps.complete, { id: b.followUp._id, resolution: "no-contactado", note: "Buzón de voz, insisto el jueves" });
  const db = await dump(b.prospect._id);
  const fuB = db.followUps.find((f) => f._id === b.followUp._id);
  assert(db.interactions.find((i) => i._id === fuB.completedByInteractionId).note === "Buzón de voz, insisto el jueves", "la nota real del vendedor se respeta");

  // --- reprogramado ---
  const c = await newProspectWithFollowUp(vendor, "reprogramado");
  await expectReject(
    () => vendor.mutation(anyApi.followUps.complete, { id: c.followUp._id, resolution: "reprogramado" }),
    /nueva fecha/i,
    "reprogramar sin nextFollowUp se rechaza",
  );
  await vendor.mutation(anyApi.followUps.complete, {
    id: c.followUp._id, resolution: "reprogramado", nextFollowUp: { at: Date.now() + 3 * DAY, type: "whatsapp" },
  });
  const dc = await dump(c.prospect._id);
  const nuevo = dc.followUps.find((f) => f.status === "pendiente");
  assert(!!nuevo && !!nuevo.ownerId, "reprogramar crea un nuevo followUp pendiente con ownerId");
  const itC = dc.interactions.find((i) => i._id === dc.followUps.find((f) => f._id === c.followUp._id).completedByInteractionId);
  assert(itC.nextFollowUpId === nuevo._id, "la interacción de cierre apunta al nuevo followUp (nextFollowUpId)");

  // --- 2º complete sobre el mismo ---
  await expectReject(
    () => vendor.mutation(anyApi.followUps.complete, { id: c.followUp._id, resolution: "hecho" }),
    /ya fue cerrado/i,
    "un 2º complete sobre el mismo seguimiento se rechaza",
  );

  // --- cierre implícito en interactions.add ---
  const e = await newProspectWithFollowUp(vendor, "cierre implicito");
  const eventsBefore = (await dump(e.prospect._id)).timelineEvents.filter((x) => x.type === "cierre-seguimiento").length;
  await vendor.mutation(anyApi.interactions.add, {
    prospectId: e.prospect._id, type: "whatsapp", note: "hablamos hoy",
    nextFollowUp: { at: Date.now() + DAY, type: "whatsapp" },
  });
  const de = await dump(e.prospect._id);
  const fuE = de.followUps.find((f) => f._id === e.followUp._id);
  assert(fuE.resolution === "hecho" && !!fuE.completedByInteractionId, "el pendiente se cierra implícito con resolution 'hecho' + completedByInteractionId");
  const eventsAfter = de.timelineEvents.filter((x) => x.type === "cierre-seguimiento").length;
  assert(eventsAfter === eventsBefore, "el cierre implícito NO agrega un evento 'cierre-seguimiento' extra");

  // --- changeStage a ganado ---
  const g = await newProspectWithFollowUp(vendor, "ganado");
  await vendor.mutation(anyApi.prospects.changeStage, { id: g.prospect._id, stage: "ganado", amount: 5000, product: "Tinaco" });
  const dg = await dump(g.prospect._id);
  const fuG = dg.followUps.find((f) => f._id === g.followUp._id);
  assert(fuG.status === "completado" && fuG.resolution === "cancelado" && /cambio de etapa a ganado/.test(fuG.closureReason), "changeStage a ganado cancela el pendiente con closureReason");
  assert(dg.timelineEvents.some((x) => x.type === "cambio-etapa" && x.toStage === "ganado"), "evento 'cambio-etapa' a ganado");
  const ventaEvt = dg.timelineEvents.find((x) => x.type === "venta");
  assert(!!ventaEvt && !!ventaEvt.saleId, "evento 'venta' con saleId al entrar a ganado");

  // --- salir de ganado: la fila sales se borra pero el evento venta persiste ---
  await vendor.mutation(anyApi.prospects.changeStage, { id: g.prospect._id, stage: "negociacion" });
  const dg2 = await dump(g.prospect._id);
  assert(dg2.sales.length === 0, "salir de ganado borra la fila de sales");
  assert(dg2.timelineEvents.some((x) => x.type === "venta"), "el evento 'venta' histórico persiste tras salir de ganado");
  assert(dg2.timelineEvents.filter((x) => x.type === "cambio-etapa").length >= 2, "salir de ganado deja otro evento 'cambio-etapa'");

  // --- changeStage a perdido ---
  const p = await newProspectWithFollowUp(vendor, "perdido");
  await vendor.mutation(anyApi.prospects.changeStage, { id: p.prospect._id, stage: "perdido", lossReason: "precio" });
  const dp = await dump(p.prospect._id);
  assert(dp.followUps.find((f) => f._id === p.followUp._id).resolution === "cancelado", "changeStage a perdido también cancela el pendiente");

  // --- today usa el índice ---
  const overdue = await newProspectWithFollowUp(vendor, "vencido", Date.now() - 5 * DAY);
  const todos = await vendor.query(anyApi.followUps.today, {});
  assert(todos.some((t) => t.nextFollowUp._id === overdue.followUp._id), "followUps.today devuelve el seguimiento vencido");

  // --- reasignación sincroniza ownerId (opcional) ---
  if (otherEmail && otherPassword) {
    const other = new ConvexHttpClient(url);
    await signIn(other, otherEmail, otherPassword);
    const otherUser = await other.query(anyApi.users.currentUser, {});
    const r = await newProspectWithFollowUp(vendor, "reasignado");
    const res = await admin.mutation(anyApi.testHelpers.reassignProspectForSmoke, { prospectId: r.prospect._id, newOwnerId: otherUser._id });
    assert(res.pendingFollowUpOwnerId === otherUser._id, "reasignar el prospecto sincroniza el ownerId del seguimiento pendiente");
  } else {
    console.log("  -- caso 'reasignación' omitido (SMOKE_OTHER_VENDOR_* no seteadas)");
  }
}

async function cleanup() {
  for (const id of createdProspectIds) {
    try {
      await admin.mutation(anyApi.testHelpers.deleteProspectCascade, { id });
    } catch (err) {
      console.warn(`  no se pudo limpiar ${id}: ${err.message}`);
    }
  }
}

run()
  .then(async () => {
    await cleanup();
    console.log(`\n${passed} aserciones pasaron. Datos de prueba borrados.`);
  })
  .catch(async (err) => {
    console.error("\n" + err.message);
    await cleanup();
    console.error("Datos de prueba borrados. Smoke test FALLÓ.");
    process.exit(1);
  });
