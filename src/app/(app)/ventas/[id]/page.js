"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Icon } from "@/design/components/core/Icon.jsx";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { Tag } from "@/design/components/core/Tag.jsx";
import { useSession } from "@/lib/session.js";
import "../ventas.css";

function money(n) {
  return `$${n.toLocaleString("es-MX")}`;
}

/** ICS-103 — detalle de una venta. "Anular" solo la ve un administrador (ICS-101 sales.void, B3: no reabre la oportunidad). */
export default function VentaDetalle() {
  const { id } = useParams();
  const router = useRouter();
  const session = useSession();
  const sale = useQuery(api.sales.getById, { id });
  const voidSale = useMutation(api.sales.void);

  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!session || sale === undefined) return null;
  const isAdmin = session.role === "administrador";

  async function handleVoid(e) {
    e.preventDefault();
    if (!reason.trim()) return setError("Indica el motivo de la anulación.");
    setSubmitting(true);
    setError("");
    try {
      await voidSale({ id, reason: reason.trim() });
      setConfirmingVoid(false);
    } catch (err) {
      setError(err.message ?? "No se pudo anular la venta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="arrow-left" outline label="Volver" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Detalle de venta</p>
        </div>
      </div>

      <div className="id-card">
        <div className="id-card__head">
          <div>
            <p className="id-card__name">{sale.prospect?.name ?? "Cliente"}</p>
            <p className="id-card__biz">{sale.product}</p>
          </div>
        </div>
        <div className="id-row">
          <Icon name="dollar-sign" size={16} />
          {money(sale.amount)}
        </div>
        <div className="id-row">
          <Icon name="calendar-clock" size={16} />
          {new Date(sale.closedAt).toLocaleDateString("es-MX")}
        </div>
        {sale.opportunity && (
          <div className="id-row">
            <Icon name="git-branch" size={16} />
            Originada por: {sale.opportunity.name}
          </div>
        )}
      </div>

      {sale.voidedAt && (
        <div className="next-follow" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Tag variant="risk">Venta anulada</Tag>
          </div>
          <span className="next-follow__txt">Motivo: {sale.voidReason}</span>
        </div>
      )}

      {isAdmin && !sale.voidedAt && (
        <div className="action-row">
          {confirmingVoid ? (
            <form onSubmit={handleVoid} style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              <div className="field-group">
                <label className="field-label" htmlFor="vd-motivo">Motivo de la anulación</label>
                <textarea
                  id="vd-motivo"
                  className="mn-field-text"
                  placeholder="Ej. Se registró el monto incorrecto, corregida en otra venta."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="button" variant="secondary" full disabled={submitting} onClick={() => setConfirmingVoid(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="danger" full disabled={submitting}>
                  {submitting ? "Anulando..." : "Confirmar anulación"}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="danger" full onClick={() => setConfirmingVoid(true)}>
              Anular venta
            </Button>
          )}
        </div>
      )}
    </>
  );
}
