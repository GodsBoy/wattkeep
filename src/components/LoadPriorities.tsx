import { Check, Minus, SlidersHorizontal } from 'lucide-react'

import { formatPower } from '../domain/scenario'
import type { ReadonlyScenario } from '../domain/types'
import type { LoadPolicy } from '../state/store'

export interface LoadPrioritiesProps {
  readonly scenario: ReadonlyScenario
  readonly committedPolicy: LoadPolicy
  readonly candidatePlanId: ReadonlyScenario['plans'][number]['id']
}

export default function LoadPriorities({
  scenario,
  committedPolicy,
  candidatePlanId,
}: LoadPrioritiesProps) {
  const candidate = scenario.plans.find((plan) => plan.id === candidatePlanId)
  const candidateLoadIds = new Set(candidate?.loadIds ?? [])
  const committedLoadIds = new Set(committedPolicy.loadIds)

  return (
    <section className="loads-section" aria-labelledby="loads-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Named presets only</p>
          <h2 id="loads-heading">Load priorities</h2>
        </div>
        <p className="section-note">Choose a plan preset to change this read-only matrix.</p>
      </div>

      <div className="table-scroll" role="region" aria-label="Load priority matrix" tabIndex={0}>
        <table className="load-matrix">
          <caption className="sr-only">Current policy and selected candidate load priorities</caption>
          <thead>
            <tr>
              <th scope="col">Load</th>
              <th scope="col">Draw</th>
              <th scope="col">Current policy<span>{committedPolicy.planName}</span></th>
              <th scope="col">Selected candidate<span>{candidate?.name ?? 'Unavailable'}</span></th>
            </tr>
          </thead>
          <tbody>
            {scenario.loads.map((load) => {
              const committed = committedLoadIds.has(load.id)
              const selected = candidateLoadIds.has(load.id)
              return (
                <tr key={load.id}>
                  <th scope="row">
                    <span className="load-name">{load.name}</span>
                    <span className="load-id">{load.id}</span>
                  </th>
                  <td className="tabular">{formatPower(load.drawKW)}</td>
                  <td>
                    <span className={`matrix-state${committed ? ' matrix-state--on' : ''}`}>
                      {committed ? <Check size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                      {committed ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td>
                    <span className={`matrix-state${selected ? ' matrix-state--candidate' : ''}`}>
                      {selected ? <Check size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                      {selected ? 'On' : 'Off'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="section-footnote">
        <SlidersHorizontal size={14} aria-hidden="true" />
        Load priorities are defined by the named plan presets. Individual loads cannot be changed here.
      </p>
    </section>
  )
}
