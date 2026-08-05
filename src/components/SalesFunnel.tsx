import type { Dataset } from '../types'
import type { DateBasis, Filters, Index } from '../lib/data'
import { lostTotal, stageFunnel } from '../lib/data'
import StageLadder from './StageLadder'
import { Card, SectionTitle, InfoDot, Segmented } from './ui'
import { int } from '../lib/format'
import { BASIS_HINT, BASIS_LABEL, STAGE_HINT, stageLabel } from '../config'

/**
 * The sales funnel below the qualified lead.
 *
 * There used to be a second view here — the current status of every deal from
 * `client_data`. It was dropped on request: 65% of the deals sit in «ЗАКРЫТО И НЕ
 * РЕАЛИЗОВАНО», so the chart was one long red bar answering a question nobody
 * asked, next to a funnel answering the one they did. The `status` block still
 * ships in the dataset; nothing renders it.
 */
export default function SalesFunnel({
  ds,
  idx,
  filters,
  basis,
  setBasis,
  spend,
}: {
  ds: Dataset
  idx: Index
  filters: Filters
  basis: DateBasis
  setBasis: (b: DateBasis) => void
  spend: number
}) {
  const funnel = stageFunnel(ds, idx, filters, basis, spend, stageLabel)
  const lost = lostTotal(ds, idx, filters, basis)
  const quals = funnel[0]?.n || 0

  return (
    <Card className="p-5">
      <SectionTitle
        title="Воронка продаж"
        subtitle={`${int(quals)} квал-лидов за период · ${BASIS_LABEL[basis]}`}
        right={<InfoDot text={STAGE_HINT} />}
      />

      {funnel.length > 0 && (
        <div className="mb-3 flex items-center justify-end gap-2">
          <InfoDot text={BASIS_HINT} />
          <Segmented<DateBasis>
            value={basis}
            options={[
              { value: 'lead', label: BASIS_LABEL.lead },
              { value: 'event', label: BASIS_LABEL.event },
            ]}
            onChange={setBasis}
          />
        </div>
      )}

      <StageLadder rows={funnel} lost={lost} />
    </Card>
  )
}
