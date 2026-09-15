import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { CarFront, Download, FilePlus2, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react'
import {
  blankDraft,
  canPreviewPhoto,
  fieldLabels,
  fields,
  MAX_DRAFT_BYTES,
  parseDraftJson,
  validateDraft,
} from './model'
import type { Check, Confirmation, Draft, Field, Problem, Source } from './model'
import { sampleDraft } from './sample'
import { PreviewCard } from './PreviewCard'

function TextField({
  id,
  label,
  value,
  onChange,
  multiline = false,
  type = 'text',
  maxLength = 2000,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  type?: string
  maxLength?: number
  hint?: string
}) {
  return (
    <div className="review-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          aria-describedby={hint ? id + '-hint' : undefined}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          id={id}
          aria-describedby={hint ? id + '-hint' : undefined}
          type={type}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  )
}
function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="review-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  )
}
const confirmationOptions = (
  <>
    <option value="unconfirmed">未確認</option>
    <option value="confirmed">確認内容を入力済み</option>
    <option value="withdrawn">取り下げ・利用停止</option>
  </>
)
const tabs = ['基本情報', '情報源・確認', '写真の条件'] as const

function ReplacementDialog({
  onCancel,
  onReplace,
}: {
  onCancel: () => void
  onReplace: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('button')?.focus()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="review-modal"
      aria-labelledby="replace-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const buttons = ref.current!.querySelectorAll<HTMLButtonElement>('button')
        const first = buttons[0],
          last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id="replace-title">編集中の入力を置き換えますか？</h2>
      <p>必要な内容は「入力JSONを保存」で保存してから置き換えてください。</p>
      <div>
        <button autoFocus onClick={onCancel}>
          編集を続ける
        </button>
        <button className="review-primary" onClick={onReplace}>
          入力を置き換える
        </button>
      </div>
    </dialog>
  )
}

