import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ContentReview } from './Review'
import '../../src/styles.css'
import './review.css'
createRoot(document.getElementById('review-root')!).render(
  <StrictMode>
    <ContentReview />
  </StrictMode>,
)
