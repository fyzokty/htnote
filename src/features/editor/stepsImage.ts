import { ipc } from "@/lib/ipc";
import { decodeDataUrl, pasteFileName } from "./clipboardPaste";
import { fileName, kindFromPath } from "./fileDrop";
import { isStepImageSrc, type StepImage } from "./steps";
import type { AssetInfo } from "@/lib/types";

function imageAsset(asset: AssetInfo, alt: string): StepImage {
  if (asset.kind !== "image" || !isStepImageSrc(asset.relPath)) throw new Error("Invalid image asset");
  return { src: asset.relPath, alt };
}

export async function copyStepImage(noteId: string, path: string): Promise<StepImage> {
  if (kindFromPath(path) !== "image") throw new Error("Unsupported image");
  return imageAsset(await ipc.copyAsset(noteId, path), fileName(path));
}

export async function saveStepImage(noteId: string, file: File): Promise<StepImage> {
  if (!file.type.startsWith("image/") || kindFromPath(`image.${file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1]}`) !== "image") throw new Error("Unsupported image");
  return imageAsset(await ipc.saveAssetBytes(noteId, pasteFileName(new Date(), file.type), new Uint8Array(await file.arrayBuffer())), file.name);
}

export async function saveStepDataImage(noteId: string, url: string): Promise<StepImage> {
  const { bytes, mime } = decodeDataUrl(url);
  if (!["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif"].includes(mime.toLowerCase())) throw new Error("Unsupported image");
  return imageAsset(await ipc.saveAssetBytes(noteId, pasteFileName(new Date(), mime), bytes), "");
}
