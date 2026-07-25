import { useState } from 'react'

export default function PasswordGate({
  project,
  error,
  onSubmit,
}: {
  project: string
  error: string | null
  onSubmit: (pw: string) => Promise<boolean>
}) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    await onSubmit(pw)
    setBusy(false)
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <form onSubmit={submit} className="bento w-full max-w-sm p-7 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-card2 border border-line">
          <span className="inline-block h-6 w-1.5 rounded-full bg-gradient-to-b from-[#4a92e0] to-[#d8b878]" />
        </div>
        <h1 className="font-display text-xl font-bold text-ink">{project}</h1>
        <p className="mt-1 text-sm text-mute">Рекламный дашборд · доступ по паролю</p>

        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Пароль"
          className="mt-5 w-full rounded-lg bg-card2 border border-line px-3 py-2.5 text-center text-ink outline-none focus:border-[#4a92e0]"
        />
        {error && <div className="mt-2 text-sm text-[#e2683c]">{error}</div>}
        <button
          type="submit"
          disabled={busy || !pw}
          className="mt-3 w-full rounded-lg bg-[#4a92e0] py-2.5 font-medium text-white transition-colors hover:bg-[#3d82d0] disabled:opacity-50"
        >
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
