import { countNoteText } from "./noteCounts";
self.onmessage = (event: MessageEvent<{ revision: number; html: string }>) => {
  self.postMessage({ revision: event.data.revision, counts: countNoteText(event.data.html) });
};
