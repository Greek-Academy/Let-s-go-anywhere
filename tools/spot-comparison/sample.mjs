// Synthetic provider envelopes exercise the same parsing and deduplication path; no network.
export function comparisonSample(provider, query) {
  const spots = Array.from({ length: 10 }, (_, i) => {
    const index = provider === 'anthropic' && i >= 2 ? i + 10 : i
    const tagSets = [
      ['カフェ', 'コーヒー', '落ち着いた雰囲気'],
      ['自然', '景色'],
      ['和食'],
      ['洋食'],
      ['カフェ', 'スイーツ'],
      ['アート'],
    ]
    const kinds = [
      '小さな喫茶店',
      '緑のテラス',
      '和食のお店',
      '街角のビストロ',
      'お菓子の工房',
      'アートのあるお店',
    ]
    return {
      name: `サンプル${String(index + 1).padStart(2, '0')}・${kinds[index % 6]}`,
      area: `${query.region}・架空のエリア`,
      summary: 'お店選びの操作を確かめる架空の候補です。実在するお店の情報ではありません。',
      matchReason: `${provider === 'openai' ? 'OpenAI' : 'Claude'}の提案例です。${kinds[index % 6]}を楽しむ休日を想定しています。`,
      sourceUrl: `https://example.com/shops/${index + 1}`,
      tags: tagSets[index % 6],
    }
  })
  if (provider === 'openai')
    return {
      status: 'completed',
      output: [
        {
          type: 'web_search_call',
          status: 'completed',
          action: { type: 'search', sources: spots.map((s) => ({ url: s.sourceUrl })) },
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify({ spots }), annotations: [] }],
        },
      ],
    }
  return {
    stop_reason: 'end_turn',
    content: [
      { type: 'text', text: '検索します。' },
      {
        type: 'web_search_tool_result',
        content: spots.map((s) => ({ type: 'web_search_result', url: s.sourceUrl, title: s.name })),
      },
      {
        type: 'text',
        text: JSON.stringify({ spots }),
        citations: spots.map((s) => ({ type: 'web_search_result_location', url: s.sourceUrl })),
      },
    ],
  }
}