export function ContentReview() {
  const [draft, setDraft] = useState(blankDraft)
  const [tab, setTab] = useState(0)
  const [message, setMessage] = useState('')
  const [importError, setImportError] = useState('')
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null)
  const [replacement, setReplacement] = useState<'blank' | 'sample' | 'import' | null>(null)
  const [pendingImport, setPendingImport] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const importGeneration = useRef(0)
  const problems = validateDraft(draft)
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url)
    },
    [photo],
  )
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const edit = (next: Draft | ((value: Draft) => Draft)) => {
    ++importGeneration.current
    setDraft(next)
    setDirty(true)
    setMessage('')
  }
  const patch = (value: Partial<Draft>, field?: Field) =>
    edit((previous) => ({
      ...previous,
      ...value,
      checks: field
        ? { ...previous.checks, [field]: { ...previous.checks[field], state: 'unconfirmed' } }
        : previous.checks,
    }))
  const patchCheck = (field: Field, value: Partial<Check>) =>
    edit((previous) => ({
      ...previous,
      checks: {
        ...previous.checks,
        [field]: { ...previous.checks[field], state: 'unconfirmed', ...value },
      },
    }))
  const patchPhoto = (value: Partial<Draft['photo']>) =>
    edit((previous) => ({
      ...previous,
      photo: { ...previous.photo, state: 'unconfirmed', ...value },
    }))
  const patchSource = (index: number, value: Partial<Source>) =>
    edit((previous) => {
      const old = previous.sources[index]
      const checks = { ...previous.checks }
      for (const field of fields)
        if (checks[field].sourceIds.includes(old.id))
          checks[field] = {
            ...checks[field],
            state: 'unconfirmed',
            sourceIds: checks[field].sourceIds.map((id) => (id === old.id ? (value.id ?? id) : id)),
          }
      return {
        ...previous,
        sources: previous.sources.map((source, i) =>
          i === index ? { ...source, ...value } : source,
        ),
        checks,
      }
    })
  const removeSource = (index: number) =>
    edit((previous) => {
      const id = previous.sources[index].id,
        checks = { ...previous.checks }
      for (const field of fields)
        if (checks[field].sourceIds.includes(id))
          checks[field] = {
            ...checks[field],
            state: 'unconfirmed',
            sourceIds: checks[field].sourceIds.filter((value) => value !== id),
          }
      return { ...previous, sources: previous.sources.filter((_, i) => i !== index), checks }
    })
  const applyReplacement = (kind: 'blank' | 'sample' | 'import', imported = pendingImport) => {
    ++importGeneration.current
    setDraft(kind === 'blank' ? blankDraft() : kind === 'sample' ? sampleDraft() : imported!)
    setPhoto(null)
    setDirty(false)
    setReplacement(null)
    setPendingImport(null)
    setImportError('')
    setTab(0)
    setMessage(
      kind === 'sample'
        ? '架空のサンプルを読み込みました。確認・許諾の実施記録ではありません。'
        : kind === 'import'
          ? 'JSONを読み込みました。写真ファイルは端末から選び直してください。'
          : '新しい下書きを作成しました。',
    )
  }
  const replace = (kind: 'blank' | 'sample') => {
    if (dirty) setReplacement(kind)
    else applyReplacement(kind)
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const generation = ++importGeneration.current
    try {
      if (file.size > MAX_DRAFT_BYTES) throw new Error('入力JSONは128 KiB以内にしてください。')
      const imported = parseDraftJson(await file.text())
      if (generation !== importGeneration.current) return
      if (dirty) {
        setPendingImport(imported)
        setReplacement('import')
      } else applyReplacement('import', imported)
    } catch (error) {
      if (generation === importGeneration.current) setImportError((error as Error).message)
    }
  }
  const download = () => {
    try {
      // Re-parse on export too, so an unfinished input still round-trips with the documented schema.
      const json = JSON.stringify(parseDraftJson(JSON.stringify(draft)), null, 2) + '\n'
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'driveplus-private-draft.json'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      // A download request is not proof that the file was saved; keep the unsaved-change guard.
      setMessage(
        '入力JSONの保存を開始しました。確認メモを含むため、端末内で保管してください。写真本体は含みません。',
      )
    } catch (error) {
      setImportError((error as Error).message)
    }
  }
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setImportError('写真は5 MiB以内のPNG・JPEG・WebPを選んでください。')
      return
    }
    setPhoto({ name: file.name, url: URL.createObjectURL(file) })
    patchPhoto({ ...blankDraft().photo, enabled: true, assetName: file.name })
    setMessage('写真を選択しました。選んだファイルの利用条件を確認して入力してください。')
    setImportError('')
  }
  const focusProblem = (problem: Problem) => {
    setTab(problem.path.startsWith('photo') ? 2 : /^(checks|sources)/.test(problem.path) ? 1 : 0)
    requestAnimationFrame(() => {
      const element = document.getElementById(problem.path)
      if (element instanceof HTMLElement) {
        const input = element.matches('input,select,textarea')
          ? element
          : element.querySelector<HTMLElement>('input,select,textarea')
        ;(input ?? element).focus()
      }
    })
  }
  return (
    <main className="review-shell">
      <header className="review-header">
        <div className="review-brand">
          <CarFront size={29} />
          <strong>Drive+</strong>
          <span>LOCAL CONTENT REVIEW</span>
        </div>
        <span className="review-tag">ローカル専用</span>
      </header>
      <div className="review-intro">
        <p className="review-eyebrow">掲載前に、情報をひとつずつ。</p>
        <h1>掲載情報の入力チェック</h1>
        <p>情報源・確認日・写真の条件を整理し、カードの見え方を確認します。</p>
      </div>
      <div className="review-toolbar">
        <button onClick={() => replace('blank')}>
          <FilePlus2 size={17} />
          新しい下書き
        </button>
        <button onClick={() => replace('sample')}>確認用サンプル</button>
        <label className="review-file-button">
          <Upload size={17} />
          JSONを読み込む
          <input
            aria-label="JSONを読み込む"
            type="file"
            accept=".json,application/json"
            onChange={importFile}
          />
        </label>
        <button className="review-primary" onClick={download}>
          <Download size={17} />
          入力JSONを保存
        </button>
      </div>
      <p className="review-privacy">
        入力はこのタブのメモリ内で扱います。自動保存・送信・公開はしません。必要な下書きはJSONで保存してください。
      </p>
      {message && (
        <p className="review-message" role="status">
          {message}
        </p>
      )}
      {importError && (
        <div className="review-error" role="alert">
          {importError}
          <button onClick={() => setImportError('')}>閉じる</button>
        </div>
      )}
      <div className="review-layout">
        <div className="review-editor">
          <div className="review-tabs" role="tablist" aria-label="入力の分類">
            {tabs.map((label, i) => (
              <button
                key={label}
                role="tab"
                aria-selected={tab === i}
                tabIndex={tab === i ? 0 : -1}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowRight'
                      ? (i + 1) % tabs.length
                      : event.key === 'ArrowLeft'
                        ? (i + tabs.length - 1) % tabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : null
                  if (next !== null) {
                    event.preventDefault()
                    setTab(next)
                    document.getElementById('tab-' + next)?.focus()
                  }
                }}
                aria-controls="review-panel"
                id={'tab-' + i}
                onClick={() => setTab(i)}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>
          <section
            className="review-panel"
            id="review-panel"
            role="tabpanel"
            aria-labelledby={'tab-' + tab}
          >
            {tab === 0 && (
              <>
                <h2>お出かけの基本情報</h2>
                <div className="review-two">
                  <TextField
                    id="id"
                    label="管理ID"
                    value={draft.id}
                    maxLength={80}
                    onChange={(id) => patch({ id })}
                    hint="英小文字・数字・ハイフン"
                  />
                  <Select
                    id="kind"
                    label="種別"
                    value={draft.kind}
                    onChange={(kind) =>
                      edit((previous) => ({
                        ...previous,
                        kind: kind as Draft['kind'],
                        eventYear: null,
                        startsAt: '',
                        endsAt: '',
                        checks: { ...previous.checks, schedule: blankDraft().checks.schedule },
                      }))
                    }
                  >
                    <option value="event">イベント</option>
                    <option value="spot">常設スポット</option>
                  </Select>
                </div>
                <TextField
                  id="title"
                  label="名称"
                  value={draft.title}
                  maxLength={120}
                  onChange={(title) => patch({ title }, 'title')}
                />
                <TextField
                  id="summary"
                  label="短い紹介"
                  value={draft.summary}
                  maxLength={200}
                  onChange={(summary) => patch({ summary })}
                />
                <TextField
                  id="area"
                  label="場所"
                  value={draft.area}
                  maxLength={200}
                  onChange={(area) => patch({ area }, 'location')}
                />
                {draft.kind === 'event' && (
                  <>
                    <TextField
                      id="eventYear"
                      label="開催年"
                      value={draft.eventYear?.toString() ?? ''}
                      maxLength={4}
                      onChange={(value) =>
                        patch(
                          { eventYear: value ? Number(value.replace(/[^0-9]/g, '')) : null },
                          'schedule',
                        )
                      }
                    />
                    <TextField
                      id="startsAt"
                      label="開始日時"
                      value={draft.startsAt}
                      maxLength={40}
                      hint="例：2026-10-01T10:00:00+09:00（日本時間）"
                      onChange={(startsAt) => patch({ startsAt }, 'schedule')}
                    />
                    <TextField
                      id="endsAt"
                      label="終了日時"
                      value={draft.endsAt}
                      maxLength={40}
                      onChange={(endsAt) => patch({ endsAt }, 'schedule')}
                    />
                  </>
                )}
                <TextField
                  id="tags"
                  label="タグ"
                  value={draft.tags.join('、')}
                  maxLength={247}
                  hint="「、」で区切る・8個まで・各30文字まで"
                  onChange={(value) => patch({ tags: value ? value.split('、') : [] })}
                />
                <TextField
                  id="description"
                  label="説明"
                  value={draft.description}
                  multiline
                  onChange={(description) => patch({ description })}
                />
                <TextField
                  id="internalNote"
                  label="確認メモ（カードには表示しません）"
                  value={draft.internalNote}
                  multiline
                  onChange={(internalNote) => patch({ internalNote })}
                />
              </>
            )}
            {tab === 1 && (
              <>
                <h2>情報源と、項目ごとの確認</h2>
                <p className="review-hint">
                  SNS投稿と掲載するお出かけを分けて記録します。URLの内容を自動取得・推測する処理はありません。
                </p>
                {draft.sources.map((source, i) => (
                  <fieldset className="review-source" key={i}>
                    <legend>情報源 {i + 1}</legend>
                    <div className="review-two">
                      <TextField
                        id={`sources[${i}].id`}
                        label={`情報源${i + 1}のID`}
                        value={source.id}
                        maxLength={80}
                        onChange={(id) => patchSource(i, { id })}
                      />
                      <Select
                        id={`sources[${i}].kind`}
                        label={`情報源${i + 1}の種類`}
                        value={source.kind}
                        onChange={(kind) => patchSource(i, { kind: kind as Source['kind'] })}
                      >
                        <option value="official">公式告知</option>
                        <option value="x">X</option>
                        <option value="tiktok">TikTok</option>
                        <option value="onsite">施設・現地確認</option>
                      </Select>
                    </div>
                    <TextField
                      id={`sources[${i}].label`}
                      label={`情報源${i + 1}の名称`}
                      value={source.label}
                      maxLength={120}
                      onChange={(label) => patchSource(i, { label })}
                    />
                    <TextField
                      id={`sources[${i}].url`}
                      label={`情報源${i + 1}のURL`}
                      value={source.url}
                      maxLength={2048}
                      onChange={(url) => patchSource(i, { url })}
                    />
                    <label className="review-check">
                      <input
                        type="checkbox"
                        checked={source.available}
                        onChange={(e) => patchSource(i, { available: e.target.checked })}
                      />
                      この情報源を参照できる
                    </label>
                    <button className="review-remove" onClick={() => removeSource(i)}>
                      <Trash2 size={14} />
                      情報源{i + 1}を削除
                    </button>
                  </fieldset>
                ))}
                <button
                  className="review-add"
                  disabled={draft.sources.length >= 20}
                  onClick={() =>
                    edit((previous) => ({
                      ...previous,
                      sources: [
                        ...previous.sources,
                        {
                          id: 'source-' + crypto.randomUUID().slice(0, 8),
                          kind: 'official',
                          label: '',
                          url: '',
                          available: false,
                        },
                      ],
                    }))
                  }
                >
                  <Plus size={16} />
                  情報源を追加
                </button>
                {fields
                  .filter((field) => draft.kind === 'event' || field !== 'schedule')
                  .map((field) => (
                    <fieldset className="review-source" key={field}>
                      <legend>{fieldLabels[field]}の確認</legend>
                      <fieldset className="review-links" id={'checks.' + field + '.sourceIds'}>
                        <legend>根拠として使う情報源</legend>
                        {draft.sources.map((source, i) => (
                          <label className="review-check" key={i}>
                            <input
                              type="checkbox"
                              checked={draft.checks[field].sourceIds.includes(source.id)}
                              onChange={(e) =>
                                patchCheck(field, {
                                  sourceIds: e.target.checked
                                    ? [...draft.checks[field].sourceIds, source.id]
                                    : draft.checks[field].sourceIds.filter(
                                        (id) => id !== source.id,
                                      ),
                                })
                              }
                            />
                            {source.label || '名称未入力'} {!source.available && '（参照不可）'}
                          </label>
                        ))}
                        {!draft.sources.length && (
                          <p className="review-hint">先に情報源を追加してください。</p>
                        )}
                      </fieldset>
                      <div className="review-two">
                        <TextField
                          id={'checks.' + field + '.checkedAt'}
                          label={fieldLabels[field] + 'の確認日'}
                          type="date"
                          value={draft.checks[field].checkedAt}
                          onChange={(checkedAt) => patchCheck(field, { checkedAt })}
                        />
                        <TextField
                          id={'checks.' + field + '.reviewBy'}
                          label={fieldLabels[field] + 'の再確認期限'}
                          type="date"
                          value={draft.checks[field].reviewBy}
                          onChange={(reviewBy) => patchCheck(field, { reviewBy })}
                        />
                      </div>
                      <Select
                        id={'checks.' + field + '.state'}
                        label={fieldLabels[field] + 'の確認状態'}
                        value={draft.checks[field].state}
                        onChange={(state) => patchCheck(field, { state: state as Confirmation })}
                      >
                        {confirmationOptions}
                      </Select>
                    </fieldset>
                  ))}
              </>
            )}
            {tab === 2 && (
              <>
                <h2>写真の利用条件</h2>
                <label className="review-check">
                  <input
                    type="checkbox"
                    checked={draft.photo.enabled}
                    onChange={(e) => patchPhoto({ enabled: e.target.checked })}
                  />
                  写真を掲載候補に含める
                </label>
                <p className="review-hint">
                  権利者・利用範囲・許諾記録を文章の根拠と分けて記録します。写真を選び直すと、利用条件は未確認に戻ります。
                </p>
                {draft.photo.enabled && (
                  <>
                    <label className="review-file-button review-photo-picker">
                      <Upload size={17} />
                      写真を選ぶ
                      <input
                        aria-label="写真を選ぶ"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={choosePhoto}
                      />
                    </label>
                    <TextField
                      id="photo.assetName"
                      label="写真ファイル名"
                      value={draft.photo.assetName}
                      maxLength={160}
                      onChange={(assetName) => patchPhoto({ assetName })}
                      hint="PNG・JPEG・WebP、5 MiB以内。JSONには写真本体を含めません。"
                    />
                    <TextField
                      id="photo.owner"
                      label="写真の権利者"
                      value={draft.photo.owner}
                      maxLength={200}
                      onChange={(owner) => patchPhoto({ owner })}
                    />
                    <TextField
                      id="photo.permissionRef"
                      label="許諾記録の参照先（非公開メモ）"
                      value={draft.photo.permissionRef}
                      maxLength={500}
                      onChange={(permissionRef) => patchPhoto({ permissionRef })}
                    />
                    <TextField
                      id="photo.scope"
                      label="写真の利用範囲"
                      value={draft.photo.scope}
                      maxLength={500}
                      onChange={(scope) => patchPhoto({ scope })}
                    />
                    <TextField
                      id="photo.credit"
                      label="写真のクレジット"
                      value={draft.photo.credit}
                      maxLength={200}
                      onChange={(credit) => patchPhoto({ credit })}
                    />
                    <TextField
                      id="photo.alt"
                      label="写真の代替テキスト"
                      value={draft.photo.alt}
                      maxLength={200}
                      onChange={(alt) => patchPhoto({ alt })}
                    />
                    <div className="review-two">
                      <TextField
                        id="photo.checkedAt"
                        label="写真条件の確認日"
                        type="date"
                        value={draft.photo.checkedAt}
                        onChange={(checkedAt) => patchPhoto({ checkedAt })}
                      />
                      <TextField
                        id="photo.reviewBy"
                        label="写真条件の再確認期限"
                        type="date"
                        value={draft.photo.reviewBy}
                        onChange={(reviewBy) => patchPhoto({ reviewBy })}
                      />
                    </div>
                    <Select
                      id="photo.state"
                      label="写真の確認状態"
                      value={draft.photo.state}
                      onChange={(state) => patchPhoto({ state: state as Confirmation })}
                    >
                      {confirmationOptions}
                    </Select>
                  </>
                )}
              </>
            )}
          </section>
          <section
            className={'review-validation ' + (!problems.length ? 'complete' : '')}
            aria-label="入力チェック結果"
          >
            <h2>
              <ShieldCheck size={20} />
              {problems.length
                ? `確認したい入力が${problems.length}件あります`
                : '入力項目が揃いました'}
            </h2>
            <p>
              入力形式と記録の有無のチェックです。公開の承認・情報の真偽・写真の許諾を保証しません。
            </p>
            {!!problems.length && (
              <ul>
                {problems.map((problem, i) => (
                  <li key={i}>
                    <button onClick={() => focusProblem(problem)}>
                      <code>{problem.path}</code>
                      {problem.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <PreviewCard
          draft={draft}
          photoUrl={
            photo && photo.name === draft.photo.assetName && canPreviewPhoto(draft) ? photo.url : ''
          }
        />
      </div>
      {replacement && (
        <ReplacementDialog
          onCancel={() => {
            setReplacement(null)
            setPendingImport(null)
          }}
          onReplace={() => applyReplacement(replacement)}
        />
      )}
    </main>
  )
}
