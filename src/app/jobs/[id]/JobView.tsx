"use client";

import { Player } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Job } from "@/jobs/store";
import { SpecVideo } from "@/remotion/SpecVideo";
import type { MotionSpec, SlotValues, SpecVideoProps } from "@/spec/schema";
import { SlotEditor } from "./SlotEditor";

type JobResponse = { job: Job; spec: MotionSpec | null; motionPrompt: string | null };
type Tab = "assets" | "prompt" | "spec" | "log";

export function JobView({ id }: { id: string }) {
  const [data, setData] = useState<JobResponse | null>(null);
  const [values, setValues] = useState<SlotValues>({});
  const [tab, setTab] = useState<Tab>("assets");
  const [debug, setDebug] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [specText, setSpecText] = useState("");
  const [specError, setSpecError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedValues = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    if (res.status === 404) return setNotFound(true);
    const next = (await res.json()) as JobResponse;
    setData(next);
    if (!loadedValues.current && next.spec) {
      setValues(next.job.values ?? {});
      setSpecText(JSON.stringify(next.spec, null, 2));
      loadedValues.current = true;
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = data?.job.status === "analyzing" || data?.job.status === "rendering" || data?.job.status === "queued";
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 1500);
    return () => clearInterval(t);
  }, [busy, load]);

  // Debounced save of slot values.
  const updateValues = (next: SlotValues) => {
    setValues(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: next }) });
    }, 400);
  };

  async function saveSpec() {
    setSpecError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(specText);
    } catch (err) {
      return setSpecError(`Invalid JSON: ${(err as Error).message}`);
    }
    const res = await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: parsed }) });
    const body = await res.json();
    if (!res.ok) return setSpecError(body.error);
    setData((d) => (d ? { ...d, spec: body.spec } : d));
    setSpecText(JSON.stringify(body.spec, null, 2));
  }

  async function render() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
    }
    await fetch(`/api/jobs/${id}/render`, { method: "POST" });
    void load();
  }

  async function reanalyze() {
    await fetch(`/api/jobs/${id}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refine: 1 }) });
    loadedValues.current = false;
    void load();
  }

  const spec = data?.spec ?? null;
  const inputProps = useMemo<SpecVideoProps | null>(
    () => (spec ? { spec, values, assetBase: `/api/files/${id}/`, debug } : null),
    [spec, values, id, debug],
  );

  if (notFound) return <div className="panel">Project not found.</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const { job } = data;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="panel stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <strong>{spec?.title ?? job.originalName}</strong>
            <span className={`badge ${job.status}`}>{job.status}</span>
            {spec ? (
              <span className="muted small">
                {spec.width}×{spec.height} · {spec.fps} fps · {(spec.durationInFrames / spec.fps).toFixed(1)} s · {spec.shots.length} shots · {spec.slots.length} slots
              </span>
            ) : null}
            {job.ssim ? <span className="muted small">match {(job.ssim.mean * 100).toFixed(1)}%</span> : null}
          </div>
          <div className="row">
            {job.status === "error" ? (
              <button className="btn" onClick={reanalyze}>
                Retry analysis
              </button>
            ) : null}
            <button className="btn primary" disabled={!spec || busy} onClick={render}>
              {job.status === "rendering" ? "Rendering…" : "Render video"}
            </button>
          </div>
        </div>
        {busy ? (
          <>
            <div className="muted small">{job.phase}…</div>
            <div className="progress">
              <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </div>
          </>
        ) : null}
        {job.error ? <div className="error-box small">{job.error}</div> : null}
        {job.output && job.status === "done" ? (
          <div className="stack" style={{ gap: 8 }}>
            <video src={`/api/files/${id}/${job.output}?v=${encodeURIComponent(job.updatedAt)}`} controls style={{ width: "100%", maxHeight: 360, background: "#000", borderRadius: 8 }} />
            <a className="btn" style={{ alignSelf: "flex-start", textDecoration: "none" }} href={`/api/files/${id}/${job.output}?download`}>
              Download MP4
            </a>
          </div>
        ) : null}
      </section>

      {!spec ? (
        <section className="panel stack">
          <h3>Analysis log</h3>
          <div className="log code small">
            {job.log.length === 0 ? <div className="muted">Waiting to start…</div> : job.log.map((l, i) => <div key={i}>{l.msg}</div>)}
          </div>
        </section>
      ) : (
        <div className="grid-editor">
          <section className="stack">
            <div className="panel stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>Preview</h3>
                <div className="row small">
                  <label className="row" style={{ gap: 4 }}>
                    <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> show slots
                  </label>
                  <label className="row" style={{ gap: 4 }}>
                    <input type="checkbox" checked={showRef} onChange={(e) => setShowRef(e.target.checked)} /> compare with original
                  </label>
                </div>
              </div>
              <div className="player-wrap">
                {inputProps ? (
                  <Player
                    component={SpecVideo as React.FC<Record<string, unknown>>}
                    inputProps={inputProps as unknown as Record<string, unknown>}
                    durationInFrames={Math.max(1, Math.round(spec.durationInFrames))}
                    fps={spec.fps}
                    compositionWidth={spec.width}
                    compositionHeight={spec.height}
                    style={{ width: "100%", aspectRatio: `${spec.width} / ${spec.height}` }}
                    controls
                    loop
                    acknowledgeRemotionLicense
                  />
                ) : null}
              </div>
              {showRef ? (
                <div className="stack" style={{ gap: 4 }}>
                  <span className="muted small">Original reference</span>
                  <video src={`/api/files/${id}/ref.mp4`} controls loop muted style={{ width: "100%", borderRadius: 8, background: "#000" }} />
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="tabs">
              {(["assets", "prompt", "spec", "log"] as Tab[]).map((t) => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t === "assets" ? "Assets" : t === "prompt" ? "Motion prompt" : t === "spec" ? "JSON" : "Log"}
                </button>
              ))}
            </div>

            {tab === "assets" ? <SlotEditor jobId={id} spec={spec} values={values} onChange={updateValues} onUploaded={setValues} /> : null}

            {tab === "prompt" ? (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row">
                  <button className="btn" onClick={() => void navigator.clipboard.writeText(data.motionPrompt ?? "")}>
                    Copy
                  </button>
                  <a className="btn" style={{ textDecoration: "none" }} href={`/api/files/${id}/motion-prompt.md?download`}>
                    Download .md
                  </a>
                </div>
                <div className="prompt code small">{data.motionPrompt ?? "No motion prompt yet."}</div>
              </div>
            ) : null}

            {tab === "spec" ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="muted small">Edit timings, positions or easing directly. Saving validates the JSON and updates the preview.</span>
                <textarea className="textarea code small" style={{ minHeight: 420 }} value={specText} onChange={(e) => setSpecText(e.target.value)} spellCheck={false} />
                <div className="row">
                  <button className="btn primary" onClick={saveSpec}>
                    Save spec
                  </button>
                  <a className="btn" style={{ textDecoration: "none" }} href={`/api/files/${id}/spec.json?download`}>
                    Download
                  </a>
                </div>
                {specError ? <div className="error-box small code">{specError.slice(0, 1500)}</div> : null}
              </div>
            ) : null}

            {tab === "log" ? (
              <div className="log code small" style={{ maxHeight: 520 }}>
                {job.log.map((l, i) => (
                  <div key={i}>
                    <span className="muted">{new Date(l.t).toLocaleTimeString()} </span>
                    {l.msg}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
