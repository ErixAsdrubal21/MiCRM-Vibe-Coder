"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { IconButton } from "@/design/components/core/IconButton.jsx";
import { Button } from "@/design/components/core/Button.jsx";
import { CHANNELS } from "@/lib/prospects.js";

export default function NuevoProspecto() {
  const router = useRouter();
  const createProspect = useMutation(api.prospects.create);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0].value);
  const [interest, setInterest] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const prospect = await createProspect({ name, phone, channel, interest, note });
      router.replace(`/prospectos/${prospect._id}`);
    } catch (err) {
      setError(err.message ?? "No se pudo guardar el prospecto.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar__back">
          <IconButton icon="x" outline label="Cerrar" onClick={() => router.back()} />
          <p className="top-bar__title" style={{ fontSize: 18 }}>Nuevo prospecto</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="field-group">
          <label className="field-label" htmlFor="np-nombre">Nombre</label>
          <label className="mn-input mn-input--field">
            <input
              id="np-nombre"
              type="text"
              placeholder="Nombre del prospecto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="np-tel">Teléfono</label>
          <label className="mn-input mn-input--field">
            <input
              id="np-tel"
              type="tel"
              placeholder="55 0000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>

        <div className="field-group">
          <span className="field-label">Canal de entrada</span>
          <div className="chip-row">
            {CHANNELS.map((c) => (
              <button
                type="button"
                key={c.value}
                className={`chip${channel === c.value ? " selected" : ""}`}
                onClick={() => setChannel(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="np-interes">¿Qué le interesa?</label>
          <label className="mn-input mn-input--field">
            <input
              id="np-interes"
              type="text"
              placeholder="Producto o servicio"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              style={{ border: "none", background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </label>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="np-nota">Nota inicial</label>
          <textarea
            id="np-nota"
            className="mn-field-text"
            placeholder="Contexto breve de la conversación..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--color-critical)", margin: 0 }}>{error}</p>}

        <Button type="submit" variant="primary" full disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar prospecto"}
        </Button>
      </form>
    </>
  );
}
