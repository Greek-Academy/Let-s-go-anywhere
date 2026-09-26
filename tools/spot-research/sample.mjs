// Fabricated provider response for offline tests. This is not a recorded API result.
export function sampleResponse() {
  const sourceUrl = 'https://kyoto.travel/en/'
  return {
    status: 'completed',
    usage: { input_tokens: 2400, output_tokens: 900, input_tokens_details: { cached_tokens: 0 } },
    output: [
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', sources: [{ url: sourceUrl }] },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            annotations: [],
            text: JSON.stringify({
              spots: [
                {
                  name: '川辺の散歩道（架空サンプル）',
                  area: '京都市・サンプルエリア',
                  summary: '川のそばで景色を眺めながら、ゆっくり過ごす休日のイメージです。',
                  matchReason: '自然の中で散歩したい、という条件の表示例です。',
                  sourceUrl,
                },
                {
                  name: '庭を眺めるカフェ（架空サンプル）',
                  area: '京都市・サンプルエリア',
                  summary: '散歩のあとに、窓辺でひと休みする候補の表示例です。',
                  matchReason: 'カフェで休憩したい、という条件の表示例です。',
                  sourceUrl,
                },
                {
                  name: '緑の小さな庭園（架空サンプル）',
                  area: '京都市・サンプルエリア',
                  summary: '予定を詰め込まず、緑を楽しむお出かけのイメージです。',
                  matchReason: '自然を楽しみたい、という条件の表示例です。',
                  sourceUrl,
                },
              ],
            }),
          },
        ],
      },
    ],
  }
}
