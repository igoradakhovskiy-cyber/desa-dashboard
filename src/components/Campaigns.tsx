import { useState } from 'react'
import type { CrmDaily, CrmStageDef, DailyRow, Dataset, Metrics } from '../types'
import {
  aggregate,
  deepStages,
  groupBy,
  stagesByCampaign,
  stagesByCampaignAd,
  type CrmBucket,
  type DateBasis,
  type Filters,
  type Index,
} from '../lib/data'
import { Card, SectionTitle, LangBadge } from './ui'
import { int, money, moneySmart, pct } from '../lib/format'
import { assetUrl, COLORS, langColor, stageColor, stageShort } from '../config'

interface Group {
  id: string
  rows: DailyRow[]
  m: Metrics
}

/** stage -> n for one row of the table; absent means "this level cannot resolve it". */
type StageBucket = Map<string, number> | undefined

function rankGroups(rows: DailyRow[], keyFn: (r: DailyRow) => string | undefined): Group[] {
  const g = groupBy(rows, keyFn)
  return [...g.entries()]
    .map(([id, rs]) => ({ id, rows: rs, m: aggregate(rs) }))
    .sort((a, b) => b.m.spend - a.m.spend)
}

/**
 * The CRM export carries campaign and ad, but no ad set — so quals and funnel
 * stages resolve at the campaign and ad levels and the ad-set row honestly shows "—".
 *
 * Only stages with data in the current period get a column: showing 08…13 as
 * permanent zeroes would fill half the table with a funnel nobody has reached yet.
 */
function Cells({
  m,
  crm,
  hasCrm,
  stages,
  stageBucket,
  stageCount,
}: {
  m: Metrics
  crm?: CrmBucket
  hasCrm: boolean
  stages: CrmStageDef[]
  stageBucket: StageBucket
  stageCount: number
}) {
  return (
    <div className="flex items-center gap-2 tabular text-sm shrink-0">
      <span className="w-20 sm:w-24 text-right text-ink font-medium">{money(m.spend)}</span>
      <span className="w-12 text-right text-ink">{int(m.leads)}</span>
      <span className="w-16 text-right text-mute">{moneySmart(m.cpl)}</span>
      {hasCrm && (
        <span
          className="w-12 text-right font-medium"
          style={{ color: crm?.qual ? COLORS.qual : COLORS.dim }}
        >
          {crm ? int(crm.qual) : '—'}
        </span>
      )}
      {hasCrm && (
        <span className="hidden sm:inline w-16 text-right text-mute">
          {crm?.qual ? moneySmart(m.spend / crm.qual) : '—'}
        </span>
      )}
      {stages.map((d) => {
        const n = stageBucket?.get(d.key) || 0
        return (
          <span key={d.key} className="hidden lg:flex w-[86px] justify-end items-baseline gap-1.5">
            <span
              className="font-medium"
              style={{ color: n ? stageColor(d.depth, stageCount) : COLORS.dim }}
            >
              {stageBucket ? int(n) : '—'}
            </span>
            <span className="text-xs text-dim">{n ? moneySmart(m.spend / n) : ''}</span>
          </span>
        )
      })}
      <span className="hidden sm:inline w-14 text-right text-dim">{pct(m.ctr)}</span>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className="text-dim text-xs transition-transform w-3 inline-block"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      ▸
    </span>
  )
}

