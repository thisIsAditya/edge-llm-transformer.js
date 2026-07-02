import { useEffect, useRef, useState, useCallback } from "react";
import { blobToFloat32 } from "../lib/audio.js";
import { useModelsContext } from "../context/ModelsContext.js";

export type AsrStatus = "loading" | "ready" | "recording" | "transcribing" | "error";

type WorkerMessage =
  | { status: "loading"; file: string; progress: number }
  | { status: "info"; message: string }
  | { status: "ready"; device: string }
  | { status: "transcribing" }
  | { status: "complete"; text: string }
  | { status: "error"; error: string };

interface UseSpeechToTextOptions {
  onTranscript: (text: string) => void;
}

interface UseSpeechToTextReturn {
  status: AsrStatus;
  progress: number;
  device: string;
  error: string | null;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useSpeechToText({ onTranscript }: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const { workers, lastReadyMessage } = useModelsContext();
  const worker = workers.asr;
  const readyMsg = lastReadyMessage.asr as { device?: string } | null;

  const [status, setStatus] = useState<AsrStatus>(readyMsg ? "ready" : "loading");
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState(readyMsg?.device?.toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    const handler = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;

      if (msg.status === "loading") {
        setProgress(msg.progress ?? 0);
        setStatus("loading");
        return;
      }

      if (msg.status === "info") {
        console.info("[ASR]", msg.message);
        return;
      }

      if (msg.status === "ready") {
        setDevice(msg.device.toUpperCase());
        setStatus("ready");
        setProgress(0);
        return;
      }

      if (msg.status === "transcribing") {
        setStatus("transcribing");
        return;
      }

      if (msg.status === "complete") {
        setStatus("ready");
        if (msg.text) onTranscriptRef.current(msg.text);
        return;
      }

      if (msg.status === "error") {
        setStatus("error");
        setError(msg.error);
        console.error("[ASR worker error]", msg.error);
      }
    };

    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, [worker]);

  const startRecording = useCallback(async () => {
    if (status !== "ready") return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(`Microphone access denied: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("error");
      return;
    }

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);

      if (chunksRef.current.length === 0) {
        setStatus("ready");
        return;
      }

      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]!.type });
      try {
        const audio = await blobToFloat32(blob);
        worker.postMessage({ type: "transcribe", audio }, [audio.buffer]);
      } catch (err) {
        setError(`Audio decode failed: ${err instanceof Error ? err.message : String(err)}`);
        setStatus("error");
      }
    });

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setStatus("recording");
  }, [status, worker]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { status, progress, device, error, isRecording, startRecording, stopRecording };
}
