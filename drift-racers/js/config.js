// Character definitions - 8 unique characters with personality and unique skills
var CHARACTERS = [
  {n:'ブレイズ', e:'🔥', col:0xFF4400, s:9, a:6, h:5, d:'炎の暴走族',
   bc:0xCC2200, hc:0xFF6622, skin:0xFFBB88, body:'dragon', img:'models/blaze-2d.jpg',
   desc:'ドラゴンの末裔。炎を纏うスピード狂',
   skill:'flame_burst', skillName:'フレイムバースト',
   skillDesc:'瞬間的に超加速！短距離バースト', skillCD:480, skillDur:45},
  {n:'アクア',   e:'💧', col:0x0088FF, s:6, a:7, h:8, d:'海の女王',
   bc:0x0055CC, hc:0x44CCFF, skin:0xFFDDAA, body:'mermaid', img:'models/aqua-2d.jpg',
   desc:'深海から来た水の精霊。波を操る',
   skill:'aqua_shield', skillName:'アクアシールド',
   skillDesc:'水のバリアで攻撃を防ぎ減速無効', skillCD:540, skillDur:180},
  {n:'テラ',     e:'🌿', col:0x22CC44, s:7, a:8, h:6, d:'大地の守護者',
   bc:0x118822, hc:0x88FF88, skin:0xDDAA77, body:'golem', img:'models/terra-2d.jpg',
   desc:'森の精霊。自然の力で加速する',
   skill:'quake', skillName:'アースクエイク',
   skillDesc:'地震で周囲のライバルを減速させる', skillCD:600, skillDur:60},
  {n:'シャドウ', e:'🌙', col:0x8844CC, s:10, a:5, h:5, d:'闇の支配者',
   bc:0x5522AA, hc:0xBB77FF, skin:0xCCBBDD, body:'phantom', img:'models/shadow-2d.jpg',
   desc:'異次元からの来訪者。最速の影',
   skill:'shadow_phase', skillName:'シャドウフェイズ',
   skillDesc:'一定時間、壁と他のレーサーをすり抜ける', skillCD:540, skillDur:120},
  {n:'ソラ',     e:'☀️', col:0xFFAA00, s:5, a:9, h:7, d:'太陽の戦士',
   bc:0xCC7700, hc:0xFFDD66, skin:0xFFCCAA, body:'angel', img:'models/sora-2d.jpg',
   desc:'天界の使者。光の加速で勝負',
   skill:'solar_boost', skillName:'ソーラーブースト',
   skillDesc:'最高速が大幅にアップ！長距離向け', skillCD:600, skillDur:150},
  {n:'メカ',     e:'🤖', col:0x44DDDD, s:8, a:8, h:4, d:'超AIマシン',
   bc:0x228888, hc:0x88FFFF, skin:0xBBDDDD, body:'robot', img:'models/mecha-2d.jpg',
   desc:'未来から来たロボットレーサー',
   skill:'overclock', skillName:'オーバークロック',
   skillDesc:'全ステータスを一時的に強化', skillCD:660, skillDur:120},
  {n:'サクラ',   e:'🌸', col:0xFF77AA, s:6, a:6, h:9, d:'花の忍者',
   bc:0xCC4488, hc:0xFFAACC, skin:0xFFDDCC, body:'ninja', img:'models/sakura-2d.jpg',
   desc:'忍の一族の末裔。華麗なドリフト',
   skill:'sakura_drift', skillName:'桜花乱舞',
   skillDesc:'ドリフト性能が爆上がり+ターボ即溜まり', skillCD:420, skillDur:180},
  {n:'ゴルド',   e:'👑', col:0xFFDD00, s:7, a:7, h:7, d:'黄金の王',
   bc:0xBB8800, hc:0xFFEE66, skin:0xEECC88, body:'king', img:'models/gold-2d.jpg',
   desc:'古代王国の王。万能のバランス型',
   skill:'golden_aura', skillName:'ゴールデンオーラ',
   skillDesc:'周囲のリングを引き寄せ、ブースト変換', skillCD:360, skillDur:240}
];

// Body type to GLB model file mapping
var MODEL_FILES = {
  dragon:  'models/blaze.glb',
  mermaid: 'models/aqua.glb',
  golem:   'models/terra.glb',
  phantom: 'models/shadow.glb',
  angel:   'models/sora.glb',
  robot:   'models/mecha.glb',
  ninja:   'models/sakura.glb',
  king:    'models/gold.glb'
};

// Kart types - player can select
var KARTS = [
  {n:'スターダスト', e:'⭐', type:'speed',
   desc:'最高速特化の流線型マシン', sBonus:0.1, aBonus:0, hBonus:-0.002,
   col:0xCCCCCC, style:'long'},
  {n:'サンダーボルト', e:'⚡', type:'balanced',
   desc:'バランス重視の万能マシン', sBonus:0, aBonus:0.001, hBonus:0.001,
   col:0xDDDD44, style:'medium'},
  {n:'タイタン', e:'🛡️', type:'power',
   desc:'重量級パワーマシン', sBonus:-0.05, aBonus:0.002, hBonus:0.003,
   col:0xFF6644, style:'wide'}
];

// Equipment - player picks one before race
var EQUIPMENT = [
  {n:'ニトロタンク', e:'🚀', type:'nitro',
   desc:'ブースト効果の持続時間が50%延長'},
  {n:'ドリフトブースター', e:'💨', type:'drift_up',
   desc:'ドリフトミニターボの溜まりが2倍速い'},
  {n:'プラズマシールド', e:'🛡️', type:'auto_shield',
   desc:'スタン攻撃を1回自動で防ぐ（再充填60秒）'},
  {n:'リアクター', e:'⚡', type:'reactor',
   desc:'固有スキルのクールタイムが25%短縮'}
];

// Environment GLB model file mapping
var ENV_MODEL_FILES = {
  'tree-a':   'models/env-tree-a.glb',
  'tree-b':   'models/env-tree-b.glb',
  'tree-c':   'models/env-tree-c.glb',
  'house-a':  'models/env-house-a.glb',
  'castle':   'models/env-castle.glb',
  'crystal':  'models/env-crystal.glb',
  'mountain': 'models/env-mountain.glb',
  'windmill': 'models/env-windmill.glb',
  'fountain': 'models/env-fountain.glb',
  'archgate': 'models/env-archgate.glb'
};
// Trellisで逆さに出力されたモデルのY反転フラグ
var ENV_MODEL_FLIP_Y = {
  'mountain': true
};

// Energy Ring settings (replaces coins - collect for speed boost)
var RING_BOOST_PER = 0.015;   // speed bonus per ring collected
var RING_MAX = 10;            // max rings held
var RING_DROP_ON_HIT = 3;     // rings lost when hit

// Item definitions (from item boxes on track)
var ITEMS = [
  {n:'ロケット',     e:'🚀', type:'boost'},
  {n:'バナナ爆弾',   e:'💣', type:'trap'},
  {n:'ホーミング弾', e:'🎯', type:'homing'},
  {n:'シールド',     e:'🛡️', type:'shield'},
  {n:'サンダー',     e:'⚡', type:'thunder'}
];

// Race settings
var TOTAL_LAPS = 3;
var NUM_RACERS = 6;
var TRACK_POINTS = 100;
var TRACK_WIDTH = 28;

// Game state
var gameState = 'title';
var raceTime = 0;
var fr = 0;
var isMobile = false;
var selectedChar = 0;
var selectedKart = 1;
var selectedEquip = 0;
