import { useEffect, useMemo, useState } from 'react'
import type { Dataset } from './types'
import {
  aggregate,
  buildIndex,
  buildPresets,
  filterCrm,
  filterRows,
  type Filters,
} from './lib/data'
import { decryptDataset, fetchEncrypted, type EncBlob } from './lib/crypto'
import PasswordGate from './components/PasswordGate'
import Header from './components/Header'
import KpiGrid from './components/KpiGrid'
import CrmHealth from './components/CrmHealth'
import CrmDiag from './components/CrmDiag'
import Placements from './components/Placements'
import TrendCharts from './components/TrendCharts'
import Funnel from './components/Funnel'
import LangSplit from './components/LangSplit'
import SalesFunnel from './components/SalesFunnel'
import GeoTable from './components/GeoTable'
import Campaigns from './components/Campaigns'
import CreativeGallery from './components/CreativeGallery'

const PROJECT = 'Desa Harmonis 2'
const PW_KEY = 'desa_pw'

export default function App() {
  const [enc, setEnc] = useState<EncBlob | null>(null)
  const [ds, setDs] = useState<Dataset | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [gateErr, setGateErr] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)

  useEffect(() => {
    fetchEncrypted()
      .then(setEnc)
      .catch((e) => setErr(e.message))
  }, [])

  // auto-unlock within a session
  useEffect(() => {
    if (!enc) return
    const saved = sessionStorage.getItem(PW_KEY)
    if (saved) unlock(saved, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc])

  async function unlock(pw: string, silent = false): Promise<boolean> {
    if (!enc) return false
    try {
      const d = await decryptDataset(enc, pw)
      setDs(d)
      setFilters({ from: d.date_min, to: d.date_max, lang: 'all' })
      sessionStorage.setItem(PW_KEY, pw)
      setGateErr(null)
      return true
    } catch {
      sessionStorage.removeItem(PW_KEY)
      if (!silent) setGateErr('Неверный пароль')
      return false
    }
  }

  const idx = useMemo(() => (ds ? buildIndex(ds) : null), [ds])
  const rows = useMemo(
    () => (ds && idx && filters ? filterRows(ds, idx, filters) : []),
    [ds, idx, filters],
  )
  const crmRows = useMemo(
    () => (ds && idx && filters ? filterCrm(ds, idx, filters) : null),
    [ds, idx, filters],
  )
  const metrics = useMemo(() => aggregate(rows, crmRows), [rows, crmRows])

  if (err) return <CenterMsg title="Ошибка загрузки" body={err} />
  if (!enc) return <CenterMsg title="Загрузка…" body="" spinner />
  if (!ds || !idx || !filters)
    return <PasswordGate project={PROJECT} error={gateErr} onSubmit={(pw) => unlock(pw)} />

  const presets = buildPresets(ds.date_min, ds.date_max)

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
        <Header ds={ds} filters={filters} setFilters={setFilters} presets={presets} />

        <main className="mt-6 space-y-8">
          <CrmHealth ds={ds} />
          <KpiGrid ds={ds} metrics={metrics} />
          <CrmDiag ds={ds} />
          <TrendCharts rows={rows} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Funnel metrics={metrics} />
            <LangSplit rows={rows} idx={idx} total={metrics} crmRows={crmRows} />
          </div>
          {ds.crm && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SalesFunnel ds={ds} idx={idx} filters={filters} />
              <GeoTable ds={ds} idx={idx} filters={filters} />
            </div>
          )}
          <Campaigns ds={ds} idx={idx} rows={rows} crmRows={crmRows} />
          <Placements ds={ds} idx={idx} filters={filters} crmRows={crmRows} />
          <CreativeGallery ds={ds} idx={idx} rows={rows} crmRows={crmRows} />
        </main>

        <footer className="mt-12 pt-6 border-t border-line text-xs text-dim flex flex-wrap items-center justify-between gap-2">
          <span>
            {ds.project} · {ds.account.name} · Meta Marketing API
            {ds.crm && ' + выгрузка CRM'}
          </span>
          <span>
            Обновляется автоматически каждые 3 часа · лид = событие «lead» · квал = «Qualified» в CRM
          </span>
        </footer>
      </div>
    </div>
  )
}

function CenterMsg({
  title,
  body,
  spinner = false,
}: {
  title: string
  body: string
  spinner?: boolean
}) {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        {spinner && (
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-line border-t-[#4a92e0] animate-spin" />
        )}
        <div className="font-display text-xl text-ink">{title}</div>
        {body && <div className="text-sm text-mute mt-2 max-w-md">{body}</div>}
      </div>
    </div>
  )
}
