export interface FrameBuffer { visible: string | null; pending: string | null }
export function requestRevision(state: FrameBuffer, revision: string): FrameBuffer {
  if (state.visible === revision) return state.pending === null ? state : { ...state, pending: null };
  return state.pending === revision ? state : { ...state, pending: revision };
}
export function revealRevision(state: FrameBuffer, revision: string): FrameBuffer {
  return state.pending === revision ? { visible: revision, pending: null } : state;
}
