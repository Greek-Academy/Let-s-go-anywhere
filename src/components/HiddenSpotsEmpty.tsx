import { useNavigate } from 'react-router-dom'
import { EmptyState } from './ui'

export function HiddenSpotsEmpty() {
  const navigate = useNavigate()
  return (
    <EmptyState
      title="この検索結果の候補はすべて非表示になっています"
      description="非表示にしたスポットを戻すと、もう一度見ることができます。"
      action="非表示にしたスポットを見る"
      onAction={() => navigate('/profile/hidden-spots')}
    />
  )
}
