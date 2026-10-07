import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchTheme, searchThemeError } from '../../../src/domain/searchTheme.ts'

test('genre-only, text-only and combined themes preserve user input and the 80-character API boundary', () => {
  assert.equal(searchTheme('', '自然'), '自然')
  assert.equal(searchTheme('  静かな公園  ', ''), '静かな公園')
  assert.equal(searchTheme('静かな公園', '自然'), '自然 / 静かな公園')
  assert.equal(searchTheme('自然', '自然'), '自然')
  assert.equal(searchThemeError('', '自然'), null)
  assert.equal(searchThemeError('あ'.repeat(75), '自然'), null)
  assert.match(searchThemeError('あ'.repeat(76), '自然'), /80文字/)
  assert.match(searchThemeError(' ', ''), /ジャンルを選ぶか/)
  assert.match(searchThemeError('a\nb', '自然'), /80文字/)
  assert.match(searchThemeError('', '未定義'), /選び直し/)
})
