import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFile, detectUrlType, fileCategory, mediaType } from '../src/upload.js'

test('识别常见图片、视频和音乐格式', () => {
  assert.equal(fileCategory({ name: 'cover.heic', type: '' }), 'image')
  assert.equal(fileCategory({ name: 'concert.mkv', type: '' }), 'video')
  assert.equal(classifyFile({ name: 'track.flac', type: '' }).contentType, 'audio/flac')
  assert.equal(fileCategory({ name: 'audiobook.m4b', type: '' }), 'audio')
})

test('识别没有 MIME 类型的游戏 ROM', () => {
  assert.equal(fileCategory({ name: 'zelda.gba', type: '' }), 'game')
  assert.equal(fileCategory({ name: 'disc.chd', type: 'application/octet-stream' }), 'game')
})

test('识别多种电子书和漫画格式', () => {
  assert.equal(fileCategory({ name: 'novel.epub', type: '' }), 'ebook')
  assert.equal(mediaType({ name: 'manual.pdf', type: 'application/pdf; charset=binary' }), 'application/pdf')
  assert.equal(fileCategory({ name: 'comic.cbr', type: '' }), 'ebook')
  assert.equal(fileCategory({ name: 'notes.md', type: 'text/markdown' }), 'ebook')
  assert.equal(fileCategory({ name: 'README.md', type: '' }), 'ebook')
  assert.equal(fileCategory({ name: 'sonic.md', type: 'application/octet-stream' }), 'game')
})

test('保留链接文件和未知格式的边界', () => {
  assert.equal(fileCategory({ name: 'article.url.txt', type: 'text/plain' }), 'link')
  assert.equal(fileCategory({ name: 'installer.exe', type: 'application/octet-stream' }), '')
})

test('远程地址按扩展名进入对应上传流程', () => {
  assert.equal(detectUrlType('https://cdn.example/music.opus?download=1'), 'audio')
  assert.equal(detectUrlType('https://cdn.example/game.nsp'), 'game')
  assert.equal(detectUrlType('https://cdn.example/book.azw3'), 'ebook')
  assert.equal(detectUrlType('https://example.com/read-this'), 'auto')
})
