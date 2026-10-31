import React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { EventState } from '../../../../../shared/engine/types'
import { stateLabel, type Problem } from './eventModel'

export function ProblemsList({ problems, states, onJump }: { problems: Problem[]; states: EventState[]; onJump: (problem: Problem) => void }) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-emerald-400" data-testid="no-problems">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        No problems found.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border/50" data-testid="problems-list">
      {problems.map((p, i) => {
        const Icon = p.severity === 'error' ? AlertCircle : AlertTriangle
        const state = states[p.stateIndex]
        return (
          <li key={`${p.stateId}-${p.code}-${p.nodeId ?? 'state'}-${i}`}>
            <button
              type="button"
              onClick={() => onJump(p)}
              data-severity={p.severity}
              className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent/60"
            >
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${p.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs">{p.message}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {state ? stateLabel(state, p.stateIndex) : `State ${p.stateIndex + 1}`} · {p.scope === 'node' ? 'node' : p.scope}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