export default function Campaigns({
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
  const [openCamp, setOpenCamp] = useState<string | null>(null)
  const [openAdset, setOpenAdset] = useState<string | null>(null)

  const camps = rankGroups(rows, (r) => idx.adById.get(r.ad_id)?.campaign_id)
  const maxSpend = Math.max(1, ...camps.map((c) => c.m.spend))
  const hasCrm = !!crmRows

  const stages = deepStages(ds, idx, filters, basis)
  const stageCount = ds.crm?.stage_defs?.length || 1
  const stageByCamp = stagesByCampaign(ds, idx, filters, basis)
  const stageByCampAd = stagesByCampaignAd(ds, idx, filters, basis)
  const emptyStages: Map<string, number> = new Map()

  // campaign_id -> bucket, and `campaign_id|ad name` -> bucket
  const byCamp = new Map<string, CrmBucket>()
  const byCampAd = new Map<string, CrmBucket>()
  for (const r of crmRows || []) {
    for (const key of [r.campaign_id, r.ad_key ? `${r.campaign_id}|${r.ad_key}` : null]) {
      if (!key) continue
      const target = key === r.campaign_id ? byCamp : byCampAd
      const b = target.get(key) || { leads: 0, qual: 0 }
      b.leads += r.leads
      b.qual += r.qual
      target.set(key, b)
    }
  }

  return (
    <section>
      <SectionTitle
        title="Кампании"
        subtitle={
          'Клик по кампании → адсеты → объявления. Сортировка по расходу.' +
          (hasCrm ? ' В выгрузке CRM нет адсета, поэтому квалы там — прочерк.' : '')
        }
        right={
          <div className="hidden sm:flex items-center gap-2 text-[11px] uppercase tracking-wide text-dim">
            <span className="w-20 sm:w-24 text-right">Расход</span>
            <span className="w-12 text-right">Лиды</span>
            <span className="w-16 text-right">CPL</span>
            {hasCrm && <span className="w-12 text-right">Квалы</span>}
            {hasCrm && <span className="w-16 text-right">CPQL</span>}
            {stages.map((d) => (
              <span key={d.key} className="hidden lg:inline w-[86px] text-right" title={d.key}>
                {stageShort(d.key)}
              </span>
            ))}
            <span className="w-14 text-right">CTR</span>
          </div>
        }
      />
      <Card className="p-1.5 sm:p-2">
        <div className="divide-y divide-line2">
          {camps.map((c) => {
            const camp = idx.campById.get(c.id)
            const open = openCamp === c.id
            const w = (c.m.spend / maxSpend) * 100
            return (
              <div key={c.id}>
                <button
                  onClick={() => {
                    setOpenCamp(open ? null : c.id)
                    setOpenAdset(null)
                  }}
                  className="relative w-full text-left group"
                >
                  <div
                    className="absolute inset-y-1 left-0 rounded-md"
                    style={{ width: `${w}%`, background: (camp ? langColor(camp.lang) : COLORS.mute) + '14' }}
                  />
                  <div className="relative flex items-center gap-3 px-2.5 py-2.5">
                    <Chevron open={open} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink font-medium" title={camp?.name}>
                          {camp?.name || c.id}
                        </span>
                        {camp && <LangBadge lang={camp.lang} />}
                      </div>
                    </div>
                    <Cells
                      m={c.m}
                      crm={byCamp.get(c.id)}
                      hasCrm={hasCrm}
                      stages={stages}
                      stageBucket={stageByCamp.get(c.id) || emptyStages}
                      stageCount={stageCount}
                    />
                  </div>
                </button>

                {open && (
                  <div className="pb-2">
                    <AdsetList
                      idx={idx}
                      rows={c.rows}
                      openAdset={openAdset}
                      setOpenAdset={setOpenAdset}
                      byCampAd={byCampAd}
                      hasCrm={hasCrm}
                      stages={stages}
                      stageByCampAd={stageByCampAd}
                      stageCount={stageCount}
                    />
                  </div>
                )}
              </div>
            )
          })}
          {camps.length === 0 && (
            <div className="py-6 text-center text-dim text-sm">Нет данных за выбранный период</div>
          )}
        </div>
      </Card>
    </section>
  )
}

function AdsetList({
  idx,
  rows,
  openAdset,
  setOpenAdset,
  byCampAd,
  hasCrm,
  stages,
  stageByCampAd,
  stageCount,
}: {
  idx: Index
  rows: DailyRow[]
  openAdset: string | null
  setOpenAdset: (v: string | null) => void
  byCampAd: Map<string, CrmBucket>
  hasCrm: boolean
  stages: CrmStageDef[]
  stageByCampAd: Map<string, Map<string, number>>
  stageCount: number
}) {
  const adsets = rankGroups(rows, (r) => idx.adById.get(r.ad_id)?.adset_id)
  return (
    <div className="ml-4 pl-3 border-l border-line2 space-y-0.5">
      {adsets.map((s) => {
        const adset = idx.adsetById.get(s.id)
        const open = openAdset === s.id
        return (
          <div key={s.id}>
            <button
              onClick={() => setOpenAdset(open ? null : s.id)}
              className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-card2/60"
            >
              <Chevron open={open} />
              <span className="min-w-0 flex-1 truncate text-sm text-mute" title={adset?.name}>
                {adset?.name || s.id}
              </span>
              <Cells
                m={s.m}
                hasCrm={hasCrm}
                stages={stages}
                stageBucket={undefined}
                stageCount={stageCount}
              />
            </button>
            {open && (
              <AdList
                idx={idx}
                rows={s.rows}
                byCampAd={byCampAd}
                hasCrm={hasCrm}
                stages={stages}
                stageByCampAd={stageByCampAd}
                stageCount={stageCount}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function AdList({
  idx,
  rows,
  byCampAd,
  hasCrm,
  stages,
  stageByCampAd,
  stageCount,
}: {
  idx: Index
  rows: DailyRow[]
  byCampAd: Map<string, CrmBucket>
  hasCrm: boolean
  stages: CrmStageDef[]
  stageByCampAd: Map<string, Map<string, number>>
  stageCount: number
}) {
  const ads = rankGroups(rows, (r) => r.ad_id)
  return (
    <div className="ml-4 pl-3 border-l border-line2 space-y-0.5 py-1">
      {ads.map((a) => {
        const ad = idx.adById.get(a.id)
        const crm = ad ? byCampAd.get(`${ad.campaign_id}|${ad.name}`) : undefined
        return (
          <div key={a.id} className="flex items-center gap-3 px-2 py-1.5">
            <span className="w-3" />
            {ad?.creative.poster ? (
              <img
                src={assetUrl(ad.creative.poster)}
                alt=""
                className="h-8 w-[18px] rounded object-cover border border-line shrink-0"
                loading="lazy"
              />
            ) : (
              <span className="h-8 w-[18px] rounded bg-card2 border border-line shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-mute" title={ad?.name}>
              {ad?.name || a.id}
            </span>
            <Cells
              m={a.m}
              crm={crm}
              hasCrm={hasCrm}
              stages={stages}
              stageBucket={ad ? stageByCampAd.get(`${ad.campaign_id}|${ad.name}`) || new Map() : undefined}
              stageCount={stageCount}
            />
          </div>
        )
      })}
    </div>
  )
}
