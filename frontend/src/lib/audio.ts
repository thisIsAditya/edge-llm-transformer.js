export async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    await audioCtx.close();
    throw new Error(`Failed to decode audio: ${err instanceof Error ? err.message : String(err)}`);
  }

  await audioCtx.close();

  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i]!;
    }
  }

  if (numChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= numChannels;
    }
  }

  return mono;
}
