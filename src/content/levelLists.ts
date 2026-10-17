export const INTERESTS = [
  'daily life',
  'food',
  'travel',
  'nature',
  'mystery',
  'technology',
  'culture',
  'sports',
  'news',
  'fantasy',
] as const;

export const INTEREST_LABELS: Record<(typeof INTERESTS)[number], string> = {
  'daily life': 'Daily life',
  food: 'Food',
  travel: 'Travel',
  nature: 'Nature',
  mystery: 'Mystery',
  technology: 'Technology',
  culture: 'Culture',
  sports: 'Sports',
  news: 'News',
  fantasy: 'Fantasy',
};

const KANJI_BY_LEVEL: Record<number, string> = {
  1: '一二三四五六七八九十百千万円日月火水木金土年時分今週毎朝昼夜食飲見聞話読書人行来帰出入立座寝起休働学校先生友家国語日本語車電車駅道町村山川海空天雨雪風花犬猫魚鳥肉茶米大小高安新古長白黒赤青何名前後中外上下左右東西南北手目口耳身体心気力電話新聞写真映画音楽料理店公園週末朝食昼食夕食',
  2: '世界地図旅行予定出発到着 airport 空港港島森林池橋buildings建物部屋台所風呂洗濯掃除買物売値段料金銀行郵便局病院薬医者会社仕事会議試験勉強練習説明質問回答意味言葉文法発音漢字平仮名片仮名便利不便大切必要十分足早遅strong弱暑寒暖涼味甘辛塩油野菜果物卵牛乳牛肉豚肉鶏肉魚介類米飯麺菓子飲物酒珈琲紅茶果汁宅配電話番号住所名前家族父母兄弟姉妹夫婦子供祖父祖母お客様旅行者観光客写真家作家記者歌手選手選手権試合運動競技野球蹴球水泳歩走飛泳遊休泊宿泊温泉旅館和室布団浴衣靴下帽子眼鏡傘鞄財布鍵時計眼鏡',
  3: '環境自然資源 energy エネルギー汚染気候温暖化地域社会文化歴史伝統習慣制度政治経済産業企業組織情報技術研究開発実験観察結果原因影響関係意味価値判断意見提案議論交渉契約約束信頼責任義務権利自由平等平和戦争災害地震台風洪水被害救助支援協力参加活動経験記憶想像感情感覚意識無意識努力成功失敗挑戦達成目標計画準備確認報告連絡相談説明交渉説得感謝謝罪遠慮容赦勘弁我慢辛抱工夫改善変更交換整理整頓順序手続処理操作機械器具道具材料作品芸術絵画彫刻建築設計写真撮影記録保存公開展示発表演奏演劇舞台小説詩歌俳句短歌物語主人公背景表現描写象徴比喩暗示解釈翻訳通訳',
  4: '複雑微妙曖昧具体抽象客観主観積極消極慎重大胆柔軟硬直迅速緩慢適切不適切効果影響要因結果過程段階傾向特徴個性能力可能性実現化構築維持管理運営経営評価分析検証仮説理論原則方針戦略政策規制緩和競争共存格差貧富雇用労働賃金待遇福利厚生健康医療介護福祉教育格差環境問題資源枯渇持続可能発展途上先進国際交流協力関係条約協定交渉決裂妥協合意形成意思決定責任転嫁批判擁護賛成反対中立偏見差別偏見排除包摂多様性尊重共生',
  5: '繊細緻密卓越顕著曖昧模糊曖昧模糊矛盾葛藤焦燥憂鬱怠惰傲慢謙虚潔癖執着愛着哀愁郷愁憧憬羨望嫉妬慈愛慈悲寛容苛刻頑固柔和穏健過激極端普遍特殊個別具体抽象概念的断定推測憶測洞察見識眼識教養品位品格風格様式趣向嗜好美意識感性官能直感本能衝動欲望執念妄執幻想錯覚幻影幻滅虚無孤独孤立疎外疎遠親密親愛慈しみ憐憫哀れ郷愁叙情叙景余韻余情含蓄示唆暗示象徴寓話比喩隠喩直喩換喩提喩',
};

