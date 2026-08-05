import { useMemo, useState } from 'react'
import type { CreativeGroup, CrmDaily, DailyRow, Dataset, Metrics } from '../types'
import {
  aggregate,
  crmByAd,
  groupBy,
  stageRowsFor,
  stagesByAd,
  type DateBasis,
  type Filters,
  type Index,
  type StageRow,
} from '../lib/data'
import { stageLabel } from '../config'
import { SectionTitle, Segmented } from './ui'
import CreativeCard from './CreativeCard'
import CreativeModal from './CreativeModal'

type SortKey = 'qual' | 'cpql' | 'leads' | 'cpl' | 'spend' | 'ctr'

export interface Item {
  group: CreativeGroup
  m: Metrics
  /** The creative's own funnel — empty when the dataset has no stage layer. */
  stages: StageRow[]
}

export default function CreativeGallery({
  ds,
  idx,
  rows,
  crmRows,
  filters,
  basis,
}: {
  ds: Dataset
  idx: Index
  rows: DailyRow[]
  crmRows: CrmDaily[] | null
  filters: Filters
  basis: DateBasis
}) {
  const hasCrm = !!crmRows
  const [sort, setSort] = useState<SortKey>(hasCrm ? 'qual' : 'leads')
  const [open, setOpen] = useState<Item | null>(null)

  const items = useMemo<Item[]>(() => {
    const byKey = groupBy(rows, (r) => idx.adById.get(r.ad_id)?.name)
    const crmMap = crmByAd(crmRows)
    const stageMap = stagesByAd(ds, idx, filters, basis)
    const list: Item[] = []
    for (const [key, rs] of byKey) {
      const group = idx.creativeByKey.get(key)
      if (!group) continue
      // one synthetic CRM row so aggregate() fills qual_leads / cpql / qual_rate
      const bucket = crmMap.get(key)
      const crmSlice: CrmDaily[] | null = hasCrm
        ? [{ date: '', campaign_id: '', ad_key: key, leads: bucket?.leads || 0, qual: bucket?.qual || 0 }]
        : null
      const m = aggregate(rs, crmSlice)
      if (m.impressions <= 0) continue
      list.push({
        group,
        m,
        stages: stageRowsFor(stageMap.get(key), ds.crm?.stage_defs, m.spend, stageLabel),
      })
    }
    // creatives with no qual yet sort last rather than pretending to be cheap
    const worstIfNone = (v: number | null, has: number | null) => (has ? v! : Infinity)
    const sorters: Record<SortKey, (a: Item, b: Item) => number> = {
      qual: (a, b) =>
        (b.m.qual_leads || 0) - (a.m.qual_leads || 0) ||
        worstIfNone(a.m.cpql, a.m.qual_leads) - worstIfNone(b.m.cpql, b.m.qual_leads),
      cpql: (a, b) =>
        worstIfNone(a.m.cpql, a.m.qual_leads) - worstIfNone(b.m.cpql, b.m.qual_leads),
      leads: (a, b) => b.m.leads - a.m.leads || a.m.cpl - b.m.cpl,
      cpl: (a, b) => (a.m.leads ? a.m.cpl : Infinity) - (b.m.leads ? b.m.cpl : Infinity),
      spend: (a, b) => b.m.spend - a.m.spend,
      ctr: (a, b) => b.m.ctr - a.m.ctr,
    }
    return list.sort(sorters[sort])
  }, [ds, rows, idx, sort, crmRows, hasCrm, filters, basis])

  const topIsMeaningful =
    (sort === 'qual' && (items[0]?.m.qual_leads || 0) > 0) ||
    (sort === 'leads' && (items[0]?.m.leads || 0) > 0)

  return (
    <section>
      <SectionTitle
        title="🎬 Креативы"
        subtitle={
          `${items.length} работающих креативов за период · клик — живое превью и метрики` +
          (hasCrm ? ' · CPQL показывает, какой креатив приносит не просто лиды, а квалы' : '')
        }
        right={
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              ...(hasCrm
                ? ([
                    { value: 'qual', label: 'по квалам' },
                    { value: 'cpql', label: 'по CPQL' },
                  ] as const)
                : []),
              { value: 'leads', label: 'по лидам' },
              { value: 'cpl', label: 'по CPL' },
              { value: 'spend', label: 'по расходу' },
              { value: 'ctr', label: 'по CTR' },
            ]}
          />
        }
      />

      {items.length === 0 ? (
        <div className="bento p-8 text-center text-dim text-sm">Нет креативов с показами за период</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((it, i) => (
            <CreativeCard
              key={it.group.key}
              group={it.group}
              m={it.m}
              stages={it.stages}
              top={i === 0 && topIsMeaningful}
              onClick={() => setOpen(it)}
            />
          ))}
        </div>
      )}

      {open && (
        <CreativeModal
          group={open.group}
          m={open.m}
          stages={open.stages}
          idx={idx}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
