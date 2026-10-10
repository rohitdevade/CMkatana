"use client";

import { useState } from "react";
import type { MotionSpec, Slot, SlotValues } from "@/spec/schema";

type Props = {
  jobId: string;
  spec: MotionSpec;
  values: SlotValues;
  onChange: (values: SlotValues) => void;
  onUploaded: (values: SlotValues) => void;
};

const fileUrl = (jobId: string, rel: string) => `/api/files/${jobId}/${rel}`;

function SlotCard({ jobId, slot, values, onChange, onUploaded, usage }: Omit<Props, "spec"> & { slot: Slot; usage: number }) {
  const v = values[slot.id] ?? {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: SlotValues[string]) => onChange({ ...values, [slot.id]: { ...v, ...patch } });
  const reset = () => {
    const next = { ...values };
    delete next[slot.id];
    onChange(next);
  };

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("slotId", slot.id);
    form.append("file", file);
    try {
      const res = await fetch(`/api/jobs/${jobId}/assets`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "upload failed");
      onUploaded(data.values);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const src = v.src ?? slot.defaultSrc;
  const isVideoSrc = src ? /\.(mp4|mov|webm)$/i.test(src) : false;

  return (
    <div className="slot">
      <div className="slot-head">
        <strong>{slot.label}</strong>
        <span className="slot-kind">
          {slot.kind} · {usage} layer{usage === 1 ? "" : "s"}
        </span>
      </div>
      {slot.description ? <div className="muted small" style={{ marginBottom: 8 }}>{slot.description}</div> : null}

      {slot.kind === "text" ? (
        <textarea
          className="textarea"
          value={v.text ?? slot.defaultText ?? ""}
          onChange={(e) => set({ text: e.target.value })}
          rows={Math.min(4, (v.text ?? slot.defaultText ?? "").split("\n").length + 1)}
        />
      ) : null}

      {slot.kind === "color" ? (
        <div className="row">
          <input type="color" value={v.color ?? slot.defaultColor ?? "#ffffff"} onChange={(e) => set({ color: e.target.value })} />
          <input className="input code" style={{ flex: 1 }} value={v.color ?? slot.defaultColor ?? ""} onChange={(e) => set({ color: e.target.value })} />
        </div>
      ) : null}

      {slot.kind === "image" || slot.kind === "video" ? (
        <div className="stack" style={{ gap: 8 }}>
          {src ? (
            isVideoSrc ? (
              <video className="thumb" src={fileUrl(jobId, src)} muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={/^https?:/.test(src) ? src : fileUrl(jobId, src)} alt={slot.label} />
            )
          ) : null}
          <label className="btn" style={{ textAlign: "center" }}>
            {busy ? "Uploading…" : v.src ? "Replace upload" : `Upload ${slot.kind === "video" ? "image or clip" : "image"}`}
            <input
              type="file"
              hidden
              accept={slot.kind === "video" ? "video/*,image/*" : "image/*"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
          {slot.aspect ? <span className="muted small">Original region aspect {slot.aspect.toFixed(2)}:1. Matching assets fit best.</span> : null}
        </div>
      ) : null}

      {values[slot.id] ? (
        <button className="btn ghost small" style={{ marginTop: 8 }} onClick={reset}>
          Reset to original
        </button>
      ) : null}
      {error ? <div className="error-box small" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}

export function SlotEditor(props: Props) {
  const usage = new Map<string, number>();
  for (const s of props.spec.shots) for (const l of s.layers) if (l.slotId) usage.set(l.slotId, (usage.get(l.slotId) ?? 0) + 1);
  const order = { image: 0, video: 1, text: 2, color: 3 } as const;
  const slots = [...props.spec.slots].filter((s) => usage.has(s.id)).sort((a, b) => order[a.kind] - order[b.kind]);
  if (slots.length === 0) return <div className="muted">No replaceable assets were detected.</div>;
  return (
    <div className="stack">
      {slots.map((slot) => (
        <SlotCard key={slot.id} slot={slot} usage={usage.get(slot.id) ?? 0} jobId={props.jobId} values={props.values} onChange={props.onChange} onUploaded={props.onUploaded} />
      ))}
    </div>
  );
}