export function allowedKanji(level: number): Set<string> {
  const chars = new Set<string>();
  const top = Math.ceil(Math.min(5, Math.max(1, level)));
  for (let band = 1; band <= top; band += 1) {
    for (const char of KANJI_BY_LEVEL[band] ?? '') chars.add(char);
  }
  return chars;
}

export const FUNCTION_POS = new Set(['particle', 'auxiliary', 'symbol', 'conjunction']);

export const COMMON_KANA_WORDS = new Set([
  'いる',
  'ある',
  'する',
  'なる',
  'こと',
  'もの',
  'ため',
  'よう',
  'そう',
  'この',
  'その',
  'あの',
  'ここ',
  'そこ',
  'どこ',
  'とき',
  'いま',
  'とても',
  '少し',
  'そして',
  'でも',
  'しかし',
  'から',
  'まで',
  'より',
  'だけ',
  'しか',
  'ほど',
  'くらい',
  'など',
  'でしょう',
  'だろう',
  'ません',
  'ました',
  'です',
  'ます',
]);

export const LEVEL_SAMPLES: { level: number; sampleJa: string; sampleRuby: string; sampleEn: string }[] = [
  {
    level: 1,
    sampleJa: '今日は公園へ行きました。猫がいました。',
    sampleRuby: '{今日|きょう}は{公園|こうえん}へ{行|い}きました。{猫|ねこ}がいました。',
    sampleEn: 'Today I went to the park. There was a cat.',
  },
  {
    level: 2,
    sampleJa: '週末に友達と小さな町を旅しました。道に迷いましたが、親切な人に助けてもらいました。',
    sampleRuby: '{週末|しゅうまつ}に{友達|ともだち}と{小|ちい}さな{町|まち}を{旅|たび}しました。{道|みち}に{迷|まよ}いましたが、{親切|しんせつ}な{人|ひと}に{助|たす}けてもらいました。',
    sampleEn: 'On the weekend I traveled with a friend to a small town. We got lost, but a kind person helped us.',
  },
  {
    level: 3,
    sampleJa: '古い写真館を訪ねたとき、店主は一枚の写真を見せながら、町の知られざる歴史について語り始めた。',
    sampleRuby: '{古|ふる}い{写真館|しゃしんかん}を{訪|たず}ねたとき、{店主|てんしゅ}は{一枚|いちまい}の{写真|しゃしん}を{見|み}せながら、{町|まち}の{知|し}られざる{歴史|れきし}について{語|かた}り{始|はじ}めた。',
    sampleEn: 'When I visited an old photo studio, the owner showed me a photograph and began to tell the town’s little-known history.',
  },
  {
    level: 4,
    sampleJa: '地域の書店が閉店するという知らせを受け、住民たちはその場所が担ってきた役割について改めて考え始めた。',
    sampleRuby: '{地域|ちいき}の{書店|しょてん}が{閉店|へいてん}するという{知|し}らせを{受|う}け、{住民|じゅうみん}たちはその{場所|ばしょ}が{担|にな}ってきた{役割|やくわり}について{改|あらた}めて{考|かんが}え{始|はじ}めた。',
    sampleEn: 'After learning that the local bookstore would close, residents began to reconsider the role the place had played.',
  },
  {
    level: 5,
    sampleJa: '雪解けの庭に差し込む光は、遠い記憶の輪郭をゆっくりと浮かび上がらせ、言葉にならない余韻を残した。',
    sampleRuby: '{雪解|ゆきど}けの{庭|にわ}に{差|さ}し{込|こ}む{光|ひかり}は、{遠|とお}い{記憶|きおく}の{輪郭|りんかく}をゆっくりと{浮|う}かび{上|あ}がらせ、{言葉|ことば}にならない{余韻|よいん}を{残|のこ}した。',
    sampleEn: 'Light falling into the thawing garden slowly brought the outlines of distant memories into view, leaving an inexpressible resonance.',
  },
];
