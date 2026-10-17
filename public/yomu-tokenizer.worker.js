/* Yomu tokenizer worker. Classic worker so the kuromoji UMD build can load
 * without bundler interop. Dictionary files are stored gzipped with .bin
 * suffixes to avoid HTTP Content-Encoding double-decompression. */
'use strict';

importScripts('vendor/kuromoji.js');

var tokenizerPromise = null;

function katakanaToHiragana(text) {
  var out = '';
  for (var i = 0; i < text.length; i += 1) {
    var code = text.charCodeAt(i);
    out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : text[i];
  }
  return out;
}

function isKatakanaOnly(text) {
  if (!text) return false;
  return /[\u30a0-\u30ff\u31f0-\u31ff]/.test(text) && !/[\u3040-\u309f\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

function normalizeReading(surface, reading) {
  if (!reading || reading === '*') return '';
  if (isKatakanaOnly(surface) && isKatakanaOnly(reading)) return reading;
  return katakanaToHiragana(reading);
}

function mapPos(feature) {
  var detail = feature.pos_detail_1 || '';
  switch (feature.pos) {
    case '名詞':
      if (detail === '形容動詞語幹') return { pos: 'na-adjective', posDetail: detail };
      return { pos: 'noun', posDetail: detail };
    case '動詞':
      return { pos: 'verb', posDetail: detail };
    case '形容詞':
      return { pos: 'i-adjective', posDetail: detail };
    case '形容動詞':
      return { pos: 'na-adjective', posDetail: detail };
    case '助詞':
      return { pos: 'particle', posDetail: detail };
    case '助動詞':
      return { pos: 'auxiliary', posDetail: detail };
    case '副詞':
      return { pos: 'adverb', posDetail: detail };
    case '接続詞':
      return { pos: 'conjunction', posDetail: detail };
    case '連体詞':
      return { pos: 'determiner', posDetail: detail };
    case '感動詞':
      return { pos: 'interjection', posDetail: detail };
    case '接頭詞':
      return { pos: 'prefix', posDetail: detail };
    case '記号':
      return { pos: 'symbol', posDetail: detail };
    default:
      return { pos: 'other', posDetail: detail };
  }
}

function loadTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise(function (resolve, reject) {
      var dicPath = new URL('kuromoji-dict/', self.location.href).pathname;
      self.kuromoji.builder({ dicPath: dicPath }).build(function (error, tokenizer) {
        if (error) {
          reject(error);
          return;
        }
        resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

function tokenize(sentence, tokenizer) {
  return {
    text: sentence,
    tokens: tokenizer.tokenize(sentence).map(function (feature) {
      var surface = feature.surface_form;
      var start = Math.max(0, feature.word_position - 1);
      var reading = normalizeReading(surface, feature.reading || feature.pronunciation || '');
      var mapped = mapPos(feature);
      return {
        surface: surface,
        dictionary: feature.basic_form && feature.basic_form !== '*' ? feature.basic_form : surface,
        reading: reading,
        pos: mapped.pos,
        posDetail: mapped.posDetail,
        properNoun: mapped.posDetail === '固有名詞',
        start: start,
        end: start + surface.length,
      };
    }),
  };
}

self.onmessage = async function (event) {
  var request = event.data;
  try {
    var tokenizer = await loadTokenizer();
    if (request.type === 'warmup') {
      self.postMessage({ type: 'ready', id: request.id });
      return;
    }
    var sentences = request.sentences.map(function (sentence) {
      return tokenize(sentence, tokenizer);
    });
    self.postMessage({ type: 'tokens', id: request.id, sentences: sentences });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: request.id,
      message: error && error.message ? error.message : 'Tokenizer failed to load.',
    });
  }
};
