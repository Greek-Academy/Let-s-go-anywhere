import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import { createContentCatalog } from '../../src/content/catalog'
import { sampleCatalog } from '../../src/content/sampleCatalog'
import { createInitialState } from '../../src/state/model'
import type { AppPreviewWindow } from './previewProjection'
import '../../src/styles.css'

const root = createRoot(document.getElementById('root')!)
root.render(<p>入力ツールの「アプリで確認する」から開いてください。</p>)

// No query/file/message listener or storage import. Only the same-origin local editor
// calls this entry point with the explicitly projected display fields.
;(window as AppPreviewWindow).driveplusReviewPreview = {
  present(snapshot) {
    const catalog = createContentCatalog({
      ...sampleCatalog,
      outings: [snapshot.outing],
      arrivalGuides: {},
      tripFacts: {},
    })
    const initialState = createInitialState()
    initialState.onboarded = true
    initialState.discover.region = 'all'
    root.render(
      <StrictMode>
        <App
          key={snapshot.outing.id}
          catalog={catalog}
          persistence="memory"
          initialState={initialState}
        />
      </StrictMode>,
    )
  },
}
