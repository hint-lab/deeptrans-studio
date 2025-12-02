import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type InitStep = 'parse'|'segment'|'terms'|'done'

export interface ProjectInitEntry {
  projectId: string
  batchId: string
  currentStep: InitStep
  segPct: number
  termPct: number
  updatedAt: number
}

interface ProjectInitState {
  byProjectId: Record<string, ProjectInitEntry>
}

const initialState: ProjectInitState = {
  byProjectId: {},
}

const projectInitSlice = createSlice({
  name: 'projectInit',
  initialState,
  reducers: {
    ensure(state, action: PayloadAction<{ projectId: string; seedBatchId?: string }>) {
      const { projectId, seedBatchId } = action.payload
      if (!state.byProjectId[projectId]) {
        state.byProjectId[projectId] = {
          projectId,
          batchId: seedBatchId || `${projectId}.${Date.now()}`,
          currentStep: 'parse',
          segPct: 0,
          termPct: 0,
          updatedAt: Date.now(),
        }
      }
    },
    reset(state, action: PayloadAction<{ projectId: string; batchId?: string }>) {
      const { projectId, batchId } = action.payload
      state.byProjectId[projectId] = {
        projectId,
        batchId: batchId || `${projectId}.${Date.now()}`,
        currentStep: 'parse',
        segPct: 0,
        termPct: 0,
        updatedAt: Date.now(),
      }
    },
    setBatchId(state, action: PayloadAction<{ projectId: string; batchId: string }>) {
      const { projectId, batchId } = action.payload
      const cur = state.byProjectId[projectId] || {
        projectId,
        batchId,
        currentStep: 'parse' as InitStep,
        segPct: 0,
        termPct: 0,
        updatedAt: Date.now(),
      }
      cur.batchId = batchId
      cur.updatedAt = Date.now()
      state.byProjectId[projectId] = cur
    },
    setStep(state, action: PayloadAction<{ projectId: string; step: InitStep }>) {
      const { projectId, step } = action.payload
      const cur = state.byProjectId[projectId]
      if (cur) {
        cur.currentStep = step
        cur.updatedAt = Date.now()
      }
    },
    setProgress(state, action: PayloadAction<{ projectId: string; segPct?: number; termPct?: number }>) {
      const { projectId, segPct, termPct } = action.payload
      const cur = state.byProjectId[projectId]
      if (cur) {
        if (typeof segPct === 'number') cur.segPct = Math.max(0, Math.min(100, Math.round(segPct)))
        if (typeof termPct === 'number') cur.termPct = Math.max(0, Math.min(100, Math.round(termPct)))
        cur.updatedAt = Date.now()
      }
    },
  },
})

export const { ensure, reset, setBatchId, setStep, setProgress } = projectInitSlice.actions
export default projectInitSlice.reducer


