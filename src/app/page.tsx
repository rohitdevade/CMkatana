"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Job } from "@/jobs/store";

export default function Home() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [refine, setRefine] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Omit<Job, "log">[]>([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => undefined);
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("refine", String(refine));
    try {
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "upload failed");
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="panel stack">
        <h2>1. Upload a reference motion graphic</h2>
        <p className="muted" style={{ margin: 0 }}>
          The video gets split at its cuts. Claude rebuilds every shot as a frame-accurate motion spec and writes the motion prompt. Then you swap in your own
          logos, images, clips, text and colors, and the video re-renders with the same motion, timing and cuts.
        </p>
        <div
          className={`dropzone ${drag ? "active" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{uploading ? "Uploading…" : "Drop a video here or click to choose"}</div>
          <div className="muted small">MP4, MOV or WebM · short motion graphics (5–60 s) work best</div>
          <input
            ref={input}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </div>
        <label className="row small muted">
          Accuracy passes (render → compare → correct):
          <select className="input" style={{ width: 90 }} value={refine} onChange={(e) => setRefine(Number(e.target.value))}>
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
          <span>Each pass costs another round of Claude calls.</span>
        </label>
        {error ? <div className="error-box">{error}</div> : null}
      </section>

      {jobs.length > 0 ? (
        <section className="stack">
          <h3 style={{ margin: 0 }}>Recent projects</h3>
          <div className="jobs">
            {jobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="panel job-card stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.originalName}</strong>
                  <span className={`badge ${j.status}`}>{j.status}</span>
                </div>
                <span className="muted small">{new Date(j.createdAt).toLocaleString()}</span>
                {j.ssim ? <span className="muted small">match score {(j.ssim.mean * 100).toFixed(1)}%</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
