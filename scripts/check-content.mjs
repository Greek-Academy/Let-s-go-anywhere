import { stat, readFile } from 'node:fs/promises'
import { parseDraftJson, validateDraft, MAX_DRAFT_BYTES } from '../tools/content-review/model.ts'
import { sampleDraft } from '../tools/content-review/sample.ts'

const args = process.argv.slice(2)
if (args.length !== 1) {
  console.error(
    'Usage: npm run --silent content:check -- /path/to/private-draft.json (or --sample)',
  )
  process.exitCode = 2
} else {
  try {
    let draft
    if (args[0] === '--sample') draft = sampleDraft()
    else {
      const info = await stat(args[0])
      if (!info.isFile()) throw new Error('入力には通常のJSONファイルを指定してください。')
      if (info.size > MAX_DRAFT_BYTES) throw new Error('入力JSONは128 KiB以内にしてください。')
      draft = parseDraftJson(await readFile(args[0], 'utf8'))
    }
    const problems = validateDraft(draft)
    // Never print the draft, input path or permission/internal notes.
    console.log(
      JSON.stringify(
        { complete: problems.length === 0, publication: 'not-implemented', problems },
        null,
        2,
      ),
    )
    process.exitCode = problems.length ? 1 : 0
  } catch (error) {
    console.error(
      error.code
        ? '入力ファイルを読み取れませんでした。パスとアクセス権を確認してください。'
        : error.message,
    )
    process.exitCode = 2
  }
}
